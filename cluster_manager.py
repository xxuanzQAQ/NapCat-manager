import requests
import json
import os
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from docker_manager import docker_manager

class ClusterManager:
    def __init__(self, nodes_file, config_file):
        self.nodes_file = nodes_file
        self.config_file = config_file
        
    def get_nodes(self):
        if not os.path.exists(self.nodes_file):
            return []
        with open(self.nodes_file, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except:
                return []

    def save_nodes(self, nodes):
        with open(self.nodes_file, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=4, ensure_ascii=False)

    def get_nodes_with_status(self):
        nodes = self.get_nodes()
        result = []
        
        # Ensure local node is handled
        has_local = any(n.get("id") == "local" for n in nodes)
        if not has_local:
            result.append({
                "id": "local",
                "name": "本地节点",
                "address": "127.0.0.1",
                "status": "online",
                "ping": 0
            })
            
        def check_node(node):
            node_copy = node.copy()
            if node.get("id") == "local":
                import psutil
                node_copy["status"] = "online"
                node_copy["ping"] = 0
                node_copy["system"] = {
                    "cpu_percent": psutil.cpu_percent(interval=None) or 0.1,
                    "mem_percent": psutil.virtual_memory().percent
                }
                return node_copy
                
            status = "offline"
            ping = -1
            system_info = {}
            try:
                start_time = time.time()
                addr = node['address']
                if not addr.startswith("http"):
                    addr = "http://" + addr
                url = f"{addr}/api/cluster/status"
                resp = requests.get(url, headers={"x-request-api-key": node["api_key"]}, timeout=1.2)
                ping = int((time.time() - start_time) * 1000)
                if resp.status_code == 200:
                    status = "online"
                    system_info = resp.json().get("system", {})
            except:
                pass
            
            node_copy["status"] = status
            node_copy["ping"] = ping
            node_copy["system"] = system_info
            return node_copy

        with ThreadPoolExecutor(max_workers=max(len(nodes), 1)) as executor:
            checked_nodes = list(executor.map(check_node, nodes))
            
        for cn in checked_nodes:
            if cn["id"] == "local" and not has_local:
                continue
            result.append(cn)
            
        return result

    def list_all_containers(self):
        nodes = self.get_nodes()
        all_containers = []
        
        # Local containers - run in main thread or pool, but we handle it separately
        local_containers = docker_manager.list_containers()
        for c in local_containers:
            c["node_id"] = "local"
            all_containers.append(c)
            
        def fetch_node_containers(node):
            if node["id"] == "local":
                return []
            try:
                addr = node['address']
                if not addr.startswith("http"):
                    addr = "http://" + addr
                url = f"{addr}/api/containers"
                resp = requests.get(url, headers={"x-request-api-key": node["api_key"]}, timeout=1.5)
                if resp.status_code == 200:
                    remote_data = resp.json()
                    containers = remote_data.get("containers", [])
                    for c in containers:
                        c["node_id"] = node["id"]
                    return containers
            except Exception as e:
                print(f"Failed to fetch containers from node {node['id']}: {e}")
            return []

        with ThreadPoolExecutor(max_workers=max(len(nodes), 1)) as executor:
            results = executor.map(fetch_node_containers, nodes)
            for containers in results:
                all_containers.extend(containers)
                
        return all_containers

    def action_container(self, node_id, name, action):
        if node_id == "local" or not node_id:
            return docker_manager.action_container(name, action)
        
        # Find remote node
        nodes = self.get_nodes()
        node = next((n for n in nodes if n["id"] == node_id), None)
        if not node:
            # Fallback to local if node not found and requested local or ambiguous
            return docker_manager.action_container(name, action)
            
        try:
            addr = node['address']
            if not addr.startswith("http"):
                addr = "http://" + addr
            url = f"{addr}/api/containers/{name}/action?action={action}"
            resp = requests.post(url, headers={"x-request-api-key": node["api_key"]}, timeout=2.5)
            return resp.status_code == 200
        except Exception as e:
            print(f"Failed to forward action to node {node_id}: {e}")
            return False

    def get_stats(self, node_id, name):
        if node_id == "local" or not node_id:
            return docker_manager.get_stats(name)
            
        nodes = self.get_nodes()
        node = next((n for n in nodes if n["id"] == node_id), None)
        if not node:
            return {}
            
        try:
            addr = node['address']
            if not addr.startswith("http"):
                addr = "http://" + addr
            url = f"{addr}/api/containers/{name}/stats"
            resp = requests.get(url, headers={"x-request-api-key": node["api_key"]}, timeout=2.5)
            if resp.status_code == 200:
                stats = resp.json()
                stats["node_id"] = node_id
                return stats
        except:
            pass
        return {}
    
    def get_logs(self, node_id, name, lines=100):
        if node_id == "local" or not node_id:
            return docker_manager.get_logs(name, lines)
            
        nodes = self.get_nodes()
        node = next((n for n in nodes if n["id"] == node_id), None)
        if not node:
            return ""
            
        try:
            addr = node['address']
            if not addr.startswith("http"):
                addr = "http://" + addr
            url = f"{addr}/api/containers/{name}/logs?lines={lines}"
            resp = requests.get(url, headers={"x-request-api-key": node["api_key"]}, timeout=2.5)
            if resp.status_code == 200:
                return resp.json().get("logs", "")
        except:
            pass
        return ""

    def get_qr_status(self, node_id, name):
        if node_id == "local" or not node_id:
            # We need to manually handle this in main.py for now as it's complex 
            # or proxy it here. Let's proxy it.
            return None # Fallback to existing logic in main.py for local
            
        nodes = self.get_nodes()
        node = next((n for n in nodes if n["id"] == node_id), None)
        if not node:
            return None
            
        try:
            addr = node['address']
            if not addr.startswith("http"):
                addr = "http://" + addr
            url = f"{addr}/api/qr/{name}"
            resp = requests.get(url, headers={"x-request-api-key": node["api_key"]}, timeout=2.5)
            if resp.status_code == 200:
                return resp.json()
        except:
            pass
        return None

cluster_manager = ClusterManager(
    nodes_file=os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "nodes.json"),
    config_file=os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "config.json")
)
