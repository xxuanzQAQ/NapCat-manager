"""
NapCat QQ Manager - 精简入口点
所有路由已拆分到 routers/ 目录，服务层在 services/，中间件在 middleware/
"""
import os
import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from services.log import logger
from services.config import FRONTEND_DIST, get_data_dir
from services.operation_logger import operation_logger
from middleware.auth import cleanup_expired_tokens

from routers.auth_router import router as auth_router
from routers.user_router import router as user_router
from routers.container_router import router as container_router
from routers.node_router import router as node_router
from routers.operation_logs_router import router as operation_logs_router


# ============ 生命周期管理 ============

import asyncio
from services.daemon_monitor import daemon_monitor

async def background_monitor():
    while True:
        daemon_monitor.record_tick()
        await asyncio.sleep(30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭生命周期"""
    logger.info("NapCat QQ Manager 启动中...")
    logger.info("前端路径: %s", FRONTEND_DIST)

    # 启动 Daemon 监控任务 (CPU/MEM 10分钟平均使用率)
    monitor_task = asyncio.create_task(background_monitor())

    yield

    # 关闭时刷盘
    monitor_task.cancel()
    operation_logger.flush()
    cleanup_expired_tokens()
    logger.info("NapCat QQ Manager 已关闭")


# ============ 创建 FastAPI 应用 ============

app = FastAPI(
    title="NapCatQQ Manager API",
    description="NapCat QQ Bot Docker 容器管理面板",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ 注册路由 ============

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(container_router)
app.include_router(node_router)
app.include_router(operation_logs_router)


# ============ 静态文件挂载 ============

app.mount("/data", StaticFiles(directory=get_data_dir()), name="data")

if os.path.exists(os.path.join(FRONTEND_DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="frontend_assets")


# ============ SPA 前端路由 (Catch-all) ============

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """所有未匹配的路由返回前端 SPA"""
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse(
        "<html><body><h1>Frontend not built yet. Run npm run build in frontend folder.</h1></body></html>"
    )


# ============ 应用入口 ============

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
