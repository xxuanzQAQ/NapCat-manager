import docker
from typing import List, Dict, Optional

class DockerManager:
    def __init__(self):
        try:
            self.client = docker.from_env()
        except Exception as e:
            print(f"Failed to connect to Docker socket: {e}")
            self.client = None

    def list_containers(self) -> List[Dict]:
        if not self.client:
            return []
        
        # We only care about NapCat-Docker containers. We'll identify them by image or labels
        # Assuming the image is mlikiowa/napcat-docker
        containers = self.client.containers.list(all=True)
        res = []
        for c in containers:
            if "napcat" in str(c.image.tags).lower() or "napcat" in c.name.lower():
                res.append({
                    "id": c.short_id,
                    "name": c.name,
                    "status": c.status,
                    "image": str(c.image.tags[0]) if c.image.tags else "unknown",
                    "created": c.attrs['Created']
                })
        return res

    def create_container(self, name: str, volumes: Optional[Dict] = None, ports: Optional[Dict] = None, docker_image: str = "mlikiowa/napcat-docker:latest") -> Optional[str]:
        if not self.client:
            return None
        try:
            run_kwargs = {
                "name": name,
                "detach": True,
                "environment": {"ACCOUNT": ""}, # Can be parameterized
                "restart_policy": {"Name": "always"}
            }
            if volumes:
                run_kwargs["volumes"] = volumes
            if ports:
                run_kwargs["ports"] = ports
                
            container = self.client.containers.run(
                docker_image,
                **run_kwargs
            )
            return container.short_id
        except Exception as e:
            print(f"Error creating container {name}: {e}")
            return None

    def action_container(self, name: str, action: str):
        if not self.client:
            return False
        try:
            c = self.client.containers.get(name)
            if action == 'start':
                c.start()
            elif action == 'stop':
                c.stop()
            elif action == 'restart':
                c.restart()
            elif action == 'pause':
                c.pause()
            elif action == 'unpause':
                c.unpause()
            elif action == 'kill':
                c.kill()
            elif action == 'delete':
                try:
                    c.stop(timeout=2)
                except:
                    pass
                c.remove(force=True)
            return True
        except Exception as e:
            print(f"Error {action} container {name}: {e}")
            return False

    def get_logs(self, name: str, lines: int = 100) -> str:
        if not self.client:
            return ""
        try:
            c = self.client.containers.get(name)
            logs = c.logs(tail=lines).decode('utf-8', errors='replace')
            return logs
        except Exception as e:
            print(f"Error getting logs for container {name}: {e}")
            return ""

    def get_stats(self, name: str) -> Dict:
        if not self.client:
            return {}
        try:
            c = self.client.containers.get(name)
            if c.status != 'running':
                return {"cpu_percent": 0.0, "mem_usage": 0.0, "mem_limit": 0.0}
            
            stats = c.stats(stream=False)
            
            # Memory
            mem_usage = stats.get('memory_stats', {}).get('usage', 0)
            mem_limit = stats.get('memory_stats', {}).get('limit', 0)
            
            # CPU
            cpu_delta = stats.get('cpu_stats', {}).get('cpu_usage', {}).get('total_usage', 0) - stats.get('precpu_stats', {}).get('cpu_usage', {}).get('total_usage', 0)
            system_delta = stats.get('cpu_stats', {}).get('system_cpu_usage', 0) - stats.get('precpu_stats', {}).get('system_cpu_usage', 0)
            
            cpu_percent = 0.0
            if system_delta > 0 and cpu_delta > 0:
                cpu_percent = (cpu_delta / system_delta) * len(stats.get('cpu_stats', {}).get('cpu_usage', {}).get('percpu_usage', [1])) * 100.0
                
            # Base stats
            result = {
                "status": c.status,
                "created": c.attrs.get('Created', ''),
                "cpu_percent": round(cpu_percent, 2),
                "mem_usage": round(mem_usage / 1024 / 1024, 2), # MB
                "mem_limit": round(mem_limit / 1024 / 1024, 2)  # MB
            }
            
            # Fetch extended NapCat info
            result["uin"] = "未登录 / Not Logged In"
            result["version"] = "Unknown"
            result["webui_token"] = ""
            result["webui_port"] = 0
            
            try:
                # Find mapped port
                ports_dict = c.attrs.get('NetworkSettings', {}).get('Ports', {})
                if '6099/tcp' in ports_dict and ports_dict['6099/tcp']:
                    result["webui_port"] = int(ports_dict['6099/tcp'][0]['HostPort'])
            except:
                pass
            
            try:
                import os
                config_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", name, "config")
                if os.path.exists(config_dir):
                    for f in os.listdir(config_dir):
                        if f.startswith("napcat_") and f.endswith(".json"):
                            result["uin"] = f.replace("napcat_", "").replace(".json", "")
                            break
            except:
                pass
                
            try:
                # Fetch native NapCat info from internal API proxying localhost port
                import urllib.request
                import json
                if result.get("webui_port"):
                    req = urllib.request.Request(f"http://127.0.0.1:{result['webui_port']}/plugin/napcat-plugin-builtin/api/public/info", headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=2) as response:
                        api_out = response.read()
                        info_data = json.loads(api_out.decode('utf-8'))
                        if info_data.get("code") == 0 and "data" in info_data:
                            result["uptime_formatted"] = info_data["data"].get("uptimeFormatted", "")
                            result["platform"] = info_data["data"].get("platform", "")
            except:
                pass
                
            # Fetch UIN specific network configuration for endpoint discovery
            result["network_endpoints"] = {"http": 0, "ws": 0, "http_client": 0, "ws_client": 0}
            if result["uin"] != "未登录 / Not Logged In":
                try:
                    import json
                    cfg_data = self.get_container_file_binary(name, f"/app/napcat/config/napcat_{result['uin']}.json")
                    if cfg_data:
                        uin_config = json.loads(cfg_data.decode('utf-8'))
                        net = uin_config.get('network', {})
                        result["network_endpoints"]["http"] = len([s for s in net.get('httpServers', []) if s.get('enable')])
                        result["network_endpoints"]["ws"] = len([s for s in net.get('websocketServers', []) if s.get('enable')])
                        result["network_endpoints"]["http_client"] = len([s for s in net.get('httpClients', []) if s.get('enable')])
                        result["network_endpoints"]["ws_client"] = len([s for s in net.get('websocketClients', []) if s.get('enable')])
                except:
                    pass
                
            try:
                # Find Version in logs (check more lines in case it scrolled)
                logs_tail = c.logs(tail=2000).decode('utf-8', errors='ignore')
                import re
                ver_match = re.search(r'NapCat\.Core Version:\s*([\d\.]+)', logs_tail)
                if ver_match:
                    result["version"] = ver_match.group(1)
            except:
                pass
                
            try:
                # Fetch Token via tarball
                webui_data = self.get_container_file_binary(name, "/app/napcat/config/webui.json")
                if webui_data:
                    import json
                    w_config = json.loads(webui_data.decode('utf-8'))
                    if 'token' in w_config:
                        result["webui_token"] = w_config['token']
            except:
                pass
                
            return result
        except Exception as e:
            print(f"Error getting stats for container {name}: {e}")
            return {}

    def get_container_file_binary(self, name: str, path: str) -> Optional[bytes]:
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)
            import tarfile
            import io
            bits, _ = c.get_archive(path)
            tar_stream = io.BytesIO()
            for chunk in bits:
                tar_stream.write(chunk)
            tar_stream.seek(0)
            with tarfile.open(fileobj=tar_stream) as tar:
                member = tar.next()
                if member:
                    file_obj = tar.extractfile(member)
                    return file_obj.read()
        except Exception as e:
            return None

docker_manager = DockerManager()
