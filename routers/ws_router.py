"""
WebSocket 路由 - 实时事件推送 + 日志流
"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.concurrency import run_in_threadpool

from services.ws_manager import ws_manager
from services.cluster_manager import cluster_manager
from services.log import logger
from services.docker_manager import docker_manager, read_login_cache
from middleware.auth import validate_token_value

router = APIRouter(tags=["websocket"])


def _build_snapshot(containers: list) -> dict:
    """构建容器快照字典（用于增量 diff 比较）。key=name, value=精简状态。"""
    snap = {}
    for c in containers:
        snap[c["name"]] = {
            "status": c.get("status", ""),
            "uin": c.get("uin", ""),
            "node_id": c.get("node_id", "local"),
        }
    return snap


def _resolve_ws_token(ws: WebSocket, query_token: str) -> str:
    """从 query 参数或 cookie 中提取认证 token。
    httpOnly cookie 无法被前端 JS 读取，但浏览器在 WS 握手时会自动携带。
    """
    if query_token:
        return query_token
    return ws.cookies.get("auth_token", "")


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket, token: str = Query(default="")):
    """容器状态实时推送。首次全量 + 后续增量 diff + 定期登录检测。"""
    effective_token = _resolve_ws_token(ws, token)
    session = validate_token_value(effective_token) if effective_token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws_manager.connect(ws)
    prev_snapshot: dict = {}
    tick = 0
    try:
        while True:
            # 获取容器列表（超时保护，防止 Docker API 卡死阻塞事件循环）
            try:
                containers = await asyncio.wait_for(
                    run_in_threadpool(cluster_manager.list_all_containers), timeout=10
                )
            except (asyncio.TimeoutError, Exception) as e:
                logger.debug("WS list_all_containers 超时/异常: %s", e)
                await asyncio.sleep(3)
                continue

            # 每 3 轮（~9s）触发一次 batch_check_login，保持 uin 缓存热
            tick += 1
            if tick % 3 == 0:
                running_names = [
                    c["name"] for c in containers
                    if c.get("status") == "running" and c.get("node_id", "local") == "local"
                ]
                if running_names:
                    try:
                        await asyncio.wait_for(
                            run_in_threadpool(docker_manager.batch_check_login, running_names, 4.0),
                            timeout=6
                        )
                    except (asyncio.TimeoutError, Exception):
                        pass

            # 附带 login 缓存中的 uin
            for c in containers:
                if c.get("status") == "running" and c.get("node_id", "local") == "local":
                    cache = read_login_cache(c["name"])
                    if cache.get("logged_in") and cache.get("uin"):
                        c["uin"] = cache["uin"]

            curr_snapshot = _build_snapshot(containers)

            # 首次推送全量；后续仅推送有变化时全量（diff 检测）
            try:
                if curr_snapshot != prev_snapshot:
                    await asyncio.wait_for(
                        ws.send_json({"type": "containers", "data": containers}), timeout=5
                    )
                    prev_snapshot = curr_snapshot
                else:
                    await asyncio.wait_for(
                        ws.send_json({"type": "heartbeat"}), timeout=5
                    )
            except (asyncio.TimeoutError, Exception):
                # 发送失败（客户端已断开），退出循环
                break

            await asyncio.sleep(3)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS events 连接异常: %s", e)
    finally:
        await ws_manager.disconnect(ws)


@router.websocket("/ws/logs/{name}")
async def ws_container_logs(
    ws: WebSocket, name: str,
    node_id: str = Query(default="local"),
    token: str = Query(default=""),
):
    """容器日志实时流推送"""
    effective_token = _resolve_ws_token(ws, token)
    session = validate_token_value(effective_token) if effective_token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    try:
        while True:
            try:
                logs = await asyncio.wait_for(
                    run_in_threadpool(cluster_manager.get_logs, node_id, name, 200),
                    timeout=8
                )
            except (asyncio.TimeoutError, Exception):
                logs = ""
            try:
                await asyncio.wait_for(
                    ws.send_json({"type": "logs", "data": logs or ""}), timeout=5
                )
            except (asyncio.TimeoutError, Exception):
                break
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS logs 连接异常 [%s]: %s", name, e)

