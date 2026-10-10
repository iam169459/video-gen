import asyncio
import json
import os
import subprocess
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from loguru import logger

from app.core.config import settings


class InferenceEngine(str, Enum):
    TRANSFORMERS = "transformers"
    OLLAMA = "ollama"
    LLAMACPP = "llamacpp"
    DIFFUSERS = "diffusers"


@dataclass
class EngineInfo:
    id: str
    name: str
    description: str
    available: bool
    gpu_support: bool
    models_loaded: int = 0
    version: Optional[str] = None


@dataclass
class ModelInfo:
    model_id: str
    local_path: str
    engine: InferenceEngine
    size_gb: float
    loaded: bool = False
    last_used: Optional[datetime] = None


@dataclass
class ModelRunRequest:
    model_id: str
    engine: str
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7
    stream: bool = False


@dataclass
class ModelRunResponse:
    model_id: str
    engine: str
    response: str
    tokens_generated: int
    time_taken: float


class LocalInferenceManager:
    def __init__(self):
        self.engines: Dict[InferenceEngine, EngineInfo] = {}
        self.loaded_models: Dict[str, ModelInfo] = {}
        self._initialize_engines()
    
    def _initialize_engines(self):
        self.engines = {
            InferenceEngine.TRANSFORMERS: EngineInfo(
                id="transformers",
                name="Transformers (Python)",
                description="Full Python/HF Transformers with chain-block support",
                available=True,
                gpu_support=True,
                models_loaded=0,
            ),
            InferenceEngine.OLLAMA: EngineInfo(
                id="ollama",
                name="Ollama",
                description="Native binary, easy model management",
                available=self._check_ollama(),
                gpu_support=True,
                models_loaded=0,
            ),
            InferenceEngine.LLAMACPP: EngineInfo(
                id="llamacpp",
                name="llama.cpp",
                description="CPU/GPU optimized C++ inference",
                available=self._check_llamacpp(),
                gpu_support=True,
                models_loaded=0,
            ),
            InferenceEngine.DIFFUSERS: EngineInfo(
                id="diffusers",
                name="Diffusers (Video)",
                description="Video generation models",
                available=True,
                gpu_support=True,
                models_loaded=0,
            ),
        }
    
    def _check_ollama(self) -> bool:
        return shutil.which("ollama") is not None
    
    def _check_llamacpp(self) -> bool:
        return shutil.which("llama-cli") is not None or shutil.which("llama-server") is not None
    
    async def list_engines(self) -> List[EngineInfo]:
        self.engines[InferenceEngine.OLLAMA].available = self._check_ollama()
        self.engines[InferenceEngine.LLAMACPP].available = self._check_llamacpp()
        return list(self.engines.values())
    
    async def get_model_info(self, model_id: str) -> Optional[ModelInfo]:
        local_path = self._get_local_path(model_id)
        if not local_path.exists():
            return None
        
        size_gb = sum(f.stat().st_size for f in local_path.rglob("*") if f.is_file()) / (1024**3)
        return ModelInfo(
            model_id=model_id,
            local_path=str(local_path),
            engine=InferenceEngine.TRANSFORMERS,
            size_gb=size_gb,
            loaded=model_id in self.loaded_models,
        )
    
    def _get_local_path(self, model_id: str) -> Path:
        safe_name = model_id.replace("/", "_")
        return settings.MODELS_DIR / safe_name
    
    async def run_model(
        self,
        model_id: str,
        engine: str,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        stream: bool = False,
    ) -> ModelRunResponse:
        start_time = asyncio.get_event_loop().time()
        
        if engine == "ollama":
            response = await self._run_ollama(model_id, prompt, max_tokens, temperature)
        elif engine == "llamacpp":
            response = await self._run_llamacpp(model_id, prompt, max_tokens, temperature)
        elif engine == "transformers":
            response = await self._run_transformers(model_id, prompt, max_tokens, temperature)
        else:
            raise ValueError(f"Unknown engine: {engine}")
        
        time_taken = asyncio.get_event_loop().time() - start_time
        tokens = len(response.split())
        
        return ModelRunResponse(
            model_id=model_id,
            engine=engine,
            response=response,
            tokens_generated=tokens,
            time_taken=time_taken,
        )
    
    async def run_model_stream(
        self,
        model_id: str,
        engine: str,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        if engine == "ollama":
            async for chunk in self._run_ollama_stream(model_id, prompt, max_tokens, temperature):
                yield chunk
        elif engine == "llamacpp":
            async for chunk in self._run_llamacpp_stream(model_id, prompt, max_tokens, temperature):
                yield chunk
        elif engine == "transformers":
            async for chunk in self._run_transformers_stream(model_id, prompt, max_tokens, temperature):
                yield chunk
        else:
            raise ValueError(f"Unknown engine: {engine}")
    
    async def _run_ollama(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> str:
        ollama_model = model_id.split("/")[-1].replace("-", ":")
        
        proc = await asyncio.create_subprocess_exec(
            "ollama", "run", ollama_model, prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode != 0:
            raise RuntimeError(f"Ollama error: {stderr.decode()}")
        
        return stdout.decode().strip()
    
    async def _run_ollama_stream(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
        ollama_model = model_id.split("/")[-1].replace("-", ":")
        
        proc = await asyncio.create_subprocess_exec(
            "ollama", "run", ollama_model, prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            yield line.decode().strip()
        
        await proc.wait()
    
    async def _run_llamacpp(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> str:
        local_path = self._get_local_path(model_id)
        model_files = list(local_path.glob("*.gguf")) + list(local_path.glob("*.bin"))
        
        if not model_files:
            raise FileNotFoundError(f"No GGUF model found for {model_id}")
        
        model_file = model_files[0]
        
        proc = await asyncio.create_subprocess_exec(
            "llama-cli",
            "-m", str(model_file),
            "-p", prompt,
            "-n", str(max_tokens),
            "--temp", str(temperature),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode != 0:
            raise RuntimeError(f"llama.cpp error: {stderr.decode()}")
        
        return stdout.decode().strip()
    
    async def _run_llamacpp_stream(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
        local_path = self._get_local_path(model_id)
        model_files = list(local_path.glob("*.gguf")) + list(local_path.glob("*.bin"))
        
        if not model_files:
            raise FileNotFoundError(f"No GGUF model found for {model_id}")
        
        model_file = model_files[0]
        
        proc = await asyncio.create_subprocess_exec(
            "llama-cli",
            "-m", str(model_file),
            "-p", prompt,
            "-n", str(max_tokens),
            "--temp", str(temperature),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        while True:
            chunk = await proc.stdout.read(1024)
            if not chunk:
                break
            yield chunk.decode()
        
        await proc.wait()
    
    async def _run_transformers(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> str:
        from app.chains.block_manager import chain_registry
        
        chain = await chain_registry.get_chain(model_id)
        response = await chain.generate(prompt, max_new_tokens=max_tokens, temperature=temperature, stream=False)
        return response
    
    async def _run_transformers_stream(self, model_id: str, prompt: str, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
        from app.chains.block_manager import chain_registry
        
        chain = await chain_registry.get_chain(model_id)
        async for token in await chain.generate(prompt, max_new_tokens=max_tokens, temperature=temperature, stream=True):
            yield token


local_inference_manager = LocalInferenceManager()