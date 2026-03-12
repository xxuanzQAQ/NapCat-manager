"""
容器管理路由 - CRUD + 操作 + 统计 + 日志 + QR + 配置
"""
import os
import re
import base64
import requests as http_requests

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from middleware.auth import get_current_user, require_admin, check_instance_permission
from middleware.rate_limiter import speed_limit
from services.config import app_config, get_data_dir
from services.docker_manager import docker_manager, read_login_cache
from services.cluster_manager import cluster_manager
from services.operation_logger import operation_logger
from services.log import logger

router = APIRouter(prefix="/api", tags=["containers"])

# 容器名称校验：仅允许字母、数字、连字符、下划线、点号，1-64 字符
_CONTAINER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")

# NapCat 日志中二维码 URL 的多种格式正则（兼容不同版本的输出格式）
_QR_URL_PATTERNS = [
    re.compile(r'二维码解码URL[：:]\s*(https?://[^\s\r\n]+)'),
    re.compile(r'QrCode\s+URL[：:]\s*(https?://[^\s\r\n]+)', re.IGNORECASE),
    re.compile(r'qrcode.*?(https?://qr\.qq\.com/[^\s\r\n]+)', re.IGNORECASE),
    re.compile(r'(https://qr\.qq\.com/[^\s\r\n]+)'),
    re.compile(r'二维码[：:](https?://[^\s\r\n]+)'),
]


def _extract_qr_url_from_logs(logs: str) -> str:
    """从 NapCat 容器日志中提取二维码 URL，兼容多种日志格式。
    返回 URL 字符串，未找到则返回空字符串。
    """
    for pattern in _QR_URL_PATTERNS:
        m = pattern.search(logs)
        if m:
            url = m.group(1).strip()
            if url:
                return url
    return ""


class CreateRequest(BaseModel):
    name: str
    node_id: str = "local"
    # 高级选项（均有默认值，快速创建无需填写）
    docker_image: str = ""          # 空则取全局配置
    webui_port: int = 0             # 0 = 自动分配
    http_port: int = 0              # OneBot HTTP 端口（容器内 3001）
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


# ============ 公开容器状态（无需认证） ============

@router.get("/public/containers")
async def api_public_containers():
    """公开容器列表 - 返回基本状态与登录信息，不需要认证。

    对运行中的本地容器并行批量触发登录检测（线程池并行 + 整体 6s 超时）。
    """
    containers = await run_in_threadpool(cluster_manager.list_all_containers)

    # 批量并行检测运行中本地容器的登录状态（使用分级缓存，实际 API 调用远少于容器数）
    running_local_names = [
        c["name"] for c in containers
        if c["status"] == "running" and c.get("node_id", "local") == "local"
    ]
    if running_local_names:
        try:
            await run_in_threadpool(docker_manager.batch_check_login, running_local_names, 8.0)
        except Exception:
            logger.warning("公开容器列表：批量登录检测异常")

    result = []
    for c in containers:
        item = {
            "id": c.get("id", ""),
            "name": c["name"],
            "status": c["status"],
            "node_id": c.get("node_id", "local"),
        }
        cached = read_login_cache(c["name"])
        if c["status"] == "running" and cached.get("logged_in") and cached.get("uin"):
            item["uin"] = cached["uin"]
            item["qq_logged_in"] = True
            item["kicked"] = False
        elif c["status"] == "running" and cached.get("kicked"):
            # QQ 被踢下线：容器在运行但 QQ 掉线且不会推二维码，需要重启
            item["uin"] = cached.get("uin", "")
            item["qq_logged_in"] = False
            item["kicked"] = True
        else:
            item["qq_logged_in"] = False
            item["kicked"] = False
        result.append(item)
    return {"status": "ok", "containers": result}


