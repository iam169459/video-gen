import asyncio
import hashlib
import json
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple, Union
from contextlib import asynccontextmanager

import torch
import torch.nn as nn
from loguru import logger
from pydantic import BaseModel, Field

from app.core.config import settings


class BlockStatus(str, Enum):
    PENDING = "pending"
    LOADING = "loading"
    READY = "ready"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"
    UNLOADED = "unloaded"


class ProcessingMode(str, Enum):
    SEQUENTIAL = "sequential"
    PIPELINE = "pipeline"
    PARALLEL = "parallel"


@dataclass
class BlockMetadata:
    block_id: str
    name: str
    layer_range: Tuple[int, int]
    parameters: int
    memory_mb: float
    device: str
    status: BlockStatus = BlockStatus.PENDING
    model_ref: Optional[nn.Module] = None
    last_used: float = 0
    load_time: float = 0
    compute_time: float = 0


@dataclass
class ChainConfig:
    model_id: str
    num_blocks: int
    block_size: int
    overlap: int
    processing_mode: ProcessingMode = ProcessingMode.SEQUENTIAL
    device_map: Optional[Dict[int, str]] = None
    offload_to_cpu: bool = True
    use_flash_attention: bool = True


class ChainBlock(ABC):
    def __init__(self, metadata: BlockMetadata, config: ChainConfig):
        self.metadata = metadata
        self.config = config
        self._lock = asyncio.Lock()
        self._input_buffer: Optional[torch.Tensor] = None
        self._output_buffer: Optional[torch.Tensor] = None
    
    @abstractmethod
    async def load(self) -> None:
        pass
    
    @abstractmethod
    async def unload(self) -> None:
        pass
    
    @abstractmethod
    async def forward(self, input_tensor: torch.Tensor) -> torch.Tensor:
        pass
    
    @abstractmethod
    def get_memory_usage(self) -> float:
        pass
    
    async def __aenter__(self):
        await self.load()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.unload()


class TransformerBlock(ChainBlock):
    def __init__(self, metadata: BlockMetadata, config: ChainConfig, layer_module: nn.Module):
        super().__init__(metadata, config)
        self.layer_module = layer_module
        self._original_device = None
    
    async def load(self) -> None:
        async with self._lock:
            if self.metadata.status == BlockStatus.READY:
                return
            
            self.metadata.status = BlockStatus.LOADING
            start_time = time.time()
            
            try:
                target_device = self.metadata.device
                if self.config.offload_to_cpu and target_device == "cuda":
                    self._original_device = next(self.layer_module.parameters()).device
                    self.layer_module = self.layer_module.to("cpu")
                
                if target_device != "cpu":
                    self.layer_module = self.layer_module.to(target_device)
                
                if self.config.use_flash_attention and hasattr(self.layer_module, "config"):
                    self.layer_module.config.use_flash_attention = True
                
                self.layer_module.eval()
                self.metadata.model_ref = self.layer_module
                self.metadata.status = BlockStatus.READY
                self.metadata.load_time = time.time() - start_time
                self.metadata.last_used = time.time()
                
                logger.info(f"Block {self.metadata.block_id} loaded in {self.metadata.load_time:.2f}s on {target_device}")
            except Exception as e:
                self.metadata.status = BlockStatus.ERROR
                logger.error(f"Failed to load block {self.metadata.block_id}: {e}")
                raise
    
    async def unload(self) -> None:
        async with self._lock:
            if self.metadata.status == BlockStatus.UNLOADED:
                return
            
            try:
                if self.metadata.model_ref is not None:
                    if self.config.offload_to_cpu and self._original_device:
                        self.layer_module = self.layer_module.to(self._original_device)
                    del self.metadata.model_ref
                    self.metadata.model_ref = None
                
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                self.metadata.status = BlockStatus.UNLOADED
                logger.debug(f"Block {self.metadata.block_id} unloaded")
            except Exception as e:
                logger.error(f"Error unloading block {self.metadata.block_id}: {e}")
    
    async def forward(self, input_tensor: torch.Tensor) -> torch.Tensor:
        async with self._lock:
            if self.metadata.status != BlockStatus.READY:
                await self.load()
            
            self.metadata.status = BlockStatus.PROCESSING
            start_time = time.time()
            
            try:
                target_device = self.metadata.device
                if input_tensor.device != torch.device(target_device):
                    input_tensor = input_tensor.to(target_device)
                
                with torch.inference_mode():
                    if hasattr(self.layer_module, "forward"):
                        output = self.layer_module(input_tensor)
                        if isinstance(output, tuple):
                            output = output[0]
                    else:
                        output = self.layer_module(input_tensor)
                
                self.metadata.compute_time += time.time() - start_time
                self.metadata.last_used = time.time()
                self.metadata.status = BlockStatus.READY
                
                return output
            except Exception as e:
                self.metadata.status = BlockStatus.ERROR
                logger.error(f"Forward pass failed for block {self.metadata.block_id}: {e}")
                raise
    
    def get_memory_usage(self) -> float:
        if self.metadata.model_ref is None:
            return 0.0
        total_params = sum(p.numel() for p in self.metadata.model_ref.parameters())
        param_size = total_params * 2
        return param_size / (1024 * 1024)


