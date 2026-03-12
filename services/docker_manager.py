"""
Docker 容器管理器 - 重构版
修复: 裸 except → 具体异常, print → logger, import 整理
"""
import os
import re
import io
import json
import time
import tarfile
import hashlib
import base64
import urllib.request
import urllib.error
import docker
import docker.errors
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import List, Dict, Optional, Any

from services.log import logger
from services.config import get_data_dir


# 登录状态缓存：{container_name: {uin, nickname, ts, method}}
_login_cache: Dict[str, Dict] = {}
# 已登录容器缓存 120s（状态稳定，无需频繁探测）
# 未登录容器缓存 20s（需要更新二维码，但也不能太频繁）
_LOGIN_CACHE_TTL_LOGGED_IN = 120   # 秒：已登录容器缓存时长
_LOGIN_CACHE_TTL_NOT_LOGGED = 20   # 秒：未登录容器缓存时长（减少无效探测）
_LOGIN_CACHE_TTL = 120  # 兼容旧代码的默认值，实际走上面两个分支

# Stats 缓存：{container_name: {stats_dict, ts}}
_stats_cache: Dict[str, Dict] = {}
_STATS_CACHE_TTL = 12  # 秒，stats 采集较慢(1-2s)，缓存 12s 减轻 Docker API 压力

# Docker API 调用专用线程池 - 三层隔离，彻底消除线程池耗尽与嵌套死锁：
#
# _docker_pool:      顶层任务池 —— check_login_status / get_stats / get_basic_stats 等复合任务
#                    worker 数 = 64：避免创建过多线程消耗内存，通过缓存机制减少实际并发量
#
# _docker_io_pool:   中层 HTTP IO 池 —— check_login_via_webui 内的 _fetch_qrcode/_fetch_public_info
#                    worker 数 = 64：限制并发 HTTP 连接数，防止服务器连接耗尽
#
# _docker_sys_pool:  系统调用专用池 —— containers.list / c.stats / c.logs / images.list
#                    纯 Docker socket 调用，独立不与 HTTP 请求竞争
#                    worker 数 = 32：stats 调用每次约 1-2s，32 workers 支撑 32 个并发采集
#                    注意：64容器全并发时每批最多 32 个同时执行，其余排队但有缓存兜底
#
# 三池完全隔离：上层提交不会因下层满载而死锁，下层也不会被上层任务挤占
_docker_pool     = ThreadPoolExecutor(max_workers=64,  thread_name_prefix="docker-api")
_docker_io_pool  = ThreadPoolExecutor(max_workers=64,  thread_name_prefix="docker-io")
_docker_sys_pool = ThreadPoolExecutor(max_workers=32,  thread_name_prefix="docker-sys")
_DOCKER_STATS_TIMEOUT = 4   # 秒，c.stats(stream=False) 超时，适当放宽避免误判
_DOCKER_LOGS_TIMEOUT = 2    # 秒，c.logs() 超时


def _normalize_uin(raw: str) -> str:
    """归一化 QQ 号：仅保留数字，去除 protocol_ 等前缀。"""
    return ''.join(ch for ch in str(raw) if ch.isdigit())


def read_login_cache(name: str) -> Dict[str, Any]:
    """公开接口：只读访问登录状态缓存（供 router 层使用，零阻塞）。"""
    return _login_cache.get(name, {})


