import asyncio
import hashlib
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import torch
from diffusers import (
    StableVideoDiffusionPipeline,
    AnimateDiffPipeline,
    MotionAdapter,
    DDIMScheduler,
    AutoencoderKL,
)
from diffusers.utils import export_to_video, load_image
from loguru import logger
from PIL import Image
from pydantic import BaseModel, Field

from app.core.config import settings
from app.chains.block_manager import chain_registry


class VideoModelType(str, Enum):
    STABLE_VIDEO_DIFFUSION = "stable_video_diffusion"
    STABLE_VIDEO_DIFFUSION_XT = "stable_video_diffusion_xt"
    ANIMATEDIFF = "animatediff"
    ANIMATEDIFF_LIGHTNING = "animatediff_lightning"
    HOTSHOT_XL = "hotshot_xl"
    CUSTOM = "custom"


class VideoGenerationStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    PREPROCESSING = "preprocessing"
    GENERATING = "generating"
    POSTPROCESSING = "postprocessing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class VideoGenerationParams:
    prompt: str
    negative_prompt: str = ""
    image: Optional[Image.Image] = None
    image_path: Optional[str] = None
    model_type: VideoModelType = VideoModelType.STABLE_VIDEO_DIFFUSION_XT
    model_id: Optional[str] = None
    num_frames: int = 25
    fps: int = 8
    width: int = 576
    height: int = 1024
    num_inference_steps: int = 25
    guidance_scale: float = 7.5
    motion_bucket_id: int = 127
    noise_aug_strength: float = 0.02
    seed: Optional[int] = None
    decode_chunk_size: int = 8
    output_format: str = "mp4"
    quality: str = "high"


@dataclass
class VideoGenerationResult:
    task_id: str
    status: VideoGenerationStatus
    params: VideoGenerationParams
    output_path: Optional[str] = None
    preview_path: Optional[str] = None
    error: Optional[str] = None
    progress: float = 0.0
    current_step: int = 0
    total_steps: int = 0
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class VideoModelLoader:
    _pipelines: Dict[str, Any] = {}
    _locks: Dict[str, asyncio.Lock] = {}
    
    @classmethod
    def get_lock(cls, model_id: str) -> asyncio.Lock:
        if model_id not in cls._locks:
            cls._locks[model_id] = asyncio.Lock()
        return cls._locks[model_id]
    
    @classmethod
    async def load_pipeline(cls, model_type: VideoModelType, model_id: Optional[str] = None) -> Any:
        cache_key = f"{model_type.value}:{model_id or 'default'}"
        
        if cache_key in cls._pipelines:
            return cls._pipelines[cache_key]
        
        async with cls.get_lock(cache_key):
            if cache_key in cls._pipelines:
                return cls._pipelines[cache_key]
            
            logger.info(f"Loading video model: {cache_key}")
            
            try:
                pipeline = await cls._create_pipeline(model_type, model_id)
                cls._pipelines[cache_key] = pipeline
                logger.info(f"Model {cache_key} loaded successfully")
                return pipeline
            except Exception as e:
                logger.error(f"Failed to load model {cache_key}: {e}")
                raise
    
    @classmethod
    async def _create_pipeline(cls, model_type: VideoModelType, model_id: Optional[str]) -> Any:
        device = settings.DEVICE
        torch_dtype = torch.float16 if settings.USE_FP16 else torch.float32
        
        if model_type == VideoModelType.STABLE_VIDEO_DIFFUSION:
            model_id = model_id or "stabilityai/stable-video-diffusion-img2vid"
            pipeline = StableVideoDiffusionPipeline.from_pretrained(
                model_id,
                torch_dtype=torch_dtype,
                variant="fp16" if settings.USE_FP16 else None,
            )
        
        elif model_type == VideoModelType.STABLE_VIDEO_DIFFUSION_XT:
            model_id = model_id or "stabilityai/stable-video-diffusion-img2vid-xt"
            pipeline = StableVideoDiffusionPipeline.from_pretrained(
                model_id,
                torch_dtype=torch_dtype,
                variant="fp16" if settings.USE_FP16 else None,
            )
        
        elif model_type == VideoModelType.ANIMATEDIFF:
            model_id = model_id or "guoyww/animatediff"
            adapter = MotionAdapter.from_pretrained(model_id, torch_dtype=torch_dtype)
            pipeline = AnimateDiffPipeline.from_pretrained(
                "runwayml/stable-diffusion-v1-5",
                motion_adapter=adapter,
                torch_dtype=torch_dtype,
            )
            pipeline.scheduler = DDIMScheduler.from_config(pipeline.scheduler.config)
        
        elif model_type == VideoModelType.ANIMATEDIFF_LIGHTNING:
            model_id = model_id or "ByteDance/AnimateDiff-Lightning"
            adapter = MotionAdapter.from_pretrained(model_id, torch_dtype=torch_dtype)
            pipeline = AnimateDiffPipeline.from_pretrained(
                "runwayml/stable-diffusion-v1-5",
                motion_adapter=adapter,
                torch_dtype=torch_dtype,
            )
            pipeline.scheduler = DDIMScheduler.from_config(pipeline.scheduler.config)
        
        else:
            raise ValueError(f"Unsupported model type: {model_type}")
        
        pipeline = pipeline.to(device)
        
        if settings.ENABLE_XFORMERS:
            try:
                pipeline.enable_xformers_memory_efficient_attention()
            except Exception:
                logger.warning("xformers not available, using default attention")
        
        if settings.ENABLE_CPU_OFFLOAD:
            pipeline.enable_model_cpu_offload()
        else:
            pipeline.enable_vae_slicing()
            pipeline.enable_vae_tiling()
        
        return pipeline
    
    @classmethod
    async def unload_pipeline(cls, model_type: VideoModelType, model_id: Optional[str] = None) -> None:
        cache_key = f"{model_type.value}:{model_id or 'default'}"
        if cache_key in cls._pipelines:
            del cls._pipelines[cache_key]
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            logger.info(f"Model {cache_key} unloaded")
    
    @classmethod
    async def unload_all(cls) -> None:
        cls._pipelines.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