class ChainBlockManager:
    def __init__(self, config: ChainConfig):
        self.config = config
        self.blocks: Dict[str, ChainBlock] = {}
        self.block_order: List[str] = []
        self._current_block_idx = 0
        self._pipeline_queue: asyncio.Queue = asyncio.Queue()
        self._results: Dict[str, asyncio.Future] = {}
        self._running = False
    
    def add_block(self, block: ChainBlock) -> None:
        self.blocks[block.metadata.block_id] = block
        if block.metadata.block_id not in self.block_order:
            self.block_order.append(block.metadata.block_id)
        self.block_order.sort(key=lambda x: self.blocks[x].metadata.layer_range[0])
    
    async def load_all(self) -> None:
        for block_id in self.block_order:
            block = self.blocks[block_id]
            if block.metadata.status != BlockStatus.READY:
                await block.load()
    
    async def unload_all(self) -> None:
        for block_id in reversed(self.block_order):
            block = self.blocks[block_id]
            if block.metadata.status != BlockStatus.UNLOADED:
                await block.unload()
    
    async def process_sequential(self, input_tensor: torch.Tensor) -> torch.Tensor:
        current_input = input_tensor
        for block_id in self.block_order:
            block = self.blocks[block_id]
            current_input = await block.forward(current_input)
        return current_input
    
    async def process_pipeline(self, input_tensor: torch.Tensor) -> torch.Tensor:
        num_blocks = len(self.block_order)
        futures = []
        
        async def process_block(block_id: str, input_data: torch.Tensor) -> torch.Tensor:
            block = self.blocks[block_id]
            return await block.forward(input_data)
        
        current_input = input_tensor
        for i, block_id in enumerate(self.block_order):
            if i == num_blocks - 1:
                current_input = await process_block(block_id, current_input)
            else:
                future = asyncio.create_task(process_block(block_id, current_input))
                futures.append((block_id, future))
                current_input = None
        
        for block_id, future in futures:
            current_input = await future
        
        return current_input
    
    async def process(self, input_tensor: torch.Tensor) -> torch.Tensor:
        if self.config.processing_mode == ProcessingMode.PIPELINE:
            return await self.process_pipeline(input_tensor)
        return await self.process_sequential(input_tensor)
    
    def get_memory_stats(self) -> Dict[str, Any]:
        total_memory = 0
        loaded_blocks = 0
        for block in self.blocks.values():
            mem = block.get_memory_usage()
            total_memory += mem
            if block.metadata.status == BlockStatus.READY:
                loaded_blocks += 1
        
        return {
            "total_blocks": len(self.blocks),
            "loaded_blocks": loaded_blocks,
            "total_memory_mb": total_memory,
            "blocks": {
                bid: {
                    "status": b.metadata.status.value,
                    "memory_mb": b.get_memory_usage(),
                    "layer_range": b.metadata.layer_range,
                    "compute_time": b.metadata.compute_time,
                }
                for bid, b in self.blocks.items()
            }
        }
    
    async def optimize_memory(self, target_memory_mb: float) -> None:
        current_memory = sum(b.get_memory_usage() for b in self.blocks.values())
        if current_memory <= target_memory_mb:
            return
        
        sorted_blocks = sorted(
            self.blocks.values(),
            key=lambda b: b.metadata.last_used
        )
        
        for block in sorted_blocks:
            if current_memory <= target_memory_mb:
                break
            if block.metadata.status == BlockStatus.READY and block.metadata.block_id != self.block_order[0]:
                await block.unload()
                current_memory = sum(b.get_memory_usage() for b in self.blocks.values())


