"""
用户管理子系统 - 参考 MCSManager UserSubsystem 实现
支持多用户、角色权限、实例绑定、SHA256+Salt 密码哈希
重构: print → logger, 使用 config 模块路径
"""
import os
import json
import uuid
import hashlib
import time
from typing import Optional, List, Dict, Any

from services.log import logger
from services.config import USERS_FILE


# 权限等级 (对标 MCSM ROLE)
class ROLE:
    ADMIN = 10   # 管理员 - 全部权限
    USER = 1     # 普通用户 - 仅操作分配的实例
    GUEST = 0    # 访客
    BAN = -1     # 封禁


class UserManager:
    def __init__(self, users_file: str):
        self.users_file = users_file
        self._users: Dict[str, dict] = {}
        self._login_failures: Dict[str, int] = {}  # IP -> 失败次数
        self._load()

    def _load(self):
        """从文件加载用户数据"""
        if os.path.exists(self.users_file):
            try:
                with open(self.users_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for user in data:
                            self._users[user["uuid"]] = user
                    elif isinstance(data, dict):
                        self._users = data
            except (json.JSONDecodeError, IOError, KeyError) as e:
                logger.error("加载用户数据失败: %s", e)
                self._users = {}

        if len(self._users) == 0:
            self._create_default_admin()

    def _save(self):
        """持久化用户数据到文件"""
        os.makedirs(os.path.dirname(self.users_file), exist_ok=True)
        with open(self.users_file, "w", encoding="utf-8") as f:
            json.dump(self._users, f, indent=4, ensure_ascii=False)

    def _create_default_admin(self):
        """创建默认管理员账号"""
        self.create_user(username="admin", password="admin", permission=ROLE.ADMIN)
        logger.info("已创建默认管理员 admin/admin")

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = uuid.uuid4().hex[:16]
        hashed = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"{salt}${hashed}"

    @staticmethod
    def _verify_password(password: str, stored_hash: str) -> bool:
        if "$" not in stored_hash:
            return password == stored_hash
        salt, hashed = stored_hash.split("$", 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed

    # ============ 用户 CRUD ============

    def create_user(self, username: str, password: str, permission: int = ROLE.USER) -> Optional[dict]:
        if self.get_user_by_username(username):
            return None
        user_uuid = uuid.uuid4().hex[:24]
        user = {
            "uuid": user_uuid,
            "userName": username,
            "passWord": self._hash_password(password),
            "permission": permission,
            "registerTime": time.strftime("%Y-%m-%d %H:%M:%S"),
            "loginTime": "",
            "apiKey": uuid.uuid4().hex,
            "instances": [],
        }
        self._users[user_uuid] = user
        self._save()
        return user

    def edit_user(self, user_uuid: str, **kwargs) -> bool:
        user = self._users.get(user_uuid)
        if not user:
            return False
        if "userName" in kwargs and kwargs["userName"]:
            existing = self.get_user_by_username(kwargs["userName"])
            if existing and existing["uuid"] != user_uuid:
                return False
            user["userName"] = kwargs["userName"]
        if "permission" in kwargs and kwargs["permission"] is not None:
            user["permission"] = kwargs["permission"]
        if "passWord" in kwargs and kwargs["passWord"]:
            user["passWord"] = self._hash_password(kwargs["passWord"])
        if "instances" in kwargs:
            user["instances"] = kwargs["instances"]
        if "apiKey" in kwargs:
            user["apiKey"] = kwargs["apiKey"]
        self._save()
        return True

    def delete_user(self, user_uuid: str) -> bool:
        if user_uuid in self._users:
            del self._users[user_uuid]
            self._save()
            return True
        return False

    # ============ 查询 ============

    def get_user_by_uuid(self, user_uuid: str) -> Optional[dict]:
        return self._users.get(user_uuid)

    def get_user_by_username(self, username: str) -> Optional[dict]:
        for user in self._users.values():
            if user["userName"] == username:
                return user
        return None

    def get_user_by_api_key(self, api_key: str) -> Optional[dict]:
        for user in self._users.values():
            if user.get("apiKey") == api_key:
                return user
        return None

    def list_users(self, page: int = 1, page_size: int = 20, search: str = "") -> dict:
        all_users = list(self._users.values())
        if search:
            search_lower = search.lower()
            all_users = [u for u in all_users if search_lower in u["userName"].lower()]
        total = len(all_users)
        start = (page - 1) * page_size
        page_data = all_users[start:start + page_size]
        safe_data = []
        for u in page_data:
            safe_data.append({
                "uuid": u["uuid"],
                "userName": u["userName"],
                "permission": u["permission"],
                "registerTime": u.get("registerTime", ""),
                "loginTime": u.get("loginTime", ""),
                "apiKey": u.get("apiKey", ""),
                "instances": u.get("instances", []),
                "instanceCount": len(u.get("instances", [])),
            })
        return {"total": total, "page": page, "pageSize": page_size, "data": safe_data}

    # ============ 认证 ============

    def check_login(self, username: str, password: str) -> Optional[dict]:
        user = self.get_user_by_username(username)
        if not user:
            return None
        if user["permission"] == ROLE.BAN:
            return None
        if self._verify_password(password, user["passWord"]):
            user["loginTime"] = time.strftime("%Y-%m-%d %H:%M:%S")
            self._save()
            return user
        return None

    def check_ban_ip(self, ip: str) -> bool:
        return self._login_failures.get(ip, 0) <= 10

    def record_login_failure(self, ip: str):
        self._login_failures[ip] = self._login_failures.get(ip, 0) + 1

    def clear_login_failure(self, ip: str):
        self._login_failures.pop(ip, None)

    # ============ 权限 & 实例绑定 ============

    def is_admin(self, user: dict) -> bool:
        return user.get("permission", 0) >= ROLE.ADMIN

    def has_instance(self, user: dict, node_id: str, container_name: str) -> bool:
        if self.is_admin(user):
            return True
        for inst in user.get("instances", []):
            if inst.get("node_id") == node_id and inst.get("container_name") == container_name:
                return True
        return False

    def assign_instances(self, user_uuid: str, instances: list) -> bool:
        user = self._users.get(user_uuid)
        if not user:
            return False
        user["instances"] = instances
        self._save()
        return True

    def remove_instances(self, user_uuid: str, instances: list) -> bool:
        user = self._users.get(user_uuid)
        if not user:
            return False
        remove_set = {(i["node_id"], i["container_name"]) for i in instances}
        user["instances"] = [
            i for i in user.get("instances", [])
            if (i["node_id"], i["container_name"]) not in remove_set
        ]
        self._save()
        return True

    def count(self) -> dict:
        total = len(self._users)
        admins = sum(1 for u in self._users.values() if u["permission"] >= ROLE.ADMIN)
        users = sum(1 for u in self._users.values() if u["permission"] == ROLE.USER)
        banned = sum(1 for u in self._users.values() if u["permission"] == ROLE.BAN)
        return {"total": total, "admins": admins, "users": users, "banned": banned}


# 全局单例
user_manager = UserManager(users_file=USERS_FILE)

