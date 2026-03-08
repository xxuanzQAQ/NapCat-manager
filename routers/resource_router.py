"""
资源路由 - 壁纸/背景图自动发现
扫描 resource/images/{category}/ 下的图片，按宽高比分为横图/竖图返回。
"""
import os
from fastapi import APIRouter, Query
from services.log import logger

router = APIRouter(prefix="/api/resource", tags=["resource"])

_RESOURCE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resource")
_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def _classify_images(category: str) -> dict:
    """扫描目录，用 PIL 读取尺寸，分为 landscape / portrait。"""
    folder = os.path.join(_RESOURCE_DIR, "images", category)
    result: dict = {"landscape": [], "portrait": []}
    if not os.path.isdir(folder):
        return result

    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow 未安装，壁纸尺寸检测不可用")
        # 回退：全部归入 landscape
        for f in os.listdir(folder):
            if os.path.splitext(f)[1].lower() in _IMG_EXTS:
                result["landscape"].append(f"/resource/images/{category}/{f}")
        return result

    for f in os.listdir(folder):
        ext = os.path.splitext(f)[1].lower()
        if ext not in _IMG_EXTS:
            continue
        path = os.path.join(folder, f)
        try:
            with Image.open(path) as img:
                w, h = img.size
            url = f"/resource/images/{category}/{f}"
            if w >= h:
                result["landscape"].append(url)
            else:
                result["portrait"].append(url)
        except Exception:
            logger.debug("无法读取图片 %s", path)
    return result


@router.get("/wallpapers")
async def get_wallpapers(category: str = Query(default="user-dashboard")):
    """返回指定分类下按方向分组的壁纸列表。"""
    data = _classify_images(category)
    return {"status": "ok", **data}

