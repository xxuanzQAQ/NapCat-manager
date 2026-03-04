"""
Docker 容器管理器 - 重构版
修复: 裸 except → 具体异常, print → logger, import 整理
"""
import os
import re
import io
import json
import tarfile
import urllib.request
import docker
import docker.errors
from typing import List, Dict, Optional

from services.log import logger
from services.config import get_data_dir


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
            containers = self.client.containers.list(all=True)
        except docker.errors.DockerException as e:
            logger.error("列举容器失败: %s", e)
            return []

        res = []
        for c in containers:
            try:
                tags_str = str(c.image.tags).lower()
            except Exception:
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
            return c.logs(tail=lines).decode("utf-8", errors="replace")
        except docker.errors.NotFound:
            return ""
        except docker.errors.APIError as e:
            logger.error("获取容器 %s 日志失败: %s", name, e)
            return ""

    def get_container_file_binary(self, name: str, path: str) -> Optional[bytes]:
        """通过 docker cp (tar) 从容器内读取文件"""
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)
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
        except docker.errors.NotFound:
            return None
        except Exception as e:
            logger.debug("读取容器文件 %s:%s 失败: %s", name, path, e)
            return None
        return None

    def get_basic_stats(self, name: str) -> Dict:
        """获取容器基础资源统计 (CPU / 内存)"""
        if not self.client:
            return {}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return {
                    "status": c.status,
                    "created": c.attrs.get("Created", ""),
                    "cpu_percent": 0.0,
                    "mem_usage": 0.0,
                    "mem_limit": 0.0,
                }

            stats = c.stats(stream=False)
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

            return {
                "status": c.status,
                "created": c.attrs.get("Created", ""),
                "cpu_percent": round(cpu_percent, 2),
                "mem_usage": round(mem_usage / 1024 / 1024, 2),
                "mem_limit": round(mem_limit / 1024 / 1024, 2),
            }
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

        # WebUI 端口 — 从 NetworkSettings 或 HostConfig 获取
        try:
            ports_dict = c.attrs.get("NetworkSettings", {}).get("Ports", {})
            if "6099/tcp" in ports_dict and ports_dict["6099/tcp"]:
                info["webui_port"] = int(ports_dict["6099/tcp"][0]["HostPort"])
        except (KeyError, IndexError, ValueError):
            pass
        # 备选：容器重启中 NetworkSettings 可能为空，从 HostConfig 读取
        if not info["webui_port"]:
            try:
                hc_ports = c.attrs.get("HostConfig", {}).get("PortBindings", {})
                if "6099/tcp" in hc_ports and hc_ports["6099/tcp"]:
                    info["webui_port"] = int(hc_ports["6099/tcp"][0]["HostPort"])
            except (KeyError, IndexError, ValueError):
                pass

        # WebUI token — 优先从宿主机本地文件读取，容器重启期间也可用
        try:
            local_webui = os.path.join(get_data_dir(), name, "config", "webui.json")
            if os.path.exists(local_webui):
                with open(local_webui, "r", encoding="utf-8") as f:
                    w_config = json.loads(f.read())
                    if "token" in w_config:
                        info["webui_token"] = w_config["token"]
        except (json.JSONDecodeError, OSError):
            pass

        # UIN from config file name
        try:
            config_dir = os.path.join(get_data_dir(), name, "config")
            if os.path.exists(config_dir):
                # 寻找最新的 napcat_*.json (防止多个遗留导致登录号错乱)
                napcat_files = []
                for f in os.listdir(config_dir):
                    if f.startswith("napcat_") and f.endswith(".json"):
                        napcat_files.append(os.path.join(config_dir, f))
                if napcat_files:
                    latest_file = max(napcat_files, key=os.path.getmtime)
                    latest_f_name = os.path.basename(latest_file)
                    info["uin"] = latest_f_name.replace("napcat_", "").replace(".json", "")

                    # 自动更新 webui.json 以便重启自动登录
                    try:
                        local_webui = os.path.join(config_dir, "webui.json")
                        if os.path.exists(local_webui):
                            with open(local_webui, "r", encoding="utf-8") as wf:
                                w_config = json.loads(wf.read())

                            modified = False
                            if "login" not in w_config or not isinstance(w_config["login"], dict):
                                w_config["login"] = {}
                                modified = True

                            login_cfg = w_config["login"]
                            if login_cfg.get("account") != info["uin"]:
                                login_cfg["account"] = info["uin"]
                                login_cfg["password"] = ""  # 账号变化，清空旧密码以防冲突
                                modified = True

                            if login_cfg.get("autoLoginAccount") != info["uin"]:
                                login_cfg["autoLoginAccount"] = info["uin"]
                                modified = True

                            # 若有些版本使用全局的 autoLoginAccount
                            if w_config.get("autoLoginAccount") != info["uin"]:
                                w_config["autoLoginAccount"] = info["uin"]
                                modified = True

                            if modified:
                                with open(local_webui, "w", encoding="utf-8") as wf:
                                    json.dump(w_config, wf, indent=4, ensure_ascii=False)
                    except Exception as e:
                        logger.debug("同步自动登录配置失败: %s", e)
        except OSError:
            pass

        # NapCat API info
        try:
            if info.get("webui_port"):
                url = f"http://127.0.0.1:{info['webui_port']}/plugin/napcat-plugin-builtin/api/public/info"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=2) as response:
                    api_out = json.loads(response.read().decode("utf-8"))
                    if api_out.get("code") == 0 and "data" in api_out:
                        info["uptime_formatted"] = api_out["data"].get("uptimeFormatted", "")
                        info["platform"] = api_out["data"].get("platform", "")
        except Exception:
            pass

        # Network endpoints — 从宿主机本地文件读取
        if info["uin"] != "未登录 / Not Logged In":
            try:
                cfg_path = os.path.join(get_data_dir(), name, "config", f"napcat_{info['uin']}.json")
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

        # Version from logs
        try:
            logs_tail = c.logs(tail=2000).decode("utf-8", errors="ignore")
            ver_match = re.search(r"NapCat\.Core Version:\s*([\d.]+)", logs_tail)
            if ver_match:
                info["version"] = ver_match.group(1)
        except docker.errors.APIError:
            pass

        return info

    def get_stats(self, name: str) -> Dict:
        """获取完整统计 (基础资源 + NapCat 信息)"""
        basic = self.get_basic_stats(name)
        if not basic:
            return {}
        napcat = self.get_napcat_info(name)
        return {**basic, **napcat}

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
        except Exception:
            pass
        return used

    def find_available_port(self, base: int, used_ports: set) -> int:
        """从 base 开始找到下一个可用端口"""
        port = base
        while port in used_ports:
            port += 1
        return port


docker_manager = DockerManager()