class ModelChain:
    def __init__(self, model_id: str, config: Optional[ChainConfig] = None):
        self.model_id = model_id
        self.config = config or ChainConfig(
            model_id=model_id,
            num_blocks=settings.CHAIN_MAX_BLOCKS,
            block_size=settings.CHAIN_BLOCK_SIZE,
            overlap=settings.CHAIN_OVERLAP,
        )
        self.manager: Optional[ChainBlockManager] = None
        self.tokenizer = None
        self.model = None
        self._initialized = False
    
    async def initialize(self) -> None:
        if self._initialized:
            return
        
        from transformers import AutoTokenizer, AutoModelForCausalLM, AutoConfig
        
        logger.info(f"Initializing chain for model: {self.model_id}")
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        model_config = AutoConfig.from_pretrained(self.model_id)
        num_layers = getattr(model_config, "num_hidden_layers", 32)
        
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_id,
            torch_dtype=torch.float16 if settings.USE_FP16 else torch.float32,
            device_map="cpu",
            low_cpu_mem_usage=True,
        )
        
        self.manager = ChainBlockManager(self.config)
        
        layers_per_block = max(1, num_layers // self.config.num_blocks)
        for i in range(self.config.num_blocks):
            start_layer = i * layers_per_block
            end_layer = min((i + 1) * layers_per_block, num_layers)
            
            if start_layer >= num_layers:
                break
            
            block_layers = nn.Sequential(*[
                self.model.model.layers[j] for j in range(start_layer, end_layer)
            ])
            
            device = "cuda" if torch.cuda.is_available() else "cpu"
            if self.config.device_map and i in self.config.device_map:
                device = self.config.device_map[i]
            
            metadata = BlockMetadata(
                block_id=f"block_{i}",
                name=f"TransformerBlock_{start_layer}_{end_layer}",
                layer_range=(start_layer, end_layer),
                parameters=sum(p.numel() for p in block_layers.parameters()),
                memory_mb=sum(p.numel() * 2 for p in block_layers.parameters()) / (1024 * 1024),
                device=device,
            )
            
            block = TransformerBlock(metadata, self.config, block_layers)
            self.manager.add_block(block)
        
        self._initialized = True
        logger.info(f"Chain initialized with {len(self.manager.blocks)} blocks")
    
    async def generate(
        self,
        prompt: str,
        max_new_tokens: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9,
        stream: bool = False,
    ) -> Union[str, AsyncGenerator[str, None]]:
        if not self._initialized:
            await self.initialize()
        
        input_ids = self.tokenizer.encode(prompt, return_tensors="pt")
        device = next(self.model.parameters()).device
        input_ids = input_ids.to(device)
        
        if stream:
            return self._generate_stream(input_ids, max_new_tokens, temperature, top_p)
        return await self._generate_complete(input_ids, max_new_tokens, temperature, top_p)
    
    async def _generate_complete(
        self,
        input_ids: torch.Tensor,
        max_new_tokens: int,
        temperature: float,
        top_p: float,
    ) -> str:
        generated = input_ids
        
        for _ in range(max_new_tokens):
            hidden_states = self.model.model.embed_tokens(generated[:, -1:])
            
            for i in range(len(self.model.model.layers)):
                block_idx = i // (len(self.model.model.layers) // self.config.num_blocks)
                block_idx = min(block_idx, len(self.manager.block_order) - 1)
                block = self.manager.blocks[self.manager.block_order[block_idx]]
                hidden_states = await block.forward(hidden_states)
            
            hidden_states = self.model.model.norm(hidden_states)
            logits = self.model.lm_head(hidden_states)
            
            next_token_logits = logits[:, -1, :] / temperature
            probs = torch.softmax(next_token_logits, dim=-1)
            
            if top_p < 1.0:
                sorted_probs, sorted_indices = torch.sort(probs, descending=True)
                cumsum_probs = torch.cumsum(sorted_probs, dim=-1)
                sorted_indices_to_remove = cumsum_probs > top_p
                sorted_indices_to_remove[:, 1:] = sorted_indices_to_remove[:, :-1].clone()
                sorted_indices_to_remove[:, 0] = 0
                indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
                probs[indices_to_remove] = 0
                probs = probs / probs.sum(dim=-1, keepdim=True)
            
            next_token = torch.multinomial(probs, num_samples=1)
            generated = torch.cat([generated, next_token], dim=1)
            
            if next_token.item() == self.tokenizer.eos_token_id:
                break
        
        return self.tokenizer.decode(generated[0], skip_special_tokens=True)
    
    async def _generate_stream(
        self,
        input_ids: torch.Tensor,
        max_new_tokens: int,
        temperature: float,
        top_p: float,
    ) -> AsyncGenerator[str, None]:
        generated = input_ids
        
        for _ in range(max_new_tokens):
            hidden_states = self.model.model.embed_tokens(generated[:, -1:])
            
            for i in range(len(self.model.model.layers)):
                block_idx = i // (len(self.model.model.layers) // self.config.num_blocks)
                block_idx = min(block_idx, len(self.manager.block_order) - 1)
                block = self.manager.blocks[self.manager.block_order[block_idx]]
                hidden_states = await block.forward(hidden_states)
            
            hidden_states = self.model.model.norm(hidden_states)
            logits = self.model.lm_head(hidden_states)
            
            next_token_logits = logits[:, -1, :] / temperature
            probs = torch.softmax(next_token_logits, dim=-1)
            
            if top_p < 1.0:
                sorted_probs, sorted_indices = torch.sort(probs, descending=True)
                cumsum_probs = torch.cumsum(sorted_probs, dim=-1)
                sorted_indices_to_remove = cumsum_probs > top_p
                sorted_indices_to_remove[:, 1:] = sorted_indices_to_remove[:, :-1].clone()
                sorted_indices_to_remove[:, 0] = 0
                indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
                probs[indices_to_remove] = 0
                probs = probs / probs.sum(dim=-1, keepdim=True)
            
            next_token = torch.multinomial(probs, num_samples=1)
            generated = torch.cat([generated, next_token], dim=1)
            
            token_text = self.tokenizer.decode(next_token[0], skip_special_tokens=True)
            yield token_text
            
            if next_token.item() == self.tokenizer.eos_token_id:
                break
    
    async def cleanup(self) -> None:
        if self.manager:
            await self.manager.unload_all()
        if self.model:
            del self.model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        self._initialized = False
    
    def get_stats(self) -> Dict[str, Any]:
        if not self.manager:
            return {"initialized": False}
        stats = self.manager.get_memory_stats()
        stats["model_id"] = self.model_id
        stats["initialized"] = self._initialized
        return stats


class ChainRegistry:
    _instance = None
    _chains: Dict[str, ModelChain] = {}
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def get_chain(self, model_id: str, config: Optional[ChainConfig] = None) -> ModelChain:
        async with self._lock:
            if model_id not in self._chains:
                self._chains[model_id] = ModelChain(model_id, config)
            return self._chains[model_id]
    
    async def release_chain(self, model_id: str) -> None:
        async with self._lock:
            if model_id in self._chains:
                await self._chains[model_id].cleanup()
                del self._chains[model_id]
    
    async def release_all(self) -> None:
        async with self._lock:
            for chain in self._chains.values():
                await chain.cleanup()
            self._chains.clear()
    
    def get_all_stats(self) -> Dict[str, Any]:
        return {mid: chain.get_stats() for mid, chain in self._chains.items()}


chain_registry = ChainRegistry()