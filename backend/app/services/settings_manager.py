import asyncio
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
from contextlib import asynccontextmanager

import aiohttp
import psutil
import GPUtil
from loguru import logger
from pydantic import BaseModel, Field

from app.core.config import settings


class UpdateChannel(str, Enum):
    STABLE = "stable"
    BETA = "beta"
    NIGHTLY = "nightly"


class UpdateStatus(str, Enum):
    CHECKING = "checking"
    AVAILABLE = "available"
    DOWNLOADING = "downloading"
    INSTALLING = "installing"
    COMPLETED = "completed"
    FAILED = "failed"
    UP_TO_DATE = "up_to_date"


class SystemComponent(str, Enum):
    BACKEND = "backend"
    FRONTEND = "frontend"
    MODELS = "models"
    DEPENDENCIES = "dependencies"
    DOCKER = "docker"
    SYSTEM = "system"


@dataclass
class SystemMetrics:
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float
    gpu_count: int
    gpu_metrics: List[Dict[str, Any]]
    network_io: Dict[str, float]
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class UpdateInfo:
    version: str
    channel: UpdateChannel
    release_notes: str
    download_url: str
    size_mb: float
    required: bool
    components: List[SystemComponent]
    release_date: datetime
    checksum: str


@dataclass
class UpdateProgress:
    status: UpdateStatus
    progress_percent: float
    current_step: str
    total_steps: int
    current_step_num: int
    downloaded_bytes: int
    total_bytes: int
    speed_mbps: float
    eta_seconds: float
    error: Optional[str] = None


class SettingsManager:
    def __init__(self):
        self.settings_file = settings.DATA_DIR / "settings.json"
        self.custom_settings: Dict[str, Any] = {}
        self._callbacks: Dict[str, List[Callable]] = {}
        self._load_settings()
    
    def _load_settings(self) -> None:
        if self.settings_file.exists():
            try:
                with open(self.settings_file, 'r') as f:
                    self.custom_settings = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
                self.custom_settings = {}
    
    def _save_settings(self) -> None:
        try:
            with open(self.settings_file, 'w') as f:
                json.dump(self.custom_settings, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
    
    def get(self, key: str, default: Any = None) -> Any:
        return self.custom_settings.get(key, default)
    
    def set(self, key: str, value: Any) -> None:
        old_value = self.custom_settings.get(key)
        self.custom_settings[key] = value
        self._save_settings()
        self._notify_callbacks(key, value, old_value)
    
    def update(self, updates: Dict[str, Any]) -> None:
        for key, value in updates.items():
            old_value = self.custom_settings.get(key)
            self.custom_settings[key] = value
            self._notify_callbacks(key, value, old_value)
        self._save_settings()
    
    def register_callback(self, key: str, callback: Callable) -> None:
        if key not in self._callbacks:
            self._callbacks[key] = []
        self._callbacks[key].append(callback)
    
    def _notify_callbacks(self, key: str, new_value: Any, old_value: Any) -> None:
        if key in self._callbacks:
            for callback in self._callbacks[key]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        asyncio.create_task(callback(key, new_value, old_value))
                    else:
                        callback(key, new_value, old_value)
                except Exception as e:
                    logger.error(f"Settings callback error for {key}: {e}")
    
    def get_all(self) -> Dict[str, Any]:
        return {
            **{k: v for k, v in settings.__dict__.items() if not k.startswith('_')},
            **self.custom_settings,
        }


class SystemMonitor:
    def __init__(self):
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._callbacks: List[Callable] = []
        self._last_net_io = psutil.net_io_counters()
        self._last_time = time.time()
    
    async def start(self, interval: float = 5.0) -> None:
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop(interval))
        logger.info("System monitor started")
    
    async def stop(self) -> None:
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("System monitor stopped")
    
    def register_callback(self, callback: Callable) -> None:
        self._callbacks.append(callback)
    
    async def _monitor_loop(self, interval: float) -> None:
        while self._running:
            try:
                metrics = await self.get_metrics()
                for callback in self._callbacks:
                    try:
                        if asyncio.iscoroutinefunction(callback):
                            await callback(metrics)
                        else:
                            callback(metrics)
                    except Exception as e:
                        logger.error(f"Monitor callback error: {e}")
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
            
            await asyncio.sleep(interval)
    
    async def get_metrics(self) -> SystemMetrics:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        current_net_io = psutil.net_io_counters()
        current_time = time.time()
        time_delta = current_time - self._last_time
        
        network_io = {
            "bytes_sent_per_sec": (current_net_io.bytes_sent - self._last_net_io.bytes_sent) / time_delta,
            "bytes_recv_per_sec": (current_net_io.bytes_recv - self._last_net_io.bytes_recv) / time_delta,
        }
        
        self._last_net_io = current_net_io
        self._last_time = current_time
        
        gpu_metrics = []
        try:
            gpus = GPUtil.getGPUs()
            for gpu in gpus:
                gpu_metrics.append({
                    "id": gpu.id,
                    "name": gpu.name,
                    "load": gpu.load * 100,
                    "memory_used": gpu.memoryUsed,
                    "memory_total": gpu.memoryTotal,
                    "memory_percent": (gpu.memoryUsed / gpu.memoryTotal) * 100,
                    "temperature": gpu.temperature,
                })
        except Exception:
            pass
        
        return SystemMetrics(
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            memory_used_gb=memory.used / (1024**3),
            memory_total_gb=memory.total / (1024**3),
            disk_percent=disk.percent,
            disk_used_gb=disk.used / (1024**3),
            disk_total_gb=disk.total / (1024**3),
            gpu_count=len(gpu_metrics),
            gpu_metrics=gpu_metrics,
            network_io=network_io,
        )


