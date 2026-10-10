from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, AsyncGenerator
import asyncio
import json
import uuid
from datetime import datetime

from app.core.config import settings
from app.chains.block_manager import chain_registry, ChainConfig, ProcessingMode
from app.services.video_generator import (
    video_generator, VideoGenerationParams, VideoGenerationResult,
    VideoGenerationStatus, VideoModelType, AVAILABLE_VIDEO_MODELS, VideoModelInfo
)
from app.services.download_manager import (
    download_manager, DownloadStatus, ModelType, ModelInfo, DownloadProgress
)
from app.services.settings_manager import (
    settings_manager, system_monitor, update_manager,
    UpdateChannel, UpdateStatus, SystemComponent, SystemMetrics, UpdateProgress
)

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float
    components: Dict[str, str]


class GenerateVideoRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    image_base64: Optional[str] = None
    model_type: VideoModelType = VideoModelType.STABLE_VIDEO_DIFFUSION_XT
    model_id: Optional[str] = None
    num_frames: int = Field(default=25, ge=1, le=100)
    fps: int = Field(default=8, ge=1, le=60)
    width: int = Field(default=576, ge=256, le=1024)
    height: int = Field(default=1024, ge=256, le=1024)
    num_inference_steps: int = Field(default=25, ge=1, le=100)
    guidance_scale: float = Field(default=7.5, ge=1.0, le=20.0)
    motion_bucket_id: int = Field(default=127, ge=1, le=255)
    noise_aug_strength: float = Field(default=0.02, ge=0.0, le=1.0)
    seed: Optional[int] = None
    decode_chunk_size: int = Field(default=8, ge=1, le=16)
    output_format: str = Field(default="mp4", pattern="^(mp4|gif|webm)$")


class GenerateVideoResponse(BaseModel):
    task_id: str
    status: VideoGenerationStatus
    message: str


class ChainGenerateRequest(BaseModel):
    model_id: str
    prompt: str
    max_new_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.1, le=2.0)
    top_p: float = Field(default=0.9, ge=0.1, le=1.0)
    stream: bool = False
    chain_config: Optional[Dict[str, Any]] = None


class ModelDownloadRequest(BaseModel):
    model_id: str
    model_type: ModelType = ModelType.OTHER
    revision: Optional[str] = None
    force_redownload: bool = False


class SettingsUpdateRequest(BaseModel):
    settings: Dict[str, Any]


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        uptime_seconds=0,
        components={
            "video_generator": "ready" if video_generator._running else "stopped",
            "download_manager": "ready" if download_manager._running else "stopped",
            "chain_registry": "ready",
            "settings": "ready",
        }
    )


@router.get("/video/models", response_model=List[VideoModelInfo])
async def list_video_models():
    return AVAILABLE_VIDEO_MODELS


@router.post("/video/generate", response_model=GenerateVideoResponse)
async def generate_video(request: GenerateVideoRequest, background_tasks: BackgroundTasks):
    import base64
    from PIL import Image
    import io
    
    image = None
    if request.image_base64:
        try:
            image_data = base64.b64decode(request.image_base64)
            image = Image.open(io.BytesIO(image_data))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")
    
    params = VideoGenerationParams(
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        image=image,
        model_type=request.model_type,
        model_id=request.model_id,
        num_frames=request.num_frames,
        fps=request.fps,
        width=request.width,
        height=request.height,
        num_inference_steps=request.num_inference_steps,
        guidance_scale=request.guidance_scale,
        motion_bucket_id=request.motion_bucket_id,
        noise_aug_strength=request.noise_aug_strength,
        seed=request.seed,
        decode_chunk_size=request.decode_chunk_size,
        output_format=request.output_format,
    )
    
    result = await video_generator.generate_video(params)
    
    return GenerateVideoResponse(
        task_id=result.task_id,
        status=result.status,
        message="Video generation queued",
    )


@router.get("/video/tasks", response_model=List[VideoGenerationResult])
async def list_video_tasks(status: Optional[VideoGenerationStatus] = None):
    return video_generator.list_tasks(status)


@router.get("/video/tasks/{task_id}", response_model=VideoGenerationResult)
async def get_video_task(task_id: str):
    result = await video_generator.get_task_status(task_id)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return result


@router.get("/video/tasks/{task_id}/download")
async def download_video(task_id: str):
    result = await video_generator.get_task_status(task_id)
    if not result or not result.output_path:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return FileResponse(
        result.output_path,
        media_type="video/mp4",
        filename=f"video_{task_id}.mp4",
    )


