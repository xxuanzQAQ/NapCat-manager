"""
操作日志路由 - 提供操作审计日志查询接口
"""
from fastapi import APIRouter, Depends
from typing import List, Dict

from middleware.auth import require_admin
from services.operation_logger import operation_logger

router = APIRouter(prefix="/api", tags=["operation_logs"])


@router.get("/operation_logs")
def get_operation_logs(
    limit: int = 50,
    session: dict = Depends(require_admin)
) -> List[Dict]:
    """
    获取操作日志
    
    Args:
        limit: 返回的日志条数 (1-200)
        session: 管理员会话
        
    Returns:
        操作日志列表，按时间倒序
    """
    if limit < 1 or limit > 200:
        limit = 50
    
    logs = operation_logger.get(limit)
    return logs