@router.post("/public/containers/{name}/restart")
async def api_public_restart_container(name: str, node_id: str = "local"):
    """公开重启接口（无需认证）——专供用户面板在QQ掉线时自助重启容器。

    仅允许 restart 操作（不允许 stop / delete 等危险操作）。
    重启后清除该容器的登录状态缓存，使前端能立即感知到状态变化。
    """
    from services.docker_manager import _login_cache
    import time as _time

    success = await run_in_threadpool(cluster_manager.action_container, node_id, name, "restart")
    if not success:
        raise HTTPException(status_code=500, detail="重启失败，容器可能不存在或无法操作")

    # 清除登录缓存，让下次检测能立即触发新的状态探测
    _login_cache[name] = {"logged_in": False, "ts": _time.time()}
    logger.info("用户面板触发容器 %s 重启（公开接口）", name)
    return {"status": "ok", "message": f"容器 {name} 重启指令已发送"}


@router.get("/public/qr/batch")
async def api_batch_qr_status():
    """批量获取所有运行中容器的 QR / 登录状态（用户面板专用）。

    核心优化：登录检测和 QR 读取全部通过文件系统（Docker Volume 宿主机路径）完成，
    零网络请求，彻底解决容器多时 HTTP 探测堆积卡顿问题。
    """
    import time as _time
    containers = await run_in_threadpool(cluster_manager.list_all_containers)
    running = [c for c in containers if c["status"] == "running"]

    if not running:
        return {"status": "ok", "items": {}}

    # 批量并行检测登录状态（主要走文件系统，几乎无耗时）
    running_local_names = [
        c["name"] for c in running if c.get("node_id", "local") == "local"
    ]
    if running_local_names:
        try:
            await run_in_threadpool(docker_manager.batch_check_login, running_local_names, 8.0)
        except Exception:
            logger.warning("批量 QR 状态：登录检测异常，将使用现有缓存")

    def resolve_one(c: dict) -> tuple:
        """单容器 QR 解析（在线程池中执行）"""
        name = c["name"]
        node_id = c.get("node_id", "local")

        cached = read_login_cache(name)

        # 已登录 → 直接返回
        if cached.get("logged_in"):
            return name, {"status": "logged_in", "uin": cached.get("uin", "")}

        # kicked（被踢下线）→ 不推二维码，提示需要重启
        if cached.get("kicked"):
            return name, {"status": "need_restart", "uin": cached.get("uin", "")}

        # 远程节点
        if node_id != "local":
            try:
                result = cluster_manager.get_qr_status(node_id, name)
                if result:
                    return name, result
            except Exception:
                pass
            return name, {"status": "waiting"}

        # 本地未登录：从 Docker Volume 读 qrcode.png（零网络请求）
        try:
            if docker_manager.client:
                container_obj = docker_manager.client.containers.get(name)
                vol = docker_manager._get_volume_paths(container_obj)
                # qrcode.png 在 QQ data volume 下的 NapCat cache 目录
                qq_dir = vol.get("qq", "")
                config_dir = vol.get("config", "")

                # 先尝试 QQ volume 下的 cache 目录
                qr_path = ""
                for search_dir in [qq_dir, config_dir]:
                    if not search_dir:
                        continue
                    candidate = os.path.join(search_dir, "NapCat", "cache", "qrcode.png")
                    if os.path.exists(candidate):
                        qr_path = candidate
                        break
                    candidate2 = os.path.join(search_dir, "cache", "qrcode.png")
                    if os.path.exists(candidate2):
                        qr_path = candidate2
                        break

                if qr_path:
                    age = _time.time() - os.path.getmtime(qr_path)
                    if age < 120:  # 2分钟内的二维码才有效
                        with open(qr_path, "rb") as f:
                            data = base64.b64encode(f.read()).decode("utf-8")
                        return name, {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
        except Exception:
            pass

        # 文件系统读取失败 → 用 docker get_archive（备用，有一定耗时）
        try:
            png_bytes = docker_manager.get_qrcode_from_fs(name)
            if png_bytes:
                data = base64.b64encode(png_bytes).decode("utf-8")
                return name, {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
        except Exception:
            pass

        # 最终兜底：从 Docker 日志提取二维码 URL（兼容多种 NapCat 日志格式）
        try:
            if docker_manager.client:
                c_obj = docker_manager.client.containers.get(name)
                logs = c_obj.logs(tail=100).decode("utf-8", errors="ignore")
                qr_url = _extract_qr_url_from_logs(logs)
                if qr_url:
                    return name, {"status": "ok", "url": qr_url, "type": "log"}
        except Exception:
            pass

        return name, {"status": "waiting"}

    # 并行解析所有容器的 QR 状态
    import asyncio
    tasks = [run_in_threadpool(resolve_one, c) for c in running]
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=12.0,
        )
    except asyncio.TimeoutError:
        results = []

    items = {}
    for r in results:
        if isinstance(r, tuple):
            items[r[0]] = r[1]
    return {"status": "ok", "items": items}


# ============ 容器列表 ============

@router.get("/containers")
async def api_list_containers(session: dict = Depends(get_current_user)):
    containers = await run_in_threadpool(cluster_manager.list_all_containers)
    # 附带 qq_logged_in 字段，让管理员面板也能正确显示"待登录"状态
    for c in containers:
        if c.get("status") == "running" and c.get("node_id", "local") == "local":
            cache = read_login_cache(c["name"])
            if cache.get("logged_in") and cache.get("uin"):
                c.setdefault("uin", cache["uin"])
                c["qq_logged_in"] = True
            else:
                c["qq_logged_in"] = False
        else:
            c["qq_logged_in"] = False
    return {"status": "ok", "containers": containers}


# ============ 创建容器 ============

@router.post("/containers", dependencies=[Depends(speed_limit(5.0))])
async def api_create_container(
    req: CreateRequest, request: Request,
    session: dict = Depends(require_admin),
):
    # 校验容器名称格式
    if not _CONTAINER_NAME_RE.match(req.name):
        raise HTTPException(
            status_code=400,
            detail="容器名称只能包含字母、数字、连字符、下划线和点号，长度 1-64 字符，且必须以字母或数字开头",
        )

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
    # NapCat 容器实际端口：WebUI=6099, OneBot HTTP=3001
    used_ports = docker_manager.get_used_ports()
    webui_base = app_config.get("webui_base_port", 6000)
    http_base  = app_config.get("http_base_port",  3001)   # OneBot HTTP 在容器内监听 3001

    webui_port = req.webui_port if req.webui_port > 0 else docker_manager.find_available_port(webui_base, used_ports)
    used_ports.add(webui_port)
    http_port = req.http_port if req.http_port > 0 else docker_manager.find_available_port(http_base, used_ports)

    ports = {
        "6099/tcp": webui_port,
        "3001/tcp": http_port,   # OneBot HTTP（容器内 3001，非 3000）
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
        "ports": {"webui": webui_port, "http": http_port},
    })
    return {"status": "ok", "container_id": cid, "ports": {"webui": webui_port, "http": http_port}}