@router.get("/video/tasks/{task_id}/preview")
async def preview_video(task_id: str):
    result = await video_generator.get_task_status(task_id)
    if not result or not result.preview_path:
        raise HTTPException(status_code=404, detail="Preview not found")
    
    return FileResponse(
        result.preview_path,
        media_type="image/gif",
        filename=f"preview_{task_id}.gif",
    )


@router.delete("/video/tasks/{task_id}")
async def cancel_video_task(task_id: str):
    success = await video_generator.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or cannot be cancelled")
    return {"message": "Task cancelled"}


@router.websocket("/video/tasks/{task_id}/ws")
async def video_task_websocket(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        while True:
            result = await video_generator.get_task_status(task_id)
            if not result:
                await websocket.send_json({"error": "Task not found"})
                break
            
            await websocket.send_json({
                "task_id": result.task_id,
                "status": result.status.value,
                "progress": result.progress,
                "current_step": result.current_step,
                "total_steps": result.total_steps,
                "error": result.error,
            })
            
            if result.status in [VideoGenerationStatus.COMPLETED, VideoGenerationStatus.FAILED]:
                break
            
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()


@router.post("/chain/generate")
async def chain_generate(request: ChainGenerateRequest):
    chain_config = None
    if request.chain_config:
        chain_config = ChainConfig(
            model_id=request.model_id,
            num_blocks=request.chain_config.get("num_blocks", settings.CHAIN_MAX_BLOCKS),
            block_size=request.chain_config.get("block_size", settings.CHAIN_BLOCK_SIZE),
            overlap=request.chain_config.get("overlap", settings.CHAIN_OVERLAP),
            processing_mode=ProcessingMode(request.chain_config.get("processing_mode", "sequential")),
            offload_to_cpu=request.chain_config.get("offload_to_cpu", True),
        )
    
    chain = await chain_registry.get_chain(request.model_id, chain_config)
    
    if request.stream:
        async def stream_generator():
            async for token in await chain.generate(
                request.prompt,
                max_new_tokens=request.max_new_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                stream=True,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        
        return StreamingResponse(stream_generator(), media_type="text/event-stream")
    
    result = await chain.generate(
        request.prompt,
        max_new_tokens=request.max_new_tokens,
        temperature=request.temperature,
        top_p=request.top_p,
        stream=False,
    )
    
    return {"response": result}


@router.get("/chain/stats")
async def get_chain_stats():
    return chain_registry.get_all_stats()


@router.post("/chain/release/{model_id}")
async def release_chain(model_id: str):
    await chain_registry.release_chain(model_id)
    return {"message": f"Chain {model_id} released"}


@router.post("/models/download", response_model=Dict[str, str])
async def download_model(request: ModelDownloadRequest):
    download_id = await download_manager.download_model(
        model_id=request.model_id,
        model_type=request.model_type,
        revision=request.revision,
        force_redownload=request.force_redownload,
    )
    return {"download_id": download_id}


@router.get("/models/downloads", response_model=List[DownloadProgress])
async def list_downloads(status: Optional[DownloadStatus] = None):
    return download_manager.list_downloads(status)


@router.get("/models/downloads/{download_id}", response_model=DownloadProgress)
async def get_download_progress(download_id: str):
    progress = download_manager.get_progress(download_id)
    if not progress:
        for p in download_manager.download_history:
            if p.download_id == download_id:
                return p
        raise HTTPException(status_code=404, detail="Download not found")
    return progress


@router.post("/models/downloads/{download_id}/pause")
async def pause_download(download_id: str):
    success = await download_manager.pause_download(download_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found")
    return {"message": "Download paused"}


@router.post("/models/downloads/{download_id}/resume")
async def resume_download(download_id: str):
    success = await download_manager.resume_download(download_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found")
    return {"message": "Download resumed"}


@router.post("/models/downloads/{download_id}/cancel")
async def cancel_download(download_id: str):
    success = await download_manager.cancel_download(download_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found")
    return {"message": "Download cancelled"}


@router.websocket("/models/downloads/{download_id}/ws")
async def download_websocket(websocket: WebSocket, download_id: str):
    await websocket.accept()
    
    queue = asyncio.Queue()
    
    def callback(progress: DownloadProgress):
        try:
            queue.put_nowait(progress)
        except Exception:
            pass
    
    download_manager.register_callback(download_id, callback)
    
    try:
        while True:
            progress = await queue.get()
            await websocket.send_json({
                "download_id": progress.download_id,
                "model_id": progress.model_id,
                "status": progress.status.value,
                "progress_percent": progress.progress_percent,
                "downloaded_bytes": progress.downloaded_bytes,
                "total_bytes": progress.total_bytes,
                "speed_bps": progress.speed_bps,
                "eta_seconds": progress.eta_seconds,
                "current_file": progress.current_file,
                "files_completed": progress.files_completed,
                "total_files": progress.total_files,
                "error": progress.error,
            })
            
            if progress.status in [DownloadStatus.COMPLETED, DownloadStatus.FAILED, DownloadStatus.CANCELLED]:
                break
    except WebSocketDisconnect:
        pass
    finally:
        download_manager.unregister_callback(download_id, callback)
        await websocket.close()


@router.get("/models/search", response_model=List[ModelInfo])
async def search_models(
    query: str = Query(..., min_length=1),
    model_type: Optional[ModelType] = None,
    limit: int = Query(default=20, ge=1, le=100),
):
    return await download_manager.search_models(query, model_type, limit)


@router.get("/models/local", response_model=List[ModelInfo])
async def list_local_models():
    return await download_manager.get_local_models()


@router.delete("/models/local/{model_id}")
async def delete_local_model(model_id: str, model_type: ModelType = ModelType.OTHER):
    success = await download_manager.delete_model(model_id, model_type)
    if not success:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"message": "Model deleted"}


@router.get("/settings", response_model=Dict[str, Any])
async def get_settings():
    return settings_manager.get_all()


@router.post("/settings")
async def update_settings(request: SettingsUpdateRequest):
    settings_manager.update(request.settings)
    return {"message": "Settings updated"}


@router.get("/settings/{key}")
async def get_setting(key: str):
    value = settings_manager.get(key)
    if value is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    return {"key": key, "value": value}


@router.put("/settings/{key}")
async def set_setting(key: str, value: Any):
    settings_manager.set(key, value)
    return {"message": "Setting updated"}


@router.get("/system/metrics", response_model=SystemMetrics)
async def get_system_metrics():
    return await system_monitor.get_metrics()


@router.websocket("/system/metrics/ws")
async def system_metrics_websocket(websocket: WebSocket):
    await websocket.accept()
    
    queue = asyncio.Queue()
    
    def callback(metrics: SystemMetrics):
        try:
            queue.put_nowait(metrics)
        except Exception:
            pass
    
    system_monitor.register_callback(callback)
    
    try:
        while True:
            metrics = await queue.get()
            await websocket.send_json({
                "cpu_percent": metrics.cpu_percent,
                "memory_percent": metrics.memory_percent,
                "memory_used_gb": metrics.memory_used_gb,
                "memory_total_gb": metrics.memory_total_gb,
                "disk_percent": metrics.disk_percent,
                "disk_used_gb": metrics.disk_used_gb,
                "disk_total_gb": metrics.disk_total_gb,
                "gpu_count": metrics.gpu_count,
                "gpu_metrics": metrics.gpu_metrics,
                "network_io": metrics.network_io,
                "timestamp": metrics.timestamp.isoformat(),
            })
    except WebSocketDisconnect:
        pass
    finally:
        system_monitor._callbacks.remove(callback)
        await websocket.close()


@router.get("/update/check")
async def check_updates(force: bool = False):
    update_info = await update_manager.check_for_updates(force)
    if update_info:
        return {
            "update_available": True,
            "version": update_info.version,
            "channel": update_info.channel.value,
            "release_notes": update_info.release_notes,
            "size_mb": update_info.size_mb,
            "release_date": update_info.release_date.isoformat(),
        }
    return {"update_available": False, "current_version": settings.APP_VERSION}


@router.post("/update/install")
async def install_update(background_tasks: BackgroundTasks):
    update_info = await update_manager.check_for_updates(force=True)
    if not update_info:
        raise HTTPException(status_code=400, detail="No update available")
    
    background_tasks.add_task(update_manager.download_and_install, update_info)
    return {"message": "Update installation started"}


@router.get("/update/progress", response_model=UpdateProgress)
async def get_update_progress():
    progress = update_manager.get_progress()
    if not progress:
        return UpdateProgress(
            status=UpdateStatus.UP_TO_DATE,
            progress_percent=100,
            current_step="No update in progress",
            total_steps=1,
            current_step_num=1,
            downloaded_bytes=0,
            total_bytes=0,
            speed_mbps=0,
            eta_seconds=0,
        )
    return progress


@router.get("/update/channel")
async def get_update_channel():
    return {"channel": update_manager.update_channel.value}


@router.put("/update/channel")
async def set_update_channel(channel: UpdateChannel):
    update_manager.update_channel = channel
    settings_manager.set("UPDATE_CHANNEL", channel.value)
    return {"message": f"Update channel set to {channel.value}"}


@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    import base64
    from PIL import Image
    import io
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))
    
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode()
    
    return {
        "filename": file.filename,
        "width": image.width,
        "height": image.height,
        "format": image.format,
        "base64": img_base64,
    }