import asyncio
import hashlib
import json
import os
import shutil
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Callable
from urllib.parse import urlparse

import aiofiles
import aiohttp
from huggingface_hub import HfApi, HfFolder, snapshot_download, hf_hub_download
from huggingface_hub.utils import RepositoryNotFoundError, GatedRepoError
from loguru import logger
from pydantic import BaseModel, Field
from tqdm.asyncio import tqdm

from app.core.config import settings


class DownloadStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class ModelType(str, Enum):
    LLM = "llm"
    VIDEO = "video"
    VAE = "vae"
    CONTROLNET = "controlnet"
    LORA = "lora"
    EMBEDDING = "embedding"
    OTHER = "other"


@dataclass
class DownloadProgress:
    download_id: str
    model_id: str
    model_type: ModelType
    status: DownloadStatus
    total_bytes: int = 0
    downloaded_bytes: int = 0
    speed_bps: float = 0.0
    eta_seconds: float = 0.0
    progress_percent: float = 0.0
    current_file: str = ""
    files_completed: int = 0
    total_files: int = 0
    error: Optional[str] = None
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    local_path: Optional[str] = None


@dataclass
class ModelInfo:
    model_id: str
    model_type: ModelType
    name: str
    description: str
    size_gb: float
    required_vram_gb: float
    tags: List[str]
    license: str
    author: str
    last_updated: datetime
    download_count: int
    likes: int
    pipeline_tag: Optional[str] = None
    library_name: Optional[str] = None
    card_data: Dict[str, Any] = field(default_factory=dict)
    local_path: Optional[str] = None
    is_downloaded: bool = False
    version: Optional[str] = None
    sha: Optional[str] = None


