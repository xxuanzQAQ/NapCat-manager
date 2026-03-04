"""
容器管理路由 - CRUD + 操作 + 统计 + 日志 + QR + 配置
"""
import os
import base64
import requests as http_requests

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from middleware.auth import get_current_user, require_admin, check_instance_permission
from services.config import app_config, get_data_dir
from services.docker_manager import docker_manager
from services.cluster_manager import cluster_manager
from services.operation_logger import operation_logger
from services.log import logger

router = APIRouter(prefix="/api", tags=["containers"])


class CreateRequest(BaseModel):
    name: str
    node_id: str = "local"
    # 高级选项（均有默认值，快速创建无需填写）
    docker_image: str = ""          # 空则取全局配置
    webui_port: int = 0             # 0 = 自动分配
    http_port: int = 0
    ws_port: int = 0
    memory_limit: int = 0           # MB, 0 = 不限制
    restart_policy: str = "always"  # always / unless-stopped / on-failure / no
    network_mode: str = "bridge"    # bridge / host / none
    env_vars: list = []             # ["KEY=VALUE", ...]


class DeleteRequest(BaseModel):
    delete_data: bool = False       # 是否同时删除本地映射数据


class ConfigRequest(BaseModel):
    content: str


def _safe_path(base: str, *parts: str) -> str:
    """安全路径构建 - 防止路径遍历"""
    joined = os.path.join(base, *parts)
    real = os.path.realpath(joined)
    real_base = os.path.realpath(base)
    if not real.startswith(real_base):
        raise HTTPException(status_code=400, detail="Invalid path: directory traversal detected")
    return real


# ============ 容器列表 ============

@router.get("/containers")
async def api_list_containers():
    containers = await run_in_threadpool(cluster_manager.list_all_containers)
    return {"status": "ok", "containers": containers}


# ============ 创建容器 ============

@router.post("/containers")
async def api_create_container(
    req: CreateRequest, request: Request,
    session: dict = Depends(require_admin),
):
    if req.node_id != "local":
        nodes = cluster_manager.get_nodes()
        node = next((n for n in nodes if n["id"] == req.node_id), None)
        if not node:
            raise HTTPException(status_code=400, detail="Invalid node_id")
        addr = cluster_manager._normalize_address(node["address"])
        resp = await run_in_threadpool(
            lambda: http_requests.post(
                f"{addr}/api/containers",
                headers={"x-request-api-key": node["api_key"]},
                json={"name": req.name, "node_id": "local"},
                timeout=5,
            )
        )
        return resp.json()

    # 本地创建
    data_dir = os.path.join(get_data_dir(), req.name)
    qq_data_dir = os.path.join(data_dir, "qq_data")
    config_dir = os.path.join(data_dir, "config")
    plugins_dir = os.path.join(data_dir, "plugins")
    cache_dir = os.path.join(data_dir, "cache")
    os.makedirs(qq_data_dir, exist_ok=True)
    os.makedirs(config_dir, exist_ok=True)
    os.makedirs(plugins_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)

    volumes = {
        qq_data_dir: {"bind": "/app/.config/QQ", "mode": "rw"},
        config_dir: {"bind": "/app/napcat/config", "mode": "rw"},
        plugins_dir: {"bind": "/app/napcat/plugins", "mode": "rw"},
        cache_dir: {"bind": "/app/napcat/cache", "mode": "rw"},
    }

    # 端口分配：用户指定 > 自动递增
    used_ports = docker_manager.get_used_ports()
    webui_base = app_config.get("webui_base_port", 6000)
    http_base = app_config.get("http_base_port", 3000)
    ws_base = app_config.get("ws_base_port", 3001)

    webui_port = req.webui_port if req.webui_port > 0 else docker_manager.find_available_port(webui_base, used_ports)
    used_ports.add(webui_port)
    http_port = req.http_port if req.http_port > 0 else docker_manager.find_available_port(http_base, used_ports)
    used_ports.add(http_port)
    ws_port = req.ws_port if req.ws_port > 0 else docker_manager.find_available_port(ws_base, used_ports)

    ports = {
        "6099/tcp": webui_port,
        "3000/tcp": http_port,
        "3001/tcp": ws_port,
    }

    docker_image = req.docker_image or app_config.get("docker_image", "mlikiowa/napcat-docker:latest")

    # 高级参数传递
    extra_kwargs = {}
    if req.memory_limit > 0:
        extra_kwargs["mem_limit"] = f"{req.memory_limit}m"
    if req.restart_policy and req.restart_policy != "no":
        extra_kwargs["restart_policy"] = {"Name": req.restart_policy}
    else:
        extra_kwargs["restart_policy"] = {"Name": "always"}
    if req.network_mode and req.network_mode != "bridge":
        extra_kwargs["network_mode"] = req.network_mode
    env = {"ACCOUNT": ""}
    for item in (req.env_vars or []):
        if "=" in item:
            k, v = item.split("=", 1)
            env[k] = v
    extra_kwargs["environment"] = env

    cid = docker_manager.create_container(req.name, volumes=volumes, ports=ports, docker_image=docker_image, **extra_kwargs)
    if not cid:
        raise HTTPException(status_code=500, detail="Failed to create container")

    operation_logger.info("container_create", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": req.name,
        "node_id": req.node_id,
        "ports": {"webui": webui_port, "http": http_port, "ws": ws_port},
    })
    return {"status": "ok", "container_id": cid, "ports": {"webui": webui_port, "http": http_port, "ws": ws_port}}


