from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio
import logging
from pathlib import Path

from app.core.config import settings
from app.api.routes import router as api_router
from app.services.video_generator import video_generator
from app.services.download_manager import download_manager
from app.services.settings_manager import system_monitor, update_manager
from app.chains.block_manager import chain_registry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        if channel not in self.active_connections:
            self.active_connections[channel] = []
        self.active_connections[channel].append(websocket)
    
    def disconnect(self, websocket: WebSocket, channel: str):
        if channel in self.active_connections:
            self.active_connections[channel].remove(websocket)
    
    async def broadcast(self, channel: str, message: dict):
        if channel in self.active_connections:
            for connection in self.active_connections[channel][:]:
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(connection, channel)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting VideoGen AI Backend...")
    
    await video_generator.start()
    await download_manager.start()
    await system_monitor.start(interval=5.0)
    
    if settings.AUTO_UPDATE_ENABLED:
        await update_manager.start_auto_check(settings.UPDATE_CHECK_INTERVAL_HOURS)
    
    logger.info("All services started successfully")
    
    yield
    
    logger.info("Shutting down VideoGen AI Backend...")
    
    await video_generator.stop()
    await download_manager.stop()
    await system_monitor.stop()
    await update_manager.stop_auto_check()
    await chain_registry.release_all()
    
    logger.info("All services stopped")


app = FastAPI(
    title="VideoGen AI",
    description="Local Video Generator with Chain Block LLM System",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

frontend_build = Path(__file__).parent.parent.parent / "frontend" / "out"
if frontend_build.exists():
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="frontend")


@app.get("/")
async def root():
    if frontend_build.exists():
        return FileResponse(frontend_build / "index.html")
    return {
        "name": "VideoGen AI",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "api": "/api/v1",
    }


@app.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    await manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(channel, {"echo": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        reload=settings.DEBUG,
    )