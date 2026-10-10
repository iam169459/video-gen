import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "VideoGen AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "your-secret-key-change-in-production"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1
    
    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    MODELS_DIR: Path = DATA_DIR / "models"
    OUTPUT_DIR: Path = DATA_DIR / "outputs"
    TEMP_DIR: Path = DATA_DIR / "temp"
    LOGS_DIR: Path = DATA_DIR / "logs"
    CACHE_DIR: Path = DATA_DIR / "cache"
    
    # Model Configuration
    DEFAULT_LLM_MODEL: str = "meta-llama/Llama-2-7b-chat-hf"
    DEFAULT_VIDEO_MODEL: str = "stabilityai/stable-video-diffusion-img2vid-xt"
    MAX_MODEL_SIZE_GB: float = 50.0
    CHAIN_BLOCK_SIZE: int = 4
    CHAIN_OVERLAP: int = 1
    
    # GPU/Compute
    DEVICE: str = "auto"
    USE_FP16: bool = True
    USE_BF16: bool = False
    ENABLE_XFORMERS: bool = True
    ENABLE_CPU_OFFLOAD: bool = True
    MAX_GPU_MEMORY_GB: Optional[float] = None
    
    # Video Generation
    DEFAULT_FPS: int = 8
    DEFAULT_FRAMES: int = 25
    DEFAULT_RESOLUTION: str = "576x1024"
    MAX_FRAMES: int = 100
    MAX_RESOLUTION: str = "1024x1024"
    
    # Chain Block System
    CHAIN_MAX_BLOCKS: int = 8
    CHAIN_TIMEOUT_SECONDS: int = 300
    CHAIN_RETRY_ATTEMPTS: int = 3
    BLOCK_PROCESSING_MODE: str = "sequential"
    
    # Download Manager
    DOWNLOAD_CHUNK_SIZE: int = 8192
    MAX_CONCURRENT_DOWNLOADS: int = 3
    DOWNLOAD_TIMEOUT: int = 3600
    VERIFY_CHECKSUMS: bool = True
    HUGGINGFACE_TOKEN: Optional[str] = None
    
    # Redis/Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MAX_MESSAGE_SIZE: int = 10 * 1024 * 1024
    
    # Update System
    UPDATE_CHECK_INTERVAL_HOURS: int = 24
    AUTO_UPDATE_ENABLED: bool = False
    UPDATE_CHANNEL: str = "stable"
    GITHUB_REPO: str = "your-username/video-gen"
    
    # Security
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]
    ALLOWED_HOSTS: List[str] = ["*"]
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60
    
    # Monitoring
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090
    LOG_LEVEL: str = "INFO"
    LOG_ROTATION: str = "10 MB"
    LOG_RETENTION: str = "7 days"
    
    @field_validator("DATA_DIR", "MODELS_DIR", "OUTPUT_DIR", "TEMP_DIR", "LOGS_DIR", "CACHE_DIR", mode="before")
    @classmethod
    def ensure_dirs(cls, v: Path) -> Path:
        v.mkdir(parents=True, exist_ok=True)
        return v
    
    @field_validator("DEVICE", mode="before")
    @classmethod
    def validate_device(cls, v: str) -> str:
        if v == "auto":
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
            return "cpu"
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()