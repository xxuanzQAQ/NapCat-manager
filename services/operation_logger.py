"""
操作审计日志系统 - 对标 MCSM OperationLogger
JSONL 文件存储 + 内存缓冲区批量写入
"""
import json
import os
import uuid
import time
from typing import List, Dict, Any, Optional
from collections import deque

from services.log import logger
from services.config import CONFIG_DIR

LOG_DIR = os.path.join(CONFIG_DIR, "logs")
OPERATION_LOG_FILE = os.path.join(LOG_DIR, "operation_log.jsonl")
os.makedirs(LOG_DIR, exist_ok=True)


class OperationLogger:
    """操作日志记录器 - 缓冲写入 + 尾部读取"""

    def __init__(self, buffer_size: int = 20, max_tail: int = 500):
        self._buffer: deque = deque(maxlen=buffer_size)
        self._max_tail = max_tail

    def log(self, operation_type: str, payload: Dict[str, Any],
            level: str = "info") -> str:
        """记录一条操作日志"""
        operation_id = uuid.uuid4().hex[:16]
        entry = {
            "id": operation_id,
            "type": operation_type,
            "level": level,
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": int(time.time()),
            **payload,
        }
        self._buffer.append(entry)
        # 缓冲区满时刷盘
        if len(self._buffer) >= self._buffer.maxlen:
            self.flush()
        return operation_id

    def info(self, operation_type: str, payload: Dict[str, Any]) -> str:
        return self.log(operation_type, payload, "info")

    def warning(self, operation_type: str, payload: Dict[str, Any]) -> str:
        return self.log(operation_type, payload, "warning")

    def error(self, operation_type: str, payload: Dict[str, Any]) -> str:
        return self.log(operation_type, payload, "error")

    def flush(self):
        """将缓冲区写入磁盘"""
        if not self._buffer:
            return
        try:
            with open(OPERATION_LOG_FILE, "a", encoding="utf-8") as f:
                while self._buffer:
                    entry = self._buffer.popleft()
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except IOError as e:
            logger.error("操作日志写入失败: %s", e)

    def get(self, limit: int = 50) -> List[Dict]:
        """获取最近 N 条操作日志 (缓冲区 + 文件尾部)"""
        # 先获取缓冲区中的
        buffer_items = list(self._buffer)

        if len(buffer_items) >= limit:
            return list(reversed(buffer_items[-limit:]))

        # 不够则从文件尾部补充
        remaining = limit - len(buffer_items)
        file_items = self._tail(remaining)

        # 合并：文件在前，缓冲区在后，逆序排列（最新在前）
        combined = file_items + buffer_items
        return list(reversed(combined[-limit:]))

    def _tail(self, n: int) -> List[Dict]:
        """从 JSONL 文件读取最后 N 行"""
        if not os.path.exists(OPERATION_LOG_FILE):
            return []
        try:
            with open(OPERATION_LOG_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
            tail_lines = lines[-n:] if len(lines) >= n else lines
            result = []
            for line in tail_lines:
                line = line.strip()
                if line:
                    try:
                        result.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
            return result
        except IOError:
            return []


# 全局单例
operation_logger = OperationLogger()