# ============ 容器操作 (启动/停止/重启/删除...) ============

@router.post("/containers/{name}/action", dependencies=[Depends(speed_limit(2.0))])
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

    # 执行会导致容器停止/重启/暂停/删除的操作后，立即清除登录状态缓存。
    # 防止容器因 restart_policy=always 被 Docker 自动重启后，旧缓存
    # (logged_in=True, TTL 尚未到期) 持续误报"已登录"状态。
    if action in ("stop", "restart", "kill", "pause", "delete") and node_id == "local":
        from services.docker_manager import _login_cache
        import time as _time
        _login_cache[name] = {"logged_in": False, "ts": _time.time()}
        logger.info("容器 %s 执行 [%s]，已清除登录状态缓存", name, action)

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

@router.get("/containers/stats/batch")
async def get_batch_stats(session: dict = Depends(get_current_user)):
    """批量获取所有容器的统计信息，后端并行+超时隔离。

    替代前端逐一请求 /containers/{name}/stats 的模式，
    单个容器超时不影响其他容器的数据返回。
    """
    import asyncio
    containers = await run_in_threadpool(cluster_manager.list_all_containers)
    running = [c for c in containers if c["status"] == "running"]

    async def fetch_one(c: dict) -> tuple:
        name = c["name"]
        node_id = c.get("node_id", "local")
        if not check_instance_permission(session, node_id, name):
            return name, {}
        try:
            stats = await run_in_threadpool(cluster_manager.get_stats, node_id, name)
            return name, stats
        except Exception:
            return name, {}

    stats_map = {}
    if running:
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*[fetch_one(c) for c in running], return_exceptions=True),
                timeout=8.0,
            )
            for item in results:
                if isinstance(item, tuple):
                    stats_map[item[0]] = item[1]
        except asyncio.TimeoutError:
            logger.warning("批量 stats 整体超时（8s），部分容器可能无数据")
    return {"status": "ok", "stats": stats_map}


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


