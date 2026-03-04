"""
认证路由 - 登录/登出/状态检查
"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from middleware.auth import (
    get_current_user, create_token, remove_token,
)
from services.user_manager import user_manager
from services.operation_logger import operation_logger
from services.log import logger

router = APIRouter(prefix="/api", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def api_login(req: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not user_manager.check_ban_ip(ip):
        return JSONResponse(
            {"status": "error", "message": "IP banned due to too many failures"},
            status_code=403,
        )

    user = user_manager.check_login(req.username, req.password)
    if user:
        user_manager.clear_login_failure(ip)
        token = create_token(user)
        operation_logger.info("user_login", {
            "operator_ip": ip,
            "operator_name": user["userName"],
        })
        response = JSONResponse({
            "status": "ok",
            "message": "Authenticated",
            "user": {
                "uuid": user["uuid"],
                "userName": user["userName"],
                "permission": user["permission"],
            },
        })
        response.set_cookie(
            key="auth_token", value=token,
            max_age=86400 * 7, httponly=True, samesite="lax",
        )
        return response

    user_manager.record_login_failure(ip)
    operation_logger.warning("user_login_failed", {
        "operator_ip": ip,
        "target_user_name": req.username,
    })
    return JSONResponse(
        {"status": "error", "message": "Invalid credentials"},
        status_code=401,
    )


@router.post("/logout")
async def api_logout(request: Request):
    token = request.cookies.get("auth_token")
    if token:
        remove_token(token)
    operation_logger.info("user_logout", {
        "operator_ip": request.client.host if request.client else "unknown",
    })
    response = JSONResponse({"status": "ok", "message": "Logged out"})
    response.delete_cookie("auth_token")
    return response


@router.get("/auth/status")
async def api_auth_status(session: dict = Depends(get_current_user)):
    return {
        "status": "ok",
        "user": {
            "uuid": session["uuid"],
            "userName": session["userName"],
            "permission": session["permission"],
        },
    }

