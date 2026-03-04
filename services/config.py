"""
配置管理单例 - 启动时加载，修改时热更新
对标 MCSM SystemConfig 模式，替代每次请求 load_config()
"""
import os
import json
import uuid
from typing import Any, Dict
from services.log import logger

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONFIG_DIR = os.path.join(BASE_DIR, "config")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
NODES_FILE = os.path.join(CONFIG_DIR, "nodes.json")
USERS_FILE = os.path.join(CONFIG_DIR, "users.json")
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CONFIG_DIR, exist_ok=True)


class AppConfig:
    """应用配置单例 - 内存缓存 + 按需持久化"""

    _DEFAULT = {
        "admin_username": "admin",
        "admin_password": "admin",
        "webui_base_port": 6000,
        "http_base_port": 3000,
        "ws_base_port": 3001,
        "docker_image": "mlikiowa/napcat-docker:latest",
        "api_key": "",
        "data_dir": os.path.join(BASE_DIR, "data"),
    }

    def __init__(self):
        self._data: Dict[str, Any] = {}
        self._load()

    def _load(self):
        if not os.path.exists(CONFIG_FILE):
            self._data = {**self._DEFAULT, "api_key": uuid.uuid4().hex}
            self._save()
            logger.info("已生成默认配置文件: %s", CONFIG_FILE)
            return

        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            self._data = json.load(f)

        # 合并缺失的默认值
        changed = False
        for k, v in self._DEFAULT.items():
            if k not in self._data:
                self._data[k] = v if v else (uuid.uuid4().hex if k == "api_key" else v)
                changed = True
        if changed:
            self._save()
            logger.info("配置文件已补充缺失字段")

    def _save(self):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=4, ensure_ascii=False)

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def set(self, key: str, value: Any):
        self._data[key] = value
        self._save()

    def update(self, updates: dict):
        self._data.update(updates)
        self._save()

    @property
    def data(self) -> dict:
        return self._data.copy()

    def reload(self):
        self._load()

def get_data_dir() -> str:
    """获取实例数据挂载目录，支持用户在设置中修改"""
    d = app_config.get("data_dir")
    if not d:
        d = DATA_DIR
    os.makedirs(d, exist_ok=True)
    return d


# 全局单例
app_config = AppConfig()