@router.get("/containers/{name}/logs/download")
async def download_container_logs(
    name: str, lines: int = 2000, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    """下载容器日志为纯文本文件"""
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    logs = await run_in_threadpool(cluster_manager.get_logs, node_id, name, lines)
    import time
    ts = time.strftime("%Y%m%d_%H%M%S")
    filename = f"{name}_logs_{ts}.txt"
    return PlainTextResponse(
        content=logs or "",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============ QR 码 ============

@router.get("/containers/{name}/qrcode")
async def get_qr_code(
    name: str, node_id: str = "local"
):
    """二维码接口（无需认证）。

    策略：缓存优先 → 文件 → 主动探测 → 日志回落。
    - 步骤 0: 读内存缓存（零阻塞）
    - 步骤 1: 读本地 qrcode.png（文件新鲜 <120s 且 <30s → 直接返回；>30s → 主动探测登录）
    - 步骤 2: 文件不存在/过期 → 触发 check_login_status（带 8s TTL 缓存保护）
    - 步骤 3: 回落从 Docker 日志提取二维码 URL
    """
    import re

    if node_id != "local":
        result = await run_in_threadpool(cluster_manager.get_qr_status, node_id, name)
        if result:
            return result
        return {"status": "waiting"}

    # 0. 只读内存缓存判断是否已登录或 kicked（不触发任何 API 调用，零阻塞）
    cached = read_login_cache(name)
    if cached.get("logged_in"):
        return {"status": "logged_in", "uin": cached.get("uin", "")}
    # kicked：QQ 被踢下线，不会推二维码，提示用户重启容器
    if cached.get("kicked"):
        return {"status": "need_restart", "uin": cached.get("uin", "")}

    # 1. 优先读本地挂载目录中的二维码文件（NapCat 未登录时持续输出）
    import time as _time
    qr_file_fresh = False
    try:
        # 优先尝试新创建容器的绑定挂载路径
        qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
        # 若本地路径不存在，尝试从 Docker Volume 宿主机路径查找
        if not os.path.exists(qr_path) and docker_manager.client:
            try:
                container_obj = docker_manager.client.containers.get(name)
                vol = docker_manager._get_volume_paths(container_obj)
                for search_dir in [vol.get("qq", ""), vol.get("config", "")]:
                    if not search_dir:
                        continue
                    for subpath in ["NapCat/cache/qrcode.png", "cache/qrcode.png"]:
                        candidate = os.path.join(search_dir, subpath)
                        if os.path.exists(candidate):
                            qr_path = candidate
                            break
                    if os.path.exists(qr_path):
                        break
            except Exception:
                pass
        if os.path.exists(qr_path):
            age = _time.time() - os.path.getmtime(qr_path)
            if age < 120:
                qr_file_fresh = True
                # 文件新鲜（2 分钟内更新过）→ NapCat 正在输出二维码 → 未登录
                with open(qr_path, "rb") as f:
                    data = base64.b64encode(f.read()).decode("utf-8")
                # 如果文件已经超过 30s 没更新，可能刚登录成功 → 主动探测一次
                if age > 30:
                    login = await run_in_threadpool(docker_manager.check_login_status, name)
                    if login.get("logged_in"):
                        return {"status": "logged_in", "uin": login.get("uin", "")}
                return {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
            # 文件已过期（超过 2 分钟未更新）→ 可能已登录，不返回旧二维码
    except Exception as e:
        logger.debug(f"读取本地二维码文件失败: {e}")

    # 2. 文件不存在/过期 → 主动触发登录检测（走文件系统，几乎无开销）
    if not qr_file_fresh:
        try:
            login = await run_in_threadpool(docker_manager.check_login_status, name)
            if login.get("logged_in"):
                return {"status": "logged_in", "uin": login.get("uin", "")}
        except Exception:
            pass

    # 2.5 尝试用 docker get_archive 从容器内读取 qrcode.png（老容器兜底）
    if not qr_file_fresh:
        try:
            png_bytes = await run_in_threadpool(docker_manager.get_qrcode_from_fs, name)
            if png_bytes:
                data = base64.b64encode(png_bytes).decode("utf-8")
                return {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
        except Exception:
            pass

    # 3. 回落：从 Docker 日志提取二维码 URL（兼容多种 NapCat 日志格式）
    try:
        if docker_manager.client:
            container = docker_manager.client.containers.get(name)
            if container.status != "running":
                return {"status": "waiting"}
            logs = container.logs(tail=100).decode('utf-8', errors='ignore')
            qr_url = _extract_qr_url_from_logs(logs)
            if qr_url:
                return {"status": "ok", "url": qr_url, "type": "log"}
    except Exception as e:
        logger.debug(f"从日志获取二维码失败: {e}")

    return {"status": "waiting"}


# ============ 登录状态刷新（用户主动触发） ============

@router.post("/containers/{name}/refresh-login")
async def refresh_login_status(
    name: str, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    """用户主动刷新登录状态。
    立即触发 A(OneBot) → B(WebUI) 级联检测，跳过缓存。
    """
    if node_id != "local":
        # 远程节点暂不支持，返回未知状态
        return {"status": "ok", "logged_in": False, "method": "remote_unsupported"}

    login = await run_in_threadpool(docker_manager.check_login_status, name, True)
    return {
        "status": "ok",
        "logged_in": login.get("logged_in", False),
        "uin": login.get("uin", ""),
        "nickname": login.get("nickname", ""),
        "method": login.get("method", ""),
    }


# ============ 插件事件端点（方案 C 预留） ============

@router.post("/internal/login-event")
async def receive_login_event(request: Request):
    """方案 C 预留：NapCat 插件推送登录/登出事件。
    插件在容器内通过 HTTP 回调此端点，直接更新后端缓存。
    需要 x-internal-key 头验证（防止外部滥用）。
    """
    # 简单的内部 API Key 验证
    internal_key = request.headers.get("x-internal-key", "")
    expected_key = app_config.get("internal_api_key", "")
    if not expected_key or internal_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid internal key")

    body = await request.json()
    container_name = body.get("name", "")
    if not container_name:
        raise HTTPException(status_code=400, detail="Missing container name")

    docker_manager.update_login_cache(container_name, body)
    return {"status": "ok"}


# ============ 容器路径解析（支持 bind mount 与 Docker named volume 两种形态） ============

# sub_path 到 Docker 容器内挂载点的映射（用于从 Volume 反查宿主机路径）
_SUBPATH_TO_DEST = {
    "config":  "/app/napcat/config",
    "qq_data": "/app/.config/QQ",
    "plugins": "/app/napcat/plugins",
    "cache":   "/app/napcat/cache",
}


def _resolve_container_dir(name: str, sub_path: str) -> str:
    """解析容器子目录的宿主机绝对路径，优先 bind mount 本地目录，兜底 Docker Volume。

    sub_path 示例：'config'、'qq_data'、'cache'
    返回存在的宿主机目录路径，未找到则返回空字符串。
    """
    # 优先：新建容器使用 bind mount，路径在 data_dir/{name}/{sub_path}
    local_dir = os.path.join(get_data_dir(), name, sub_path)
    if os.path.isdir(local_dir):
        return local_dir

    # 兜底：旧容器使用 Docker named volume，从容器 Mounts 中找宿主机路径
    try:
        if not docker_manager.client:
            return ""
        c = docker_manager.client.containers.get(name)
        dest_target = _SUBPATH_TO_DEST.get(sub_path, "")
        for m in c.attrs.get("Mounts", []):
            dest = m.get("Destination", "")
            src  = m.get("Source", "")
            if not src:
                continue
            # 精确匹配或前缀匹配（sub_path='config' → dest='/app/napcat/config'）
            if dest_target and dest == dest_target:
                if os.path.isdir(src):
                    return src
            # 通用兜底：按 sub_path 关键字匹配 destination
            if sub_path == "config" and "/napcat/config" in dest and os.path.isdir(src):
                return src
            if sub_path == "qq_data" and ("/.config/QQ" in dest or "/app/.config" in dest) and os.path.isdir(src):
                return src
    except Exception as e:
        logger.debug("_resolve_container_dir %s/%s 失败: %s", name, sub_path, e)
    return ""


def _resolve_container_file(name: str, filename: str) -> str:
    """将形如 'config/onebot11_xxx.json' 的相对路径解析为宿主机绝对路径。

    先拆分首段（sub_path），用 _resolve_container_dir 定位宿主机目录，
    再拼接剩余部分，并做路径遍历检查。
    返回存在或可写的绝对路径；解析失败则返回空字符串。
    """
    parts = filename.replace("\\", "/").split("/", 1)
    sub_path = parts[0]
    rest = parts[1] if len(parts) > 1 else ""

    base_dir = _resolve_container_dir(name, sub_path)
    if not base_dir:
        # 未找到 volume，退回全局 data_dir（保持原有行为）
        return os.path.join(get_data_dir(), name, filename)

    if rest:
        full = os.path.realpath(os.path.join(base_dir, rest))
        real_base = os.path.realpath(base_dir)
        if not full.startswith(real_base):
            raise HTTPException(status_code=400, detail="Invalid path: directory traversal detected")
        return full
    return base_dir


# ============ 配置文件读写 ============

@router.get("/containers/{name}/config/{filename:path}")
def read_container_config(
    name: str, filename: str,
    session: dict = Depends(get_current_user),
):
    try:
        file_path = _resolve_container_file(name, filename)
    except HTTPException:
        raise
    except Exception:
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
    try:
        file_path = _resolve_container_file(name, filename)
    except HTTPException:
        raise
    except Exception:
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
    # path 形如 '' / 'config' / 'qq_data' / 'config/subdir'
    if path:
        parts = path.replace("\\", "/").split("/", 1)
        sub_path = parts[0]
        rest = parts[1] if len(parts) > 1 else ""
        base_dir = _resolve_container_dir(name, sub_path)
        if base_dir:
            if rest:
                target_dir = os.path.realpath(os.path.join(base_dir, rest))
                if not target_dir.startswith(os.path.realpath(base_dir)):
                    raise HTTPException(status_code=400, detail="Invalid path")
            else:
                target_dir = base_dir
        else:
            target_dir = _safe_path(get_data_dir(), name, path)
    else:
        target_dir = _safe_path(get_data_dir(), name, "")

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
