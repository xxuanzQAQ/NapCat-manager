"""
认证中间件 - 对标 MCSM permission / passport 机制
Token 管理 + 认证依赖 + 权限检查
"""
import uuid
import time
from fastapi import Request, HTTPException, Depends
from typing import Dict, Optional

from services.config import app_config
from services.user_manager import user_manager, ROLE
from services.log import logger


# Token 存储 - 内存 + TTL 清理
_active_tokens: Dict[str, dict] = {}
_TOKEN_TTL = 86400 * 7  # 7天过期


def create_token(user: dict) -> str:
    """为用户创建会话 Token"""
    token = uuid.uuid4().hex
    _active_tokens[token] = {
        "uuid": user["uuid"],
        "userName": user["userName"],
        "permission": user["permission"],
        "loginTime": time.strftime("%Y-%m-%d %H:%M:%S"),
        "created_at": time.time(),
    }
    return token


def remove_token(token: str):
    """移除 Token (登出)"""
    _active_tokens.pop(token, None)


def cleanup_expired_tokens():
    """清理过期 Token"""
    now = time.time()
    expired = [t for t, s in _active_tokens.items()
               if now - s.get("created_at", 0) > _TOKEN_TTL]
    for t in expired:
        del _active_tokens[t]
    if expired:
        logger.debug("清理了 %d 个过期 Token", len(expired))


def get_current_user(request: Request) -> dict:
    """
    核心认证依赖 - 支持多种认证方式:
    1. Cookie Token
    2. 旧版兼容 (admin_authenticated)
    3. API Key (Header / Query)
    """
    # 1. Cookie Token 认证
    token = request.cookies.get("auth_token")
    if token and token in _active_tokens:
        session = _active_tokens[token]
        # 检查过期
        if time.time() - session.get("created_at", 0) > _TOKEN_TTL:
            del _active_tokens[token]
        else:
            if session.get("permission", 0) == ROLE.BAN:
                raise HTTPException(status_code=403, detail="Account banned")
            return session

    # 2. 旧版兼容
    if token == "admin_authenticated":
        return {"uuid": "legacy", "userName": "admin", "permission": ROLE.ADMIN}

    # 3. API Key 认证
    api_key = request.headers.get("x-request-api-key")
    if not api_key:
        api_key = request.query_params.get("apikey")

    if api_key:
        # 集群通信密钥
        if api_key == app_config.get("api_key"):
            return {"uuid": "cluster", "userName": "api_user", "permission": ROLE.ADMIN}
        # 用户 API Key
        user = user_manager.get_user_by_api_key(api_key)
        if user:
            return {
                "uuid": user["uuid"],
                "userName": user["userName"],
                "permission": user["permission"],
            }

    raise HTTPException(status_code=401, detail="Unauthorized")


def require_admin(session: dict = Depends(get_current_user)) -> dict:
    """要求管理员权限"""
    if session.get("permission", 0) < ROLE.ADMIN:
        raise HTTPException(status_code=403, detail="Admin permission required")
    return session


def require_user(session: dict = Depends(get_current_user)) -> dict:
    """要求至少普通用户权限"""
    if session.get("permission", 0) < ROLE.USER:
        raise HTTPException(status_code=403, detail="User permission required")
    return session


def check_instance_permission(session: dict, node_id: str, container_name: str) -> bool:
    """检查用户是否有指定实例的操作权限"""
    if session.get("permission", 0) >= ROLE.ADMIN:
        return True
    user = user_manager.get_user_by_uuid(session["uuid"])
    if not user:
        return False
    return user_manager.has_instance(user, node_id, container_name)