class UpdateManager:
    def __init__(self):
        self.update_channel = UpdateChannel(settings.UPDATE_CHANNEL)
        self.current_version = settings.APP_VERSION
        self.github_repo = settings.GITHUB_REPO
        self._progress: Optional[UpdateProgress] = None
        self._callbacks: List[Callable] = []
        self._update_task: Optional[asyncio.Task] = None
        self._check_task: Optional[asyncio.Task] = None
    
    def register_callback(self, callback: Callable) -> None:
        self._callbacks.append(callback)
    
    def _notify_callbacks(self, progress: UpdateProgress) -> None:
        self._progress = progress
        for callback in self._callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    asyncio.create_task(callback(progress))
                else:
                    callback(progress)
            except Exception as e:
                logger.error(f"Update callback error: {e}")
    
    async def check_for_updates(self, force: bool = False) -> Optional[UpdateInfo]:
        self._notify_callbacks(UpdateProgress(
            status=UpdateStatus.CHECKING,
            progress_percent=0,
            current_step="Checking for updates...",
            total_steps=3,
            current_step_num=1,
            downloaded_bytes=0,
            total_bytes=0,
            speed_mbps=0,
            eta_seconds=0,
        ))
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.github.com/repos/{self.github_repo}/releases"
                if self.update_channel != UpdateChannel.STABLE:
                    url += "?per_page=10"
                
                headers = {"Accept": "application/vnd.github.v3+json"}
                if os.getenv("GITHUB_TOKEN"):
                    headers["Authorization"] = f"token {os.getenv('GITHUB_TOKEN')}"
                
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                        raise Exception(f"GitHub API error: {response.status}")
                    
                    releases = await response.json()
                    
                    for release in releases:
                        if release.get("draft") or release.get("prerelease"):
                            if self.update_channel == UpdateChannel.STABLE:
                                continue
                        
                        tag_name = release.get("tag_name", "").lstrip("v")
                        if self._is_newer_version(tag_name, self.current_version):
                            assets = release.get("assets", [])
                            backend_asset = next((a for a in assets if "backend" in a["name"]), None)
                            frontend_asset = next((a for a in assets if "frontend" in a["name"]), None)
                            
                            download_url = backend_asset["browser_download_url"] if backend_asset else assets[0]["browser_download_url"] if assets else ""
                            size_mb = (backend_asset["size"] if backend_asset else assets[0]["size"]) / (1024**2) if assets else 0
                            
                            return UpdateInfo(
                                version=tag_name,
                                channel=self.update_channel,
                                release_notes=release.get("body", ""),
                                download_url=download_url,
                                size_mb=size_mb,
                                required=False,
                                components=[SystemComponent.BACKEND, SystemComponent.FRONTEND],
                                release_date=datetime.fromisoformat(release.get("published_at", "").replace("Z", "+00:00")),
                                checksum="",
                            )
            
            self._notify_callbacks(UpdateProgress(
                status=UpdateStatus.UP_TO_DATE,
                progress_percent=100,
                current_step="Up to date",
                total_steps=3,
                current_step_num=3,
                downloaded_bytes=0,
                total_bytes=0,
                speed_mbps=0,
                eta_seconds=0,
            ))
            return None
            
        except Exception as e:
            self._notify_callbacks(UpdateProgress(
                status=UpdateStatus.FAILED,
                progress_percent=0,
                current_step=f"Check failed: {str(e)}",
                total_steps=3,
                current_step_num=1,
                downloaded_bytes=0,
                total_bytes=0,
                speed_mbps=0,
                eta_seconds=0,
                error=str(e),
            ))
            logger.error(f"Update check failed: {e}")
            return None
    
    def _is_newer_version(self, remote: str, local: str) -> bool:
        try:
            remote_parts = [int(x) for x in remote.split(".")]
            local_parts = [int(x) for x in local.split(".")]
            return remote_parts > local_parts
        except Exception:
            return remote != local
    
    async def start_auto_check(self, interval_hours: int = 24) -> None:
        if self._check_task:
            self._check_task.cancel()
        
        async def check_loop():
            while True:
                await asyncio.sleep(interval_hours * 3600)
                if settings.AUTO_UPDATE_ENABLED:
                    update_info = await self.check_for_updates()
                    if update_info:
                        await self.download_and_install(update_info)
        
        self._check_task = asyncio.create_task(check_loop())
    
    async def stop_auto_check(self) -> None:
        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass
    
    async def download_and_install(self, update_info: UpdateInfo) -> bool:
        self._notify_callbacks(UpdateProgress(
            status=UpdateStatus.DOWNLOADING,
            progress_percent=0,
            current_step="Downloading update...",
            total_steps=5,
            current_step_num=1,
            downloaded_bytes=0,
            total_bytes=int(update_info.size_mb * 1024 * 1024),
            speed_mbps=0,
            eta_seconds=0,
        ))
        
        try:
            update_dir = settings.DATA_DIR / "updates"
            update_dir.mkdir(parents=True, exist_ok=True)
            
            filename = update_info.download_url.split("/")[-1]
            filepath = update_dir / filename
            
            async with aiohttp.ClientSession() as session:
                async with session.get(update_info.download_url) as response:
                    total = int(response.headers.get("content-length", 0))
                    downloaded = 0
                    start_time = time.time()
                    
                    async with aiofiles.open(filepath, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            await f.write(chunk)
                            downloaded += len(chunk)
                            
                            elapsed = time.time() - start_time
                            if elapsed > 0:
                                speed = downloaded / elapsed / (1024 * 1024)
                                eta = (total - downloaded) / (downloaded / elapsed) if downloaded > 0 else 0
                                
                                self._notify_callbacks(UpdateProgress(
                                    status=UpdateStatus.DOWNLOADING,
                                    progress_percent=(downloaded / total) * 50 if total > 0 else 0,
                                    current_step=f"Downloading... {downloaded / (1024**2):.1f}/{total / (1024**2):.1f} MB",
                                    total_steps=5,
                                    current_step_num=2,
                                    downloaded_bytes=downloaded,
                                    total_bytes=total,
                                    speed_mbps=speed,
                                    eta_seconds=eta,
                                ))
            
            self._notify_callbacks(UpdateProgress(
                status=UpdateStatus.INSTALLING,
                progress_percent=50,
                current_step="Installing update...",
                total_steps=5,
                current_step_num=3,
                downloaded_bytes=total,
                total_bytes=total,
                speed_mbps=0,
                eta_seconds=0,
            ))
            
            if filename.endswith(".tar.gz") or filename.endswith(".tgz"):
                await self._extract_and_install(filepath, update_dir)
            elif filename.endswith(".whl"):
                await self._install_wheel(filepath)
            else:
                await self._run_install_script(filepath)
            
            self.current_version = update_info.version
            
            self._notify_callbacks(UpdateProgress(
                status=UpdateStatus.COMPLETED,
                progress_percent=100,
                current_step="Update completed successfully",
                total_steps=5,
                current_step_num=5,
                downloaded_bytes=total,
                total_bytes=total,
                speed_mbps=0,
                eta_seconds=0,
            ))
            
            return True
            
        except Exception as e:
            self._notify_callbacks(UpdateProgress(
                status=UpdateStatus.FAILED,
                progress_percent=0,
                current_step=f"Update failed: {str(e)}",
                total_steps=5,
                current_step_num=0,
                downloaded_bytes=0,
                total_bytes=0,
                speed_mbps=0,
                eta_seconds=0,
                error=str(e),
            ))
            return False
    
    async def _extract_and_install(self, filepath: Path, extract_dir: Path) -> None:
        import tarfile
        with tarfile.open(filepath, 'r:gz') as tar:
            tar.extractall(extract_dir)
        
        install_script = extract_dir / "install.sh"
        if install_script.exists():
            os.chmod(install_script, 0o755)
            proc = await asyncio.create_subprocess_exec(
                str(install_script),
                cwd=extract_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise Exception(f"Install script failed: {stderr.decode()}")
    
    async def _install_wheel(self, filepath: Path) -> None:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "pip", "install", "--upgrade", str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise Exception(f"Wheel install failed: {stderr.decode()}")
    
    async def _run_install_script(self, filepath: Path) -> None:
        os.chmod(filepath, 0o755)
        proc = await asyncio.create_subprocess_exec(
            str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise Exception(f"Install failed: {stderr.decode()}")
    
    def get_progress(self) -> Optional[UpdateProgress]:
        return self._progress


settings_manager = SettingsManager()
system_monitor = SystemMonitor()
update_manager = UpdateManager()