class DockerManager:
    def __init__(self):
        try:
            self.client = docker.from_env()
            logger.info("Docker 连接成功")
        except docker.errors.DockerException as e:
            logger.error("Docker 连接失败: %s", e)
            self.client = None

    def list_containers(self) -> List[Dict]:
        if not self.client:
            return []
        try:
            future = _docker_sys_pool.submit(self.client.containers.list, all=True)
            containers = future.result(timeout=_DOCKER_STATS_TIMEOUT)
        except FuturesTimeoutError:
            logger.warning("Docker 容器列表获取超时")
            return []
        except docker.errors.DockerException as e:
            logger.error("列举容器失败: %s", e)
            return []

        res = []
        for c in containers:
            try:
                tags_str = str(c.image.tags).lower()
            except (AttributeError, IndexError):
                tags_str = ""
            if "napcat" in tags_str or "napcat" in c.name.lower():
                res.append({
                    "id": c.short_id,
                    "name": c.name,
                    "status": c.status,
                    "image": str(c.image.tags[0]) if c.image.tags else "unknown",
                    "created": c.attrs.get("Created", ""),
                })
        return res

    def create_container(
        self, name: str,
        volumes: Optional[Dict] = None,
        ports: Optional[Dict] = None,
        docker_image: str = "mlikiowa/napcat-docker:latest",
        **extra_kwargs,
    ) -> Optional[str]:
        if not self.client:
            return None
        try:
            run_kwargs = {
                "name": name,
                "detach": True,
                "environment": extra_kwargs.pop("environment", {"ACCOUNT": ""}),
                "restart_policy": extra_kwargs.pop("restart_policy", {"Name": "always"}),
            }
            if volumes:
                run_kwargs["volumes"] = volumes
            if ports:
                run_kwargs["ports"] = ports
            # 合并高级参数 (mem_limit, network_mode 等)
            run_kwargs.update(extra_kwargs)

            container = self.client.containers.run(docker_image, **run_kwargs)
            logger.info("容器 %s 创建成功 (id=%s)", name, container.short_id)
            return container.short_id
        except docker.errors.ImageNotFound:
            logger.error("镜像 %s 不存在，请先拉取", docker_image)
            return None
        except docker.errors.APIError as e:
            logger.error("创建容器 %s 失败: %s", name, e)
            return None

    def action_container(self, name: str, action: str) -> bool:
        if not self.client:
            return False
        try:
            c = self.client.containers.get(name)
            if action == "start":
                c.start()
            elif action == "stop":
                c.stop()
            elif action == "restart":
                c.restart()
            elif action == "pause":
                c.pause()
            elif action == "unpause":
                c.unpause()
            elif action == "kill":
                c.kill()
            elif action == "delete":
                try:
                    c.stop(timeout=2)
                except docker.errors.APIError:
                    pass
                c.remove(force=True)
            else:
                logger.warning("未知操作: %s", action)
                return False
            logger.info("容器 %s 执行 [%s] 成功", name, action)
            return True
        except docker.errors.NotFound:
            logger.error("容器 %s 不存在", name)
            return False
        except docker.errors.APIError as e:
            logger.error("容器 %s 执行 [%s] 失败: %s", name, action, e)
            return False

    def get_logs(self, name: str, lines: int = 100) -> str:
        if not self.client:
            return ""
        try:
            c = self.client.containers.get(name)
            future = _docker_sys_pool.submit(c.logs, tail=lines)
            raw = future.result(timeout=_DOCKER_LOGS_TIMEOUT + 3)
            return raw.decode("utf-8", errors="replace")
        except docker.errors.NotFound:
            return ""
        except FuturesTimeoutError:
            logger.warning("容器 %s 日志获取超时", name)
            return "[日志获取超时，容器可能无响应]\n"
        except docker.errors.APIError as e:
            logger.error("获取容器 %s 日志失败: %s", name, e)
            return ""

    def get_container_file_binary(self, name: str, path: str) -> Optional[bytes]:
        """通过 docker cp (tar) 从容器内读取文件，带超时保护"""
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)

            def _read_archive():
                bits, _ = c.get_archive(path)
                tar_stream = io.BytesIO()
                for chunk in bits:
                    tar_stream.write(chunk)
                tar_stream.seek(0)
                with tarfile.open(fileobj=tar_stream) as tar:
                    member = tar.next()
                    if member:
                        file_obj = tar.extractfile(member)
                        if file_obj:
                            return file_obj.read()
                return None

            future = _docker_sys_pool.submit(_read_archive)
            return future.result(timeout=5)
        except FuturesTimeoutError:
            logger.warning("容器 %s 文件读取超时: %s", name, path)
            return None
        except docker.errors.NotFound:
            return None
        except (docker.errors.APIError, tarfile.TarError, OSError) as e:
            logger.debug("读取容器文件 %s:%s 失败: %s", name, path, e)
            return None
        return None

    def get_basic_stats(self, name: str) -> Dict:
        """获取容器基础资源统计 (CPU / 内存)，带内存缓存（TTL 8s）。
        Docker stats API 有超时保护，避免卡死容器阻塞线程池。
        """
        now = time.time()
        cached = _stats_cache.get(name)
        if cached and now - cached.get("_ts", 0) < _STATS_CACHE_TTL:
            return {k: v for k, v in cached.items() if k != "_ts"}

        if not self.client:
            return {}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                result = {
                    "status": c.status,
                    "created": c.attrs.get("Created", ""),
                    "cpu_percent": 0.0,
                    "mem_usage": 0.0,
                    "mem_limit": 0.0,
                }
                _stats_cache[name] = {**result, "_ts": now}
                return result

            # 用线程池 + 超时包裹 Docker stats API，防止卡死容器阻塞
            future = _docker_sys_pool.submit(c.stats, stream=False)
            try:
                stats = future.result(timeout=_DOCKER_STATS_TIMEOUT)
            except (FuturesTimeoutError, Exception) as e:
                logger.warning("容器 %s stats 超时或异常: %s", name, e)
                # 超时时返回上次缓存或零值
                if cached:
                    return {k: v for k, v in cached.items() if k != "_ts"}
                return {
                    "status": c.status,
                    "created": c.attrs.get("Created", ""),
                    "cpu_percent": 0.0, "mem_usage": 0.0, "mem_limit": 0.0,
                }

            mem_usage = stats.get("memory_stats", {}).get("usage", 0)
            mem_limit = stats.get("memory_stats", {}).get("limit", 0)
            cpu_delta = (
                stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
                - stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
            )
            system_delta = (
                stats.get("cpu_stats", {}).get("system_cpu_usage", 0)
                - stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
            )
            cpu_percent = 0.0
            if system_delta > 0 and cpu_delta > 0:
                percpu = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("percpu_usage", [1])
                cpu_percent = (cpu_delta / system_delta) * len(percpu) * 100.0

            result = {
                "status": c.status,
                "created": c.attrs.get("Created", ""),
                "cpu_percent": round(cpu_percent, 2),
                "mem_usage": round(mem_usage / 1024 / 1024, 2),
                "mem_limit": round(mem_limit / 1024 / 1024, 2),
            }
            _stats_cache[name] = {**result, "_ts": now}
            return result
        except docker.errors.NotFound:
            return {}
        except docker.errors.APIError as e:
            logger.error("获取容器 %s 统计失败: %s", name, e)
            return {}

    def get_napcat_info(self, name: str) -> Dict:
        """获取 NapCat 扩展信息 (UIN, 版本, WebUI token 等)"""
        info: Dict = {
            "uin": "未登录 / Not Logged In",
            "version": "Unknown",
            "webui_token": "",
            "webui_port": 0,
            "http_port": 0,
            "platform": "",
            "uptime_formatted": "",
            "network_endpoints": {"http": 0, "ws": 0, "http_client": 0, "ws_client": 0},
        }
        if not self.client:
            return info

        try:
            c = self.client.containers.get(name)
        except docker.errors.NotFound:
            return info

        # 端口解析 — 使用公共方法
        # NapCat 容器实际端口：WebUI=6099, OneBot HTTP=3001（非标准 3000）
        info["webui_port"] = self.resolve_host_port(c, "6099/tcp")
        info["http_port"] = self.resolve_host_port(c, "3001/tcp")

        # WebUI token — 优先从宿主机本地文件读取
        try:
            local_webui = os.path.join(get_data_dir(), name, "config", "webui.json")
            if os.path.exists(local_webui):
                with open(local_webui, "r", encoding="utf-8") as f:
                    w_config = json.loads(f.read())
                    if "token" in w_config:
                        info["webui_token"] = w_config["token"]
        except (json.JSONDecodeError, OSError):
            pass

        # UIN — 只读内存缓存（由 get_stats 定期写入，不在此触发 API 调用）
        cached = _login_cache.get(name, {})
        if cached.get("logged_in") and cached.get("uin"):
            info["uin"] = cached["uin"]
            self._sync_webui_auto_login(name, cached["uin"])

        # NapCat API info
        try:
            if info.get("webui_port"):
                url = f"http://127.0.0.1:{info['webui_port']}/plugin/napcat-plugin-builtin/api/public/info"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=1) as response:
                    api_out = json.loads(response.read().decode("utf-8"))
                    if api_out.get("code") == 0 and "data" in api_out:
                        info["uptime_formatted"] = api_out["data"].get("uptimeFormatted", "")
                        info["platform"] = api_out["data"].get("platform", "")
        except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
            pass

        # Network endpoints — 从宿主机本地 onebot11_{uin}.json 文件读取
        if info["uin"] != "未登录 / Not Logged In":
            try:
                cfg_path = os.path.join(get_data_dir(), name, "config", f"onebot11_{info['uin']}.json")
                if os.path.exists(cfg_path):
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        uin_config = json.loads(f.read())
                    net = uin_config.get("network", {})
                    info["network_endpoints"]["http"] = len([s for s in net.get("httpServers", []) if s.get("enable")])
                    info["network_endpoints"]["ws"] = len([s for s in net.get("websocketServers", []) if s.get("enable")])
                    info["network_endpoints"]["http_client"] = len([s for s in net.get("httpClients", []) if s.get("enable")])
                    info["network_endpoints"]["ws_client"] = len([s for s in net.get("websocketClients", []) if s.get("enable")])
            except (json.JSONDecodeError, OSError):
                pass

        # Version from logs — 用线程池 + 超时包裹，防止卡死容器阻塞
        try:
            future = _docker_sys_pool.submit(c.logs, tail=200)
            raw_logs = future.result(timeout=_DOCKER_LOGS_TIMEOUT)
            logs_tail = raw_logs.decode("utf-8", errors="ignore")
            ver_match = re.search(r"NapCat\.Core Version:\s*([\d.]+)", logs_tail)
            if ver_match:
                info["version"] = ver_match.group(1)
        except (FuturesTimeoutError, docker.errors.APIError, Exception):
            pass

        return info

    def get_stats(self, name: str) -> Dict:
        """获取完整统计 (基础资源 + NapCat 信息 + 登录状态)。

        三个子任务并行执行，各自有超时保护，单个子任务失败不阻塞其他。
        """
        # 并行提交三个子任务
        f_basic = _docker_pool.submit(self.get_basic_stats, name)
        f_napcat = _docker_pool.submit(self.get_napcat_info, name)
        f_login = _docker_pool.submit(self.check_login_status, name)

        try:
            basic = f_basic.result(timeout=_DOCKER_STATS_TIMEOUT + 1)
        except Exception:
            basic = {}
        if not basic:
            return {}

        try:
            napcat = f_napcat.result(timeout=_DOCKER_LOGS_TIMEOUT + 2)
        except Exception:
            napcat = {}

        try:
            login = f_login.result(timeout=4)
        except Exception:
            login = {}

        if login.get("logged_in") and login.get("uin"):
            napcat["uin"] = login["uin"]
        return {**basic, **napcat}

    # ============ 端口解析 ============

    def resolve_host_port(self, container, internal_port: str) -> int:
        """从容器对象解析内部端口对应的宿主机映射端口，返回 0 表示未找到"""
        try:
            ports_dict = container.attrs.get("NetworkSettings", {}).get("Ports", {})
            if internal_port in ports_dict and ports_dict[internal_port]:
                return int(ports_dict[internal_port][0]["HostPort"])
        except (KeyError, IndexError, ValueError):
            pass
        try:
            hc_ports = container.attrs.get("HostConfig", {}).get("PortBindings", {})
            if internal_port in hc_ports and hc_ports[internal_port]:
                return int(hc_ports[internal_port][0]["HostPort"])
        except (KeyError, IndexError, ValueError):
            pass
        return 0

    # ============ 登录状态检测 ============

    def _get_volume_paths(self, container_obj) -> Dict[str, str]:
        """从容器 Mounts 信息中提取 Volume 的宿主机路径。
        返回 {'config': '/sd/docker-data/volumes/xxx/_data',
               'qq':     '/sd/docker-data/volumes/yyy/_data'}
        完全不发网络请求，纯内存操作。
        """
        paths: Dict[str, str] = {}
        try:
            for m in container_obj.attrs.get("Mounts", []):
                dest = m.get("Destination", "")
                src  = m.get("Source", "")
                if not src:
                    continue
                if "/napcat/config" in dest:
                    paths["config"] = src
                elif "/.config/QQ" in dest or "/app/.config" in dest:
                    paths["qq"] = src
        except Exception:
            pass
        return paths

    def check_login_via_fs(self, name: str) -> Dict:
        """【主检测方案】直接读 Docker Volume 文件系统，零网络请求。

        判断逻辑（必须同时满足）：
          1. 容器处于 running 状态（掉线/停止 → 直接返回未登录，清除旧缓存）
          2. config volume 中存在 onebot11_{uin}.json 或 napcat_{uin}.json
             或 webui.json 的 autoLoginAccount 非空
          3. QQ volume 中存在活跃 session 文件（nt_qq 目录或 nt_token 文件）
             ── 防止 QQ 掉线后仅凭旧配置文件误判为已登录

        返回：{logged_in, uin, method:'fs'} 或 {logged_in: False}
        """
        if not self.client:
            return {"logged_in": False}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                # 容器不在运行 → 强制清除登录缓存，避免旧缓存持续误报已登录
                if name in _login_cache:
                    _login_cache[name] = {"logged_in": False, "ts": time.time()}
                return {"logged_in": False}
        except docker.errors.NotFound:
            return {"logged_in": False}

        vol = self._get_volume_paths(c)
        config_dir = vol.get("config", "")
        qq_dir = vol.get("qq", "")

        if not config_dir or not os.path.isdir(config_dir):
            return {"logged_in": False}

        try:
            files = os.listdir(config_dir)
        except OSError:
            return {"logged_in": False}

        # 从配置文件提取候选 uin
        # 优先级1：webui.json 的 autoLoginAccount（权威当前账号，NapCat 登录成功后自动更新）
        # 当容器曾登录多个 QQ 号时 config 目录会保留多个 onebot11_*.json 历史文件，
        # 仅凭文件名无法判断当前活跃账号；autoLoginAccount 始终反映最新登录的账号。
        candidate_uin = ""
        webui_path = os.path.join(config_dir, "webui.json")
        if os.path.exists(webui_path):
            try:
                cfg = json.loads(open(webui_path, "r", encoding="utf-8").read())
                uin = str(cfg.get("autoLoginAccount", "") or "").strip()
                if uin and uin.isdigit() and uin != "0":
                    candidate_uin = uin
            except (json.JSONDecodeError, OSError):
                pass

        # 优先级2：onebot11_{uin}.json 文件名（兜底）
        if not candidate_uin:
            for f in files:
                if f.startswith("onebot11_") and f.endswith(".json"):
                    uin = f[len("onebot11_"):-len(".json")].strip()
                    if uin and uin.isdigit():
                        candidate_uin = uin
                        break

        # 优先级3：napcat_{uin}.json 文件名（再次兜底）
        if not candidate_uin:
            for f in files:
                if f.startswith("napcat_") and f.endswith(".json") and f != "napcat.json":
                    uin = f[len("napcat_"):-len(".json")].strip()
                    if uin and uin.isdigit():
                        candidate_uin = uin
                        break

        if not candidate_uin:
            return {"logged_in": False}

        # 关键验证：检查 QQ volume 中是否存在活跃的 session/token 文件
        # QQ 掉线后这些文件通常仍存在，但我们检测最近是否有活跃 nt_qq 目录
        # 若无 QQ volume 挂载（旧容器）则跳过此验证，直接信任配置文件
        if qq_dir and os.path.isdir(qq_dir):
            # 检查 nt_qq 目录存在且有 nt_token 或 session 文件（会话活跃的标志）
            session_found = False
            try:
                for root, dirs, fnames in os.walk(qq_dir):
                    depth = root.replace(qq_dir, "").count(os.sep)
                    if depth > 3:
                        dirs.clear()
                        continue
                    for fname in fnames:
                        if fname in ("nt_token", "nt_token.json", "token.json") or \
                                fname.endswith(".token"):
                            session_found = True
                            break
                    if session_found:
                        break
                    # nt_qq_* 目录存在即认为有 session
                    for d in dirs:
                        if d.startswith("nt_qq_") or d == "nt_qq":
                            session_found = True
                            break
                    if session_found:
                        break
            except OSError:
                session_found = True  # 读取失败时不拦截，信任配置文件

            if not session_found:
                # QQ volume 中找不到 session 文件 → QQ 可能已退出登录
                return {"logged_in": False}

        # 通过所有检验 → 已登录
        method = "fs" if any(f.startswith("onebot11_") for f in files) else "fs_napcat"
        return {"logged_in": True, "uin": candidate_uin, "method": method}

    def get_qrcode_from_fs(self, name: str) -> Optional[bytes]:
        """直接从容器内读取 qrcode.png（通过 docker get_archive）。
        比 HTTP WebUI 请求快且不需要认证。120s 内的文件才返回（避免返回旧码）。
        """
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return None

            def _read():
                bits, stat = c.get_archive("/app/napcat/cache/qrcode.png")
                # stat 含 mtime 信息
                mtime = stat.get("mtime", "")
                buf = io.BytesIO()
                for chunk in bits:
                    buf.write(chunk)
                buf.seek(0)
                with tarfile.open(fileobj=buf) as tar:
                    member = tar.next()
                    if member:
                        f = tar.extractfile(member)
                        if f:
                            return f.read()
                return None

            future = _docker_sys_pool.submit(_read)
            return future.result(timeout=4)
        except Exception:
            return None

    def check_login_via_onebot(self, name: str) -> Dict:
        """方案 A（备用）：通过 OneBot HTTP API 检测，仅在端口存在时尝试。
        NapCat 容器 OneBot HTTP 监听容器内 3001 端口（非 3000）。
        """
        if not self.client:
            return {"logged_in": False}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return {"logged_in": False}
            http_port = self.resolve_host_port(c, "3001/tcp")
            if not http_port:
                return {"logged_in": False}  # 无端口直接跳过，不等超时
            req = urllib.request.Request(
                f"http://127.0.0.1:{http_port}/get_login_info",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            if result.get("status") == "ok" and result.get("data", {}).get("user_id"):
                uid = str(result["data"]["user_id"])
                if uid and uid != "0":
                    return {
                        "logged_in": True,
                        "uin": uid,
                        "nickname": result["data"].get("nickname", ""),
                        "method": "onebot",
                    }
        except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
            pass
        except docker.errors.NotFound:
            pass
        return {"logged_in": False}

    def check_online_via_onebot(self, name: str) -> Optional[bool]:
        """通过 OneBot /get_status 检测 QQ 实时在线状态（仅用于掉线感知轮询）。

        与 check_login_via_onebot 的区别：
          - check_login_via_onebot 用 /get_login_info 判断"是否完成登录"
          - 本方法用 /get_status 判断"QQ 当前是否在线"，能感知 KickedOffLine 掉线

        返回值：
          True  → QQ 在线（online=true）
          False → QQ 离线（online=false，如被踢下线）
          None  → 无法判断（端口不通、容器未运行等），不更新缓存
        """
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return False
            http_port = self.resolve_host_port(c, "3001/tcp")
            if not http_port:
                return None  # 没有暴露 OneBot HTTP 端口，无法判断
            req = urllib.request.Request(
                f"http://127.0.0.1:{http_port}/get_status",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            if result.get("status") == "ok" and "data" in result:
                return bool(result["data"].get("online", False))
            # retcode != 0 或无 data，无法确认，不误判
            return None
        except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
            return None  # 网络不通、超时 → 不误判为离线
        except docker.errors.NotFound:
            return False

    def poll_online_status(self) -> None:
        """后台轮询：对"已登录"和"kicked"状态容器调用 /get_status，感知 QQ 掉线与恢复。

        策略：
          已登录容器（logged_in=True）：
            - online=True  → 不动缓存
            - online=False → 写入 kicked=True 标记，永久锁定离线状态，
                             阻止 check_login_status 的 WebUI 层将其覆盖回已登录
            - None → 不动缓存，避免误判

          kicked 容器（kicked=True）：
            - online=True  → 解除 kicked，恢复正常检测（说明用户已重启并重新登录）
            - online=False / None → 保持 kicked 不变

        由 main.py 中的 background_online_poller 每 15 秒调用一次。
        """
        now = time.time()
        # 快照所有需要关注的容器（已登录 或 kicked），避免遍历时字典被并发修改
        targets = [
            name for name, v in list(_login_cache.items())
            if v.get("logged_in") or v.get("kicked")
        ]
        for name in targets:
            try:
                online = self.check_online_via_onebot(name)
                cached = _login_cache.get(name, {})

                if cached.get("logged_in") and online is False:
                    # 在线 → 掉线：写入 kicked 标记，TTL 设为超长阻止 WebUI 覆盖
                    uin = cached.get("uin", "")
                    _login_cache[name] = {
                        "logged_in": False,
                        "kicked": True,
                        "uin": uin,
                        "ts": now,
                    }
                    logger.info(
                        "容器 %s QQ 掉线（/get_status online=false），标记为 kicked", name
                    )

                elif cached.get("kicked") and online is True:
                    # kicked → 重新在线：解除锁定，清空缓存让 check_login_status 重新探测
                    _login_cache[name] = {"logged_in": False, "ts": 0}
                    logger.info(
                        "容器 %s 重新在线（/get_status online=true），解除 kicked 标记", name
                    )

                # 其余情况不动缓存
            except Exception as e:
                logger.debug("poll_online_status 容器 %s 异常: %s", name, e)

    def _get_webui_credential(self, webui_port: int, config_dir: str) -> str:
        """通过 NapCat WebUI JWT 认证流程获取 Bearer Credential。

        流程：
          1. 读 config_dir/webui.json 获取 token（明文密码）
          2. hash = sha256(token + ".napcat").hexdigest()
          3. POST /api/auth/login {"hash": hash} → {"Credential": "<base64_json>"}
        返回 base64 字符串，失败返回空字符串。
        """
        try:
            webui_path = os.path.join(config_dir, "webui.json")
            if not os.path.exists(webui_path):
                return ""
            with open(webui_path, "r", encoding="utf-8") as f:
                token = json.loads(f.read()).get("token", "")
            if not token:
                return ""
            pw_hash = hashlib.sha256((token + ".napcat").encode()).hexdigest()
            login_req = urllib.request.Request(
                f"http://127.0.0.1:{webui_port}/api/auth/login",
                data=json.dumps({"hash": pw_hash}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(login_req, timeout=3) as r:
                resp = json.loads(r.read())
                return resp.get("data", {}).get("Credential", "")
        except (urllib.error.URLError, json.JSONDecodeError, OSError, KeyError):
            pass
        return ""

    def check_login_via_webui(self, name: str) -> Dict:
        """【主检测方案】通过 NapCat WebUI JWT API 权威验证真实登录状态。

        流程：
          1. 获取容器 webui_port（6099/tcp 映射端口）
          2. 从 config volume 读 webui.json → token → sha256 hash
          3. POST /api/auth/login 获取 JWT Credential
          4. POST /api/QQLogin/CheckLoginStatus → {isLogin, qrcodeurl}
          5. 已登录时从配置文件提取 uin；未登录时返回 qrcode_url

        返回：
          已登录：{logged_in: True, uin, method: 'webui'}
          未登录：{logged_in: False, qrcode_url, method: 'webui'}
          失败：  {logged_in: False}
        """
        if not self.client:
            return {"logged_in": False}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return {"logged_in": False}

            webui_port = self.resolve_host_port(c, "6099/tcp")
            if not webui_port:
                return {"logged_in": False}

            # 获取 config volume 路径
            vol = self._get_volume_paths(c)
            config_dir = vol.get("config", "")
            # 兜底：尝试宿主机本地 data 目录
            if not config_dir or not os.path.isdir(config_dir):
                config_dir = os.path.join(get_data_dir(), name, "config")

            if not config_dir or not os.path.isdir(config_dir):
                return {"logged_in": False}

            # 获取 JWT Credential
            credential = self._get_webui_credential(webui_port, config_dir)
            if not credential:
                logger.debug("容器 %s WebUI 认证失败，无法获取 Credential", name)
                return {"logged_in": False}

            # 调用 CheckLoginStatus
            check_req = urllib.request.Request(
                f"http://127.0.0.1:{webui_port}/api/QQLogin/CheckLoginStatus",
                data=b"{}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {credential}",
                },
                method="POST",
            )
            with urllib.request.urlopen(check_req, timeout=3) as r:
                data = json.loads(r.read()).get("data", {})

            is_login = data.get("isLogin", False)
            qrcode_url = data.get("qrcodeurl", "")

            if is_login:
                # 已登录：从配置文件提取候选 uin
                uin = self._get_uin_from_config_dir(config_dir)
                return {"logged_in": True, "uin": uin, "method": "webui"}
            else:
                return {"logged_in": False, "qrcode_url": qrcode_url, "method": "webui"}

        except docker.errors.NotFound:
            pass
        except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
            logger.debug("容器 %s WebUI 检测失败: %s", name, e)
        return {"logged_in": False}

    def _get_uin_from_config_dir(self, config_dir: str) -> str:
        """从 config 目录读取当前登录的 uin。

        优先级（从高到低）：
          1. webui.json 的 autoLoginAccount —— NapCat 在登录成功后自动写入，是权威的"当前账号"
             当一个容器曾经登录过多个 QQ 号时，config 目录会保留多个 onebot11_*.json 历史文件，
             仅靠文件名无法判断哪个是当前活跃账号，而 autoLoginAccount 始终反映最新的活跃账号。
          2. onebot11_{uin}.json 文件名 —— 仅当 autoLoginAccount 为空时兜底
          3. napcat_{uin}.json 文件名 —— 再次兜底

        注意：仅用于在 WebUI 已确认登录后补充 uin，不做登录状态判断。
        """
        if not config_dir or not os.path.isdir(config_dir):
            return ""

        # 优先级1：webui.json autoLoginAccount（权威当前账号）
        try:
            webui_path = os.path.join(config_dir, "webui.json")
            if os.path.exists(webui_path):
                cfg = json.loads(open(webui_path, "r", encoding="utf-8").read())
                uin = str(cfg.get("autoLoginAccount", "") or "").strip()
                if uin and uin.isdigit() and uin != "0":
                    return uin
        except (json.JSONDecodeError, OSError):
            pass

        # 优先级2/3：从文件名兜底（历史容器未写 autoLoginAccount 时）
        try:
            files = os.listdir(config_dir)
        except OSError:
            return ""
        for f in files:
            if f.startswith("onebot11_") and f.endswith(".json"):
                uin = f[len("onebot11_"):-len(".json")].strip()
                if uin and uin.isdigit():
                    return uin
        for f in files:
            if f.startswith("napcat_") and f.endswith(".json") and f != "napcat.json":
                uin = f[len("napcat_"):-len(".json")].strip()
                if uin and uin.isdigit():
                    return uin
        return ""

    def _get_uin_from_config(self, name: str) -> str:
        """从容器 Volume 的 onebot11_*.json 文件名提取 uin（兼容旧逻辑保留）"""
        if not self.client:
            return ""
        try:
            c = self.client.containers.get(name)
            vol = self._get_volume_paths(c)
            config_dir = vol.get("config", "")
            if not config_dir or not os.path.isdir(config_dir):
                config_dir = os.path.join(get_data_dir(), name, "config")
            return self._get_uin_from_config_dir(config_dir)
        except (docker.errors.NotFound, OSError):
            pass
        return ""

    def _sync_webui_auto_login(self, name: str, uin: str) -> None:
        """登录成功后自动同步 Volume 内 webui.json 的 autoLoginAccount"""
        if not self.client:
            return
        try:
            c = self.client.containers.get(name)
            vol = self._get_volume_paths(c)
            config_dir = vol.get("config", "")
            if not config_dir:
                return
            webui_path = os.path.join(config_dir, "webui.json")
            if not os.path.exists(webui_path):
                return
            with open(webui_path, "r", encoding="utf-8") as wf:
                w_config = json.loads(wf.read())
            modified = False
            if w_config.get("autoLoginAccount") != uin:
                w_config["autoLoginAccount"] = uin
                modified = True
            if "login" not in w_config or not isinstance(w_config["login"], dict):
                w_config["login"] = {}
                modified = True
            login_cfg = w_config["login"]
            if login_cfg.get("account") != uin:
                login_cfg["account"] = uin
                login_cfg["password"] = ""
                modified = True
            if modified:
                with open(webui_path, "w", encoding="utf-8") as wf:
                    json.dump(w_config, wf, indent=4, ensure_ascii=False)
        except (docker.errors.NotFound, json.JSONDecodeError, OSError, KeyError) as e:
            logger.debug("同步自动登录配置失败: %s", e)

    def check_login_status(self, name: str, force: bool = False) -> Dict:
        """检测登录状态，优先级：kicked 锁定 > 缓存 TTL > WebUI JWT API > OneBot HTTP。

        kicked 状态：由 poll_online_status 在检测到 /get_status online=false 时写入。
                     kicked=True 时跳过 WebUI 检测（WebUI 的 isLogin 在 KickedOffLine
                     后仍返回 true，不可信），直接返回离线，直到轮询到 online=True 为止。
        WebUI API：通过 NapCat WebUI /api/QQLogin/CheckLoginStatus 获取真实登录状态。
        OneBot HTTP：通过 /get_login_info 验证。
        缓存：已登录 TTL=120s，未登录 TTL=20s。
        """
        now = time.time()

        if name in _login_cache:
            cached = _login_cache[name]

            # kicked 状态：完全绕过 WebUI 检测，直接返回，由轮询器负责解除
            if cached.get("kicked"):
                return cached

            if not force:
                ttl = _LOGIN_CACHE_TTL_LOGGED_IN if cached.get("logged_in") else _LOGIN_CACHE_TTL_NOT_LOGGED
                if now - cached.get("ts", 0) < ttl:
                    return cached

        # 层 1：WebUI JWT API（权威，直接返回 isLogin 字段）
        result = self.check_login_via_webui(name)
        if result.get("method") == "webui":
            # 写入缓存前再次检查 kicked（防止 poll_online_status 刚写入的 kicked 被覆盖）
            # kicked 由 poll_online_status 独占管理，WebUI 无权覆盖
            current = _login_cache.get(name, {})
            if current.get("kicked"):
                return current
            result["ts"] = now
            _login_cache[name] = result
            return result

        # 层 2：OneBot HTTP（仅当容器有 3001 端口且启用了 httpServers 时才有效）
        result = self.check_login_via_onebot(name)
        if result["logged_in"]:
            current = _login_cache.get(name, {})
            if current.get("kicked"):
                return current
            result["ts"] = now
            _login_cache[name] = result
            return result

        # WebUI 和 OneBot 都失败（容器无网络端口或未运行）→ 返回未登录
        # 同样需要守护 kicked 状态
        current = _login_cache.get(name, {})
        if current.get("kicked"):
            return current
        result = {"logged_in": False, "ts": now}
        _login_cache[name] = result
        return result

    def batch_check_login(self, names: List[str], timeout: float = 8.0) -> Dict[str, Dict]:
        """批量并行检测多个容器的登录状态。

        利用线程池并行执行，单个超时不阻塞其他。
        60+ 实例场景：缓存命中的直接返回，未命中的并行 API 探测。
        使用分级 TTL：已登录 120s，未登录 20s。
        返回 {name: {logged_in, uin, ...}, ...}
        """
        results: Dict[str, Dict] = {}
        need_check: List[str] = []
        now = time.time()

        # 先过滤：缓存命中的直接返回，无需占线程池
        # kicked 容器永久命中缓存（不受 TTL 限制），只有 poll_online_status 才能解除
        # 已登录用长缓存，未登录用短缓存
        for name in names:
            cached = _login_cache.get(name, {})
            # kicked 状态：永不过期，直接返回缓存，防止 WebUI 覆盖
            if cached.get("kicked"):
                results[name] = cached
                continue
            ttl = _LOGIN_CACHE_TTL_LOGGED_IN if cached.get("logged_in") else _LOGIN_CACHE_TTL_NOT_LOGGED
            if now - cached.get("ts", 0) < ttl:
                results[name] = cached
            else:
                need_check.append(name)

        if not need_check:
            return results

        # 并行提交未命中缓存的检测任务
        futures = {
            _docker_pool.submit(self.check_login_status, name): name
            for name in need_check
        }
        from concurrent.futures import as_completed, TimeoutError as FuturesTimeoutError
        try:
            for future in as_completed(futures, timeout=timeout):
                name = futures[future]
                try:
                    results[name] = future.result(timeout=0.1)
                except Exception:
                    results[name] = {"logged_in": False}
        except FuturesTimeoutError:
            # 部分任务在 timeout 内未完成（高并发或网络慢），静默处理
            logger.debug(
                "batch_check_login 超时：%d/%d 个容器未完成，标记为未登录",
                sum(1 for n in need_check if n not in results),
                len(need_check),
            )
        # 超时或异常未完成的统一标记为未登录
        for name in need_check:
            if name not in results:
                results[name] = {"logged_in": False}
        return results

    @staticmethod
    def update_login_cache(name: str, event: Dict) -> None:
        """方案 C 预留：插件事件直接更新缓存。
        event 格式: {event: 'login'|'logout', uin, nickname}
        """
        if event.get("event") == "login" and event.get("uin"):
            _login_cache[name] = {
                "logged_in": True,
                "uin": str(event["uin"]),
                "nickname": event.get("nickname", ""),
                "method": "plugin",
                "ts": time.time(),
            }
        elif event.get("event") == "logout":
            _login_cache[name] = {
                "logged_in": False,
                "ts": time.time(),
            }

    def get_used_ports(self) -> set:
        """扫描所有已使用的宿主机端口（Docker容器 + 系统监听）"""
        used = set()
        # 1. Docker 容器端口
        if self.client:
            try:
                for c in self.client.containers.list(all=True):
                    ports_dict = c.attrs.get("NetworkSettings", {}).get("Ports", {})
                    for _, bindings in ports_dict.items():
                        if bindings:
                            for b in bindings:
                                try:
                                    used.add(int(b["HostPort"]))
                                except (KeyError, ValueError):
                                    pass
            except docker.errors.APIError:
                pass
        # 2. 系统监听端口（用 psutil 快速获取，避免逐端口 socket 扫描）
        try:
            import psutil
            for conn in psutil.net_connections(kind="tcp"):
                if conn.status == "LISTEN" and conn.laddr:
                    used.add(conn.laddr.port)
        except (ImportError, OSError, AttributeError):
            pass
        return used

    def find_available_port(self, base: int, used_ports: set) -> int:
        """从 base 开始找到下一个可用端口（不超过 65535）"""
        port = base
        while port in used_ports:
            port += 1
            if port > 65535:
                raise ValueError(f"没有可用端口（从 {base} 开始，所有端口均被占用）")
        return port

    # ============ 镜像管理 ============

    def list_images(self) -> List[Dict]:
        """列出本地 Docker 镜像"""
        if not self.client:
            return []
        try:
            future = _docker_sys_pool.submit(self.client.images.list)
            images = future.result(timeout=_DOCKER_STATS_TIMEOUT)
            result = []
            for img in images:
                tags = img.tags or []
                size_mb = round(img.attrs.get("Size", 0) / 1024 / 1024, 1)
                created = img.attrs.get("Created", "")
                result.append({
                    "id": img.short_id.replace("sha256:", ""),
                    "tags": tags,
                    "size": size_mb,
                    "created": created,
                })
            return result
        except FuturesTimeoutError:
            logger.warning("Docker 镜像列表获取超时")
            return []
        except docker.errors.DockerException as e:
            logger.error("列举镜像失败: %s", e)
            return []

    def pull_image(self, image_name: str) -> bool:
        """拉取 Docker 镜像"""
        if not self.client:
            return False
        try:
            self.client.images.pull(image_name)
            logger.info("镜像拉取成功: %s", image_name)
            return True
        except docker.errors.DockerException as e:
            logger.error("镜像拉取失败 %s: %s", image_name, e)
            return False

    def delete_image(self, image_id: str, force: bool = False) -> bool:
        """删除 Docker 镜像"""
        if not self.client:
            return False
        try:
            self.client.images.remove(image_id, force=force)
            logger.info("镜像删除成功: %s", image_id)
            return True
        except docker.errors.DockerException as e:
            logger.error("镜像删除失败 %s: %s", image_id, e)
            return False


docker_manager = DockerManager()