# ============ 容器操作 (启动/停止/重启/删除...) ============

@router.post("/containers/{name}/action")
async def api_container_action(
    name: str, action: str,
    node_id: str = "local",
    delete_data: bool = False,
    request: Request = None,
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")

    success = await run_in_threadpool(cluster_manager.action_container, node_id, name, action)
    if not success:
        raise HTTPException(status_code=500, detail="Action failed")

    # 删除时可选清理本地数据目录
    if action == "delete" and delete_data and node_id == "local":
        import shutil
        data_dir = os.path.join(get_data_dir(), name)
        if os.path.exists(data_dir):
            shutil.rmtree(data_dir, ignore_errors=True)
            logger.info("已删除本地数据目录: %s", data_dir)

    operation_logger.info("container_action", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": name,
        "action": action,
        "node_id": node_id,
        "delete_data": delete_data,
    })
    return {"status": "ok"}


# ============ 容器统计 ============

@router.get("/containers/{name}/stats")
async def get_container_stats(
    name: str, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    return await run_in_threadpool(cluster_manager.get_stats, node_id, name)


# ============ 容器日志 ============

@router.get("/containers/{name}/logs")
async def get_container_logs(
    name: str, lines: int = 100, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    logs = await run_in_threadpool(cluster_manager.get_logs, node_id, name, lines)
    return {"status": "ok", "logs": logs}


# ============ QR 码 ============

@router.get("/containers/{name}/qrcode")
async def get_qr_code(
    name: str, node_id: str = "local"
):
    # 二维码接口允许未登录访问，用于 NapCat QQ 登录

    if node_id != "local":
        result = await run_in_threadpool(cluster_manager.get_qr_status, node_id, name)
        if result:
            return result
        return {"status": "waiting"}

    # 本地 QR 处理 - 先检查是否已登录
    import re

    # 0. 检查登录状态：如果已登录，返回 logged_in 而非二维码
    try:
        config_dir = os.path.join(get_data_dir(), name, "config")
        if os.path.exists(config_dir):
            napcat_files = []
            for f in os.listdir(config_dir):
                if f.startswith("napcat_") and f.endswith(".json"):
                    napcat_files.append(os.path.join(config_dir, f))
            if napcat_files:
                latest_file = max(napcat_files, key=os.path.getmtime)
                uin = os.path.basename(latest_file).replace("napcat_", "").replace(".json", "")
                return {"status": "logged_in", "uin": uin}
    except OSError:
        pass

    # 1. 尝试从 NapCat WebUI API 获取二维码
    try:
        stats = await run_in_threadpool(docker_manager.get_napcat_info, name)
        if stats.get('webui_port'):
            webui_url = f"http://localhost:{stats['webui_port']}/api/qrcode"
            response = http_requests.get(webui_url, timeout=2)
            if response.status_code == 200:
                data = response.json()
                if data.get('url'):
                    return {"status": "ok", "url": data['url'], "type": "api"}
    except Exception as e:
        logger.debug(f"NapCat API 获取二维码失败: {e}")

    # 2. 尝试读取本地 cache 目录的二维码文件
    try:
        qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
        if os.path.exists(qr_path):
            with open(qr_path, "rb") as f:
                data = base64.b64encode(f.read()).decode("utf-8")
            return {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
    except Exception as e:
        logger.debug(f"读取本地二维码文件失败: {e}")

    # 3. 最后尝试从 Docker 日志提取二维码 URL
    try:
        container = docker_manager.client.containers.get(name)
        logs = container.logs(tail=50).decode('utf-8', errors='ignore')
        qr_url_match = re.search(r'二维码解码URL:\s*(https://[^\s]+)', logs)
        if qr_url_match:
            qr_url = qr_url_match.group(1)
            return {"status": "ok", "url": qr_url, "type": "log"}
    except Exception as e:
        logger.debug(f"从日志获取二维码失败: {e}")

    return {"status": "waiting"}


# ============ 配置文件读写 ============

@router.get("/containers/{name}/config/{filename:path}")
def read_container_config(
    name: str, filename: str,
    session: dict = Depends(get_current_user),
):
    file_path = _safe_path(get_data_dir(), name, filename)
    if not os.path.exists(file_path):
        return {"status": "not_found", "content": ""}
    with open(file_path, "r", encoding="utf-8") as f:
        return {"status": "ok", "content": f.read()}


@router.post("/containers/{name}/config/{filename:path}")
def save_container_config(
    name: str, filename: str, req: ConfigRequest,
    request: Request = None,
    session: dict = Depends(get_current_user),
):
    file_path = _safe_path(get_data_dir(), name, filename)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(req.content)
    operation_logger.info("config_save", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": name,
        "filename": filename,
    })
    return {"status": "ok"}


# ============ 文件管理 ============

@router.get("/containers/{name}/files")
def list_container_files(
    name: str, path: str = "",
    session: dict = Depends(get_current_user),
):
    target_dir = _safe_path(get_data_dir(), name, path)
    if not os.path.exists(target_dir):
        return {"status": "ok", "files": [], "folders": [], "current_path": path}

    files = []
    folders = []
    if os.path.isdir(target_dir):
        for f in os.listdir(target_dir):
            f_path = os.path.join(target_dir, f)
            if os.path.isfile(f_path):
                stat = os.stat(f_path)
                files.append({"name": f, "size": stat.st_size, "mtime": stat.st_mtime})
            elif os.path.isdir(f_path):
                folders.append({"name": f})
    return {"status": "ok", "files": files, "folders": folders, "current_path": path}
