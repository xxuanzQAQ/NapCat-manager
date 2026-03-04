"""
集群/节点管理器 - 重构版
修复: 裸 except → 具体异常, print → logger, 路径使用 config 模块
"""
import json
import os
import time
import requests
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Any

from services.log import logger
from services.config import NODES_FILE, CONFIG_FILE
from services.docker_manager import docker_manager


class ClusterManager:
    def __init__(self, nodes_file: str, config_file: str):
        self.nodes_file = nodes_file
        self.config_file = config_file

    def get_nodes(self) -> List[Dict]:
        if not os.path.exists(self.nodes_file):
            return []
        try:
            with open(self.nodes_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning("读取节点配置失败: %s", e)
            return []

    def save_nodes(self, nodes: List[Dict]):
        with open(self.nodes_file, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=4, ensure_ascii=False)

    @staticmethod
    def _normalize_address(addr: str) -> str:
        if not addr.startswith("http"):
            addr = "http://" + addr
        return addr.rstrip("/")

    def get_nodes_with_status(self) -> List[Dict]:
        nodes = self.get_nodes()
        has_local = any(n.get("id") == "local" for n in nodes)
        if not has_local:
            nodes.insert(0, {
                "id": "local",
                "name": "本地节点",
                "address": "127.0.0.1"
            })

        def check_node(node: Dict) -> Dict:
            node_copy = node.copy()
            if node.get("id") == "local":
                import sys
                from services.config import app_config
                from services.daemon_monitor import daemon_monitor

                node_copy["status"] = "online"
                node_copy["ping"] = 0
                node_copy["api_key"] = app_config.get("api_key")
                node_copy["system"] = {
                    "cpu_percent": daemon_monitor.current_cpu,
                    "mem_percent": daemon_monitor.current_mem,
                    "platform": sys.platform,
                    "python_version": sys.version.split()[0],
                }
                node_copy["instances"] = daemon_monitor.get_instance_status()
                node_copy["chart"] = daemon_monitor.get_chart_data()
                return node_copy

            status = "offline"
            ping = -1
            system_info = {}
            instances_info = {}
            chart_info = {}
            try:
                addr = self._normalize_address(node["address"])
                start_time = time.time()
                resp = requests.get(
                    f"{addr}/api/cluster/status",
                    headers={"x-request-api-key": node.get("api_key", "")},
                    timeout=1.0,
                )
                ping = int((time.time() - start_time) * 1000)
                if resp.status_code == 200:
                    status = "online"
                    data = resp.json()
                    system_info = data.get("system", {})
                    instances_info = data.get("instances", {})
                    chart_info = data.get("chart", {})
            except requests.RequestException as e:
                logger.debug("节点 %s 连接失败: %s", node.get("id"), e)

            node_copy["status"] = status
            node_copy["ping"] = ping
            node_copy["system"] = system_info
            node_copy["instances"] = instances_info
            node_copy["chart"] = chart_info
            return node_copy

        # 增加并发数，加快并发检测速度
        with ThreadPoolExecutor(max_workers=max(len(nodes) * 2, 10)) as executor:
            return list(executor.map(check_node, nodes))

    def list_all_containers(self) -> List[Dict]:
        nodes = self.get_nodes()
        all_containers = []

        local_containers = docker_manager.list_containers()
        for c in local_containers:
            c["node_id"] = "local"
            all_containers.append(c)

        def fetch_node_containers(node: Dict) -> List[Dict]:
            if node["id"] == "local":
                return []
            try:
                addr = self._normalize_address(node["address"])
                resp = requests.get(
                    f"{addr}/api/containers",
                    headers={"x-request-api-key": node.get("api_key", "")},
                    timeout=1.5,
                )
                if resp.status_code == 200:
                    containers = resp.json().get("containers", [])
                    for c in containers:
                        c["node_id"] = node["id"]
                    return containers
            except requests.RequestException as e:
                logger.warning("从节点 %s 获取容器失败: %s", node.get("id"), e)
            return []

        with ThreadPoolExecutor(max_workers=max(len(nodes), 1)) as executor:
            results = executor.map(fetch_node_containers, nodes)
            for containers in results:
                all_containers.extend(containers)

        return all_containers

    def _proxy_to_node(self, node_id: str, method: str, path: str,
                       timeout: float = 2.5, **kwargs) -> Optional[requests.Response]:
        """通用远程节点请求代理"""
        nodes = self.get_nodes()
        node = next((n for n in nodes if n["id"] == node_id), None)
        if not node:
            logger.warning("节点 %s 不存在", node_id)
            return None
        try:
            addr = self._normalize_address(node["address"])
            resp = requests.request(
                method, f"{addr}{path}",
                headers={"x-request-api-key": node.get("api_key", "")},
                timeout=timeout,
                **kwargs,
            )
            return resp
        except requests.RequestException as e:
            logger.warning("代理请求到节点 %s 失败: %s", node_id, e)
            return None

    def action_container(self, node_id: str, name: str, action: str) -> bool:
        if node_id == "local" or not node_id:
            return docker_manager.action_container(name, action)
        resp = self._proxy_to_node(node_id, "POST", f"/api/containers/{name}/action?action={action}")
        return resp is not None and resp.status_code == 200

    def get_stats(self, node_id: str, name: str) -> Dict:
        if node_id == "local" or not node_id:
            return docker_manager.get_stats(name)
        resp = self._proxy_to_node(node_id, "GET", f"/api/containers/{name}/stats")
        if resp and resp.status_code == 200:
            stats = resp.json()
            stats["node_id"] = node_id
            return stats
        return {}

    def get_logs(self, node_id: str, name: str, lines: int = 100) -> str:
        if node_id == "local" or not node_id:
            return docker_manager.get_logs(name, lines)
        resp = self._proxy_to_node(node_id, "GET", f"/api/containers/{name}/logs?lines={lines}")
        if resp and resp.status_code == 200:
            return resp.json().get("logs", "")
        return ""

    def get_qr_status(self, node_id: str, name: str) -> Optional[Dict]:
        if node_id == "local" or not node_id:
            return None  # 本地由上层直接处理
        resp = self._proxy_to_node(node_id, "GET", f"/api/qr/{name}")
        if resp and resp.status_code == 200:
            return resp.json()
        return None


cluster_manager = ClusterManager(nodes_file=NODES_FILE, config_file=CONFIG_FILE)