class VideoGenerator:
    def __init__(self):
        self.active_tasks: Dict[str, VideoGenerationResult] = {}
        self._task_queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
    
    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker())
        logger.info("Video generator started")
    
    async def stop(self) -> None:
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        await VideoModelLoader.unload_all()
        logger.info("Video generator stopped")
    
    async def generate_video(self, params: VideoGenerationParams) -> VideoGenerationResult:
        task_id = str(uuid.uuid4())[:8]
        
        result = VideoGenerationResult(
            task_id=task_id,
            status=VideoGenerationStatus.QUEUED,
            params=params,
            total_steps=params.num_inference_steps,
        )
        
        self.active_tasks[task_id] = result
        await self._task_queue.put((task_id, params))
        
        return result
    
    async def get_task_status(self, task_id: str) -> Optional[VideoGenerationResult]:
        return self.active_tasks.get(task_id)
    
    async def cancel_task(self, task_id: str) -> bool:
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            if task.status in [VideoGenerationStatus.PENDING, VideoGenerationStatus.QUEUED, VideoGenerationStatus.GENERATING]:
                task.status = VideoGenerationStatus.FAILED
                task.error = "Cancelled by user"
                task.end_time = datetime.now()
                return True
        return False
    
    def list_tasks(self, status: Optional[VideoGenerationStatus] = None) -> List[VideoGenerationResult]:
        tasks = list(self.active_tasks.values())
        if status:
            tasks = [t for t in tasks if t.status == status]
        return sorted(tasks, key=lambda x: x.start_time, reverse=True)
    
    async def _worker(self) -> None:
        while self._running:
            try:
                task_id, params = await asyncio.wait_for(
                    self._task_queue.get(),
                    timeout=1.0
                )
                await self._process_task(task_id, params)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Worker error: {e}")
    
    async def _process_task(self, task_id: str, params: VideoGenerationParams) -> None:
        result = self.active_tasks[task_id]
        
        try:
            result.status = VideoGenerationStatus.PREPROCESSING
            result.progress = 0.1
            
            image = await self._prepare_image(params)
            
            result.status = VideoGenerationStatus.GENERATING
            result.progress = 0.2
            
            pipeline = await VideoModelLoader.load_pipeline(params.model_type, params.model_id)
            
            frames = await self._generate_frames(pipeline, image, params, result)
            
            result.status = VideoGenerationStatus.POSTPROCESSING
            result.progress = 0.9
            
            output_path = await self._save_video(frames, params, task_id)
            preview_path = await self._create_preview(frames, task_id)
            
            result.output_path = output_path
            result.preview_path = preview_path
            result.status = VideoGenerationStatus.COMPLETED
            result.progress = 1.0
            result.end_time = datetime.now()
            result.metadata = {
                "model_type": params.model_type.value,
                "model_id": params.model_id,
                "duration_seconds": len(frames) / params.fps,
                "file_size_mb": os.path.getsize(output_path) / (1024 * 1024),
            }
            
            logger.info(f"Task {task_id} completed: {output_path}")
            
        except Exception as e:
            result.status = VideoGenerationStatus.FAILED
            result.error = str(e)
            result.end_time = datetime.now()
            logger.error(f"Task {task_id} failed: {e}")
    
    async def _prepare_image(self, params: VideoGenerationParams) -> Image.Image:
        if params.image:
            return params.image.resize((params.width, params.height))
        
        if params.image_path:
            image = load_image(params.image_path)
            return image.resize((params.width, params.height))
        
        raise ValueError("Either image or image_path must be provided")
    
    async def _generate_frames(
        self,
        pipeline: Any,
        image: Image.Image,
        params: VideoGenerationParams,
        result: VideoGenerationResult,
    ) -> List[np.ndarray]:
        
        generator = torch.Generator(device=settings.DEVICE)
        if params.seed is not None:
            generator.manual_seed(params.seed)
        else:
            generator.seed()
        
        if params.model_type in [VideoModelType.STABLE_VIDEO_DIFFUSION, VideoModelType.STABLE_VIDEO_DIFFUSION_XT]:
            frames = pipeline(
                image,
                decode_chunk_size=params.decode_chunk_size,
                generator=generator,
                num_frames=params.num_frames,
                num_inference_steps=params.num_inference_steps,
                motion_bucket_id=params.motion_bucket_id,
                noise_aug_strength=params.noise_aug_strength,
            ).frames[0]
        
        elif params.model_type in [VideoModelType.ANIMATEDIFF, VideoModelType.ANIMATEDIFF_LIGHTNING]:
            frames = pipeline(
                params.prompt,
                negative_prompt=params.negative_prompt,
                num_frames=params.num_frames,
                guidance_scale=params.guidance_scale,
                num_inference_steps=params.num_inference_steps,
                generator=generator,
                width=params.width,
                height=params.height,
            ).frames[0]
        
        else:
            raise ValueError(f"Unsupported model type: {params.model_type}")
        
        result.current_step = params.num_inference_steps
        result.progress = 0.8
        
        return [(frame * 255).astype(np.uint8) for frame in frames]
    
    async def _save_video(
        self,
        frames: List[np.ndarray],
        params: VideoGenerationParams,
        task_id: str,
    ) -> str:
        output_dir = settings.OUTPUT_DIR / datetime.now().strftime("%Y%m%d")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        filename = f"{task_id}_{params.model_type.value}.{params.output_format}"
        output_path = output_dir / filename
        
        if params.output_format == "mp4":
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(
                str(output_path),
                fourcc,
                params.fps,
                (params.width, params.height),
            )
            for frame in frames:
                if frame.shape[2] == 3:
                    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                writer.write(frame)
            writer.release()
        
        elif params.output_format == "gif":
            pil_frames = [Image.fromarray(frame) for frame in frames]
            pil_frames[0].save(
                output_path,
                save_all=True,
                append_images=pil_frames[1:],
                duration=1000 // params.fps,
                loop=0,
            )
        
        return str(output_path)
    
    async def _create_preview(self, frames: List[np.ndarray], task_id: str) -> str:
        preview_dir = settings.OUTPUT_DIR / "previews"
        preview_dir.mkdir(parents=True, exist_ok=True)
        
        preview_path = preview_dir / f"{task_id}_preview.gif"
        
        sample_frames = frames[::max(1, len(frames) // 10)][:10]
        pil_frames = [Image.fromarray(frame).resize((256, 256)) for frame in sample_frames]
        
        pil_frames[0].save(
            preview_path,
            save_all=True,
            append_images=pil_frames[1:],
            duration=200,
            loop=0,
        )
        
        return str(preview_path)


video_generator = VideoGenerator()


class VideoModelInfo(BaseModel):
    type: VideoModelType
    id: str
    name: str
    description: str
    resolution: Tuple[int, int]
    max_frames: int
    recommended_fps: int
    vram_required_gb: float
    features: List[str]


AVAILABLE_VIDEO_MODELS = [
    VideoModelInfo(
        type=VideoModelType.STABLE_VIDEO_DIFFUSION,
        id="stabilityai/stable-video-diffusion-img2vid",
        name="Stable Video Diffusion",
        description="Base SVD model for image-to-video generation",
        resolution=(576, 1024),
        max_frames=25,
        recommended_fps=8,
        vram_required_gb=8.0,
        features=["img2vid", "high_quality", "14_frames"],
    ),
    VideoModelInfo(
        type=VideoModelType.STABLE_VIDEO_DIFFUSION_XT,
        id="stabilityai/stable-video-diffusion-img2vid-xt",
        name="Stable Video Diffusion XT",
        description="Extended SVD with 25 frames support",
        resolution=(576, 1024),
        max_frames=25,
        recommended_fps=8,
        vram_required_gb=10.0,
        features=["img2vid", "high_quality", "25_frames", "better_motion"],
    ),
    VideoModelInfo(
        type=VideoModelType.ANIMATEDIFF,
        id="guoyww/animatediff",
        name="AnimateDiff",
        description="Text-to-video with motion adapter",
        resolution=(512, 512),
        max_frames=16,
        recommended_fps=8,
        vram_required_gb=6.0,
        features=["text2vid", "motion_modules", "customizable"],
    ),
    VideoModelInfo(
        type=VideoModelType.ANIMATEDIFF_LIGHTNING,
        id="ByteDance/AnimateDiff-Lightning",
        name="AnimateDiff Lightning",
        description="Fast 4-step text-to-video generation",
        resolution=(512, 512),
        max_frames=16,
        recommended_fps=8,
        vram_required_gb=4.0,
        features=["text2vid", "4_step", "fast", "low_vram"],
    ),
]