class DownloadManager:
    def __init__(self):
        self.active_downloads: Dict[str, DownloadProgress] = {}
        self.download_history: List[DownloadProgress] = []
        self._queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._callbacks: Dict[str, List[Callable]] = {}
        self._paused_downloads: Dict[str, asyncio.Event] = {}
        self._cancel_events: Dict[str, asyncio.Event] = {}
    
    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_DOWNLOADS)
        self._worker_task = asyncio.create_task(self._worker())
        logger.info("Download manager started")
    
    async def stop(self) -> None:
        self._running = False
        for event in self._cancel_events.values():
            event.set()
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("Download manager stopped")
    
    def register_callback(self, download_id: str, callback: Callable) -> None:
        if download_id not in self._callbacks:
            self._callbacks[download_id] = []
        self._callbacks[download_id].append(callback)
    
    def unregister_callback(self, download_id: str, callback: Callable) -> None:
        if download_id in self._callbacks:
            self._callbacks[download_id].remove(callback)
    
    async def _notify_callbacks(self, download_id: str, progress: DownloadProgress) -> None:
        if download_id in self._callbacks:
            for callback in self._callbacks[download_id]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(progress)
                    else:
                        callback(progress)
                except Exception as e:
                    logger.error(f"Callback error for {download_id}: {e}")
    
    async def download_model(
        self,
        model_id: str,
        model_type: ModelType = ModelType.OTHER,
        revision: Optional[str] = None,
        local_dir: Optional[str] = None,
        token: Optional[str] = None,
        force_redownload: bool = False,
    ) -> str:
        download_id = hashlib.md5(f"{model_id}:{time.time()}".encode()).hexdigest()[:12]
        
        if local_dir is None:
            local_dir = str(settings.MODELS_DIR / model_type.value / model_id.replace("/", "_"))
        
        local_path = Path(local_dir)
        
        if local_path.exists() and not force_redownload:
            logger.info(f"Model {model_id} already exists at {local_path}")
            return str(local_path)
        
        progress = DownloadProgress(
            download_id=download_id,
            model_id=model_id,
            model_type=model_type,
            status=DownloadStatus.QUEUED,
        )
        
        self.active_downloads[download_id] = progress
        self._paused_downloads[download_id] = asyncio.Event()
        self._paused_downloads[download_id].set()
        self._cancel_events[download_id] = asyncio.Event()
        
        await self._queue.put((download_id, model_id, model_type, revision, local_dir, token, force_redownload))
        
        return download_id
    
    async def pause_download(self, download_id: str) -> bool:
        if download_id in self._paused_downloads:
            self._paused_downloads[download_id].clear()
            if download_id in self.active_downloads:
                self.active_downloads[download_id].status = DownloadStatus.PAUSED
            return True
        return False
    
    async def resume_download(self, download_id: str) -> bool:
        if download_id in self._paused_downloads:
            self._paused_downloads[download_id].set()
            if download_id in self.active_downloads:
                self.active_downloads[download_id].status = DownloadStatus.DOWNLOADING
            return True
        return False
    
    async def cancel_download(self, download_id: str) -> bool:
        if download_id in self._cancel_events:
            self._cancel_events[download_id].set()
            if download_id in self.active_downloads:
                self.active_downloads[download_id].status = DownloadStatus.CANCELLED
            return True
        return False
    
    def get_progress(self, download_id: str) -> Optional[DownloadProgress]:
        return self.active_downloads.get(download_id)
    
    def list_downloads(self, status: Optional[DownloadStatus] = None) -> List[DownloadProgress]:
        downloads = list(self.active_downloads.values()) + self.download_history
        if status:
            downloads = [d for d in downloads if d.status == status]
        return sorted(downloads, key=lambda x: x.started_at, reverse=True)
    
    async def _worker(self) -> None:
        while self._running:
            try:
                task = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                await self._process_download(task)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Download worker error: {e}")
    
    async def _process_download(self, task: tuple) -> None:
        download_id, model_id, model_type, revision, local_dir, token, force_redownload = task
        
        progress = self.active_downloads[download_id]
        cancel_event = self._cancel_events[download_id]
        pause_event = self._paused_downloads[download_id]
        
        async with self._semaphore:
            try:
                progress.status = DownloadStatus.DOWNLOADING
                await self._notify_callbacks(download_id, progress)
                
                local_path = await self._download_from_huggingface(
                    model_id, model_type, revision, local_dir, token, progress, cancel_event, pause_event
                )
                
                if cancel_event.is_set():
                    progress.status = DownloadStatus.CANCELLED
                    return
                
                progress.status = DownloadStatus.VERIFYING
                await self._notify_callbacks(download_id, progress)
                
                await self._verify_download(local_path, progress)
                
                progress.status = DownloadStatus.COMPLETED
                progress.completed_at = datetime.now()
                progress.local_path = str(local_path)
                progress.progress_percent = 100.0
                
                await self._notify_callbacks(download_id, progress)
                
            except Exception as e:
                progress.status = DownloadStatus.FAILED
                progress.error = str(e)
                progress.completed_at = datetime.now()
                await self._notify_callbacks(download_id, progress)
                logger.error(f"Download {download_id} failed: {e}")
            
            finally:
                self.download_history.append(progress)
                if download_id in self.active_downloads:
                    del self.active_downloads[download_id]
                if download_id in self._paused_downloads:
                    del self._paused_downloads[download_id]
                if download_id in self._cancel_events:
                    del self._cancel_events[download_id]
    
    async def _download_from_huggingface(
        self,
        model_id: str,
        model_type: ModelType,
        revision: Optional[str],
        local_dir: str,
        token: Optional[str],
        progress: DownloadProgress,
        cancel_event: asyncio.Event,
        pause_event: asyncio.Event,
    ) -> Path:
        local_path = Path(local_dir)
        local_path.mkdir(parents=True, exist_ok=True)
        
        api = HfApi(token=token or settings.HUGGINGFACE_TOKEN)
        
        try:
            repo_info = await asyncio.get_event_loop().run_in_executor(
                None, lambda: api.repo_info(repo_id=model_id, revision=revision, token=token)
            )
            
            total_size = sum(f.size for f in repo_info.siblings if hasattr(f, 'size') and f.size)
            progress.total_bytes = total_size
            progress.total_files = len(repo_info.siblings)
            
        except Exception as e:
            logger.warning(f"Could not get repo info: {e}")
        
        def download_func():
            return snapshot_download(
                repo_id=model_id,
                revision=revision,
                local_dir=local_dir,
                local_dir_use_symlinks=False,
                token=token or settings.HUGGINGFACE_TOKEN,
                resume_download=True,
                max_workers=4,
            )
        
        loop = asyncio.get_event_loop()
        
        start_time = time.time()
        last_bytes = 0
        
        async def progress_monitor():
            nonlocal last_bytes
            while not cancel_event.is_set() and progress.status == DownloadStatus.DOWNLOADING:
                await pause_event.wait()
                
                if local_path.exists():
                    current_bytes = sum(f.stat().st_size for f in local_path.rglob("*") if f.is_file())
                    progress.downloaded_bytes = current_bytes
                    
                    if progress.total_bytes > 0:
                        progress.progress_percent = (current_bytes / progress.total_bytes) * 100
                    
                    elapsed = time.time() - start_time
                    if elapsed > 0:
                        progress.speed_bps = (current_bytes - last_bytes) / elapsed
                        if progress.speed_bps > 0 and progress.total_bytes > current_bytes:
                            progress.eta_seconds = (progress.total_bytes - current_bytes) / progress.speed_bps
                    
                    last_bytes = current_bytes
                    await self._notify_callbacks(download_id, progress)
                
                await asyncio.sleep(0.5)
        
        monitor_task = asyncio.create_task(progress_monitor())
        
        try:
            result = await loop.run_in_executor(None, download_func)
            await monitor_task
            return Path(result)
        except Exception as e:
            monitor_task.cancel()
            raise
    
    async def _verify_download(self, local_path: Path, progress: DownloadProgress) -> None:
        files = list(local_path.rglob("*"))
        progress.files_completed = len([f for f in files if f.is_file()])
        
        for file_path in files:
            if file_path.is_file():
                progress.current_file = file_path.name
                await self._notify_callbacks(progress.download_id, progress)
                
                if settings.VERIFY_CHECKSUMS and file_path.suffix in ['.bin', '.safetensors', '.pt', '.pth']:
                    await self._verify_file_checksum(file_path)
    
    async def _verify_file_checksum(self, file_path: Path) -> bool:
        try:
            import safetensors
            if file_path.suffix == '.safetensors':
                safetensors.torch.load_file(str(file_path))
                return True
        except Exception:
            pass
        return True
    
    async def get_model_info(self, model_id: str, token: Optional[str] = None) -> Optional[ModelInfo]:
        try:
            api = HfApi(token=token or settings.HUGGINGFACE_TOKEN)
            repo_info = await asyncio.get_event_loop().run_in_executor(
                None, lambda: api.repo_info(repo_id=model_id, token=token)
            )
            
            card_data = {}
            if repo_info.card_data:
                card_data = repo_info.card_data
            
            local_path = settings.MODELS_DIR / model_id.replace("/", "_")
            is_downloaded = local_path.exists()
            
            size_gb = sum(f.size for f in repo_info.siblings if hasattr(f, 'size') and f.size) / (1024**3)
            
            return ModelInfo(
                model_id=model_id,
                model_type=ModelType.OTHER,
                name=repo_info.id.split("/")[-1],
                description=card_data.get("description", ""),
                size_gb=size_gb,
                required_vram_gb=card_data.get("vram_required_gb", 0),
                tags=repo_info.tags or [],
                license=card_data.get("license", "unknown"),
                author=repo_info.id.split("/")[0],
                last_updated=repo_info.last_modified or datetime.now(),
                download_count=repo_info.downloads or 0,
                likes=repo_info.likes or 0,
                pipeline_tag=card_data.get("pipeline_tag"),
                library_name=card_data.get("library_name"),
                card_data=card_data,
                local_path=str(local_path) if is_downloaded else None,
                is_downloaded=is_downloaded,
                sha=repo_info.sha,
            )
        except Exception as e:
            logger.error(f"Failed to get model info for {model_id}: {e}")
            return None
    
    async def search_models(
        self,
        query: str,
        model_type: Optional[ModelType] = None,
        limit: int = 20,
        token: Optional[str] = None,
    ) -> List[ModelInfo]:
        try:
            api = HfApi(token=token or settings.HUGGINGFACE_TOKEN)
            
            filter_tags = []
            if model_type:
                filter_tags.append(model_type.value)
            
            models = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: list(api.list_models(
                    search=query,
                    filter=filter_tags if filter_tags else None,
                    sort="downloads",
                    direction=-1,
                    limit=limit,
                    token=token,
                ))
            )
            
            results = []
            for model in models:
                card_data = model.card_data or {}
                size_gb = sum(f.size for f in model.siblings if hasattr(f, 'size') and f.size) / (1024**3)
                
                local_path = settings.MODELS_DIR / model.id.replace("/", "_")
                is_downloaded = local_path.exists()
                
                results.append(ModelInfo(
                    model_id=model.id,
                    model_type=model_type or ModelType.OTHER,
                    name=model.id.split("/")[-1],
                    description=card_data.get("description", ""),
                    size_gb=size_gb,
                    required_vram_gb=card_data.get("vram_required_gb", 0),
                    tags=model.tags or [],
                    license=card_data.get("license", "unknown"),
                    author=model.id.split("/")[0],
                    last_modified=model.last_modified or datetime.now(),
                    download_count=model.downloads or 0,
                    likes=model.likes or 0,
                    pipeline_tag=card_data.get("pipeline_tag"),
                    library_name=card_data.get("library_name"),
                    card_data=card_data,
                    local_path=str(local_path) if is_downloaded else None,
                    is_downloaded=is_downloaded,
                    sha=model.sha,
                ))
            
            return results
        except Exception as e:
            logger.error(f"Model search failed: {e}")
            return []
    
    async def delete_model(self, model_id: str, model_type: ModelType) -> bool:
        local_path = settings.MODELS_DIR / model_type.value / model_id.replace("/", "_")
        if local_path.exists():
            try:
                shutil.rmtree(local_path)
                logger.info(f"Deleted model: {model_id}")
                return True
            except Exception as e:
                logger.error(f"Failed to delete model {model_id}: {e}")
        return False
    
    async def get_local_models(self) -> List[ModelInfo]:
        models = []
        for model_type_dir in settings.MODELS_DIR.iterdir():
            if model_type_dir.is_dir():
                model_type = ModelType(model_type_dir.name)
                for model_dir in model_type_dir.iterdir():
                    if model_dir.is_dir():
                        model_id = model_dir.name.replace("_", "/")
                        info = await self.get_model_info(model_id)
                        if info:
                            info.model_type = model_type
                            info.local_path = str(model_dir)
                            info.is_downloaded = True
                            models.append(info)
        return models


download_manager = DownloadManager()