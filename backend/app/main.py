"""
FastAPI 医学图像分析服务
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import numpy as np
from PIL import Image
import io
import base64
import tempfile
from pathlib import Path
import logging
from loguru import logger
import sys

from app.api import segment, nodule, lesion, report
from app.api import segment_lungmask, segment_lungmask_full  # lungmask 方案
from app.api import segment_segmote  # SegMoTE 方案
from app.services.segmote_engine import get_segmote_engine
from app.config import settings

# 配置日志
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO"
)
logger.add("logs/app_{time}.log", rotation="1 day", retention="7 days")

# 创建 FastAPI 应用
app = FastAPI(
    title="医学图像分析 API",
    description="肺部 CT 图像分割、结节检测和病变识别服务",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建必要的目录
Path("data/models").mkdir(parents=True, exist_ok=True)
Path("data/uploads").mkdir(parents=True, exist_ok=True)
Path("logs").mkdir(parents=True, exist_ok=True)

# 注册路由
app.include_router(segment.router, prefix="/api/segment", tags=["肺部分割 (旧)"])
app.include_router(segment_lungmask.router, prefix="/api/lungmask", tags=["肺部分割 (lungmask)"])
app.include_router(segment_lungmask_full.router, prefix="/api/lungmask/full", tags=["肺部分割 (lungmask 专业版)"])
app.include_router(segment_segmote.router, prefix="/api/segmote", tags=["肺部分割 (SegMoTE)"])
app.include_router(nodule.router, prefix="/api/nodule", tags=["结节检测"])
app.include_router(lesion.router, prefix="/api/lesion", tags=["病变识别"])
app.include_router(report.router, prefix="/api/report", tags=["报告生成"])


@app.get("/")
async def root():
    """API 根路径"""
    return {
        "message": "医学图像分析 API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "medical-image-analysis",
        "version": "1.0.0",
        "segmote": get_segmote_engine().info(),
    }


# 启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("🚀 医学图像分析服务启动中...")
    logger.info(f"📊 模型目录：{Path('data/models').absolute()}")
    logger.info(f"📁 上传目录：{Path('data/uploads').absolute()}")
    
    if settings.SEGMOTE_PRELOAD:
        # 后台线程预加载 SegMoTE，避免阻塞服务启动；期间到达的请求会等待加载完成
        import threading
        threading.Thread(target=get_segmote_engine().load, name="segmote-preload", daemon=True).start()
        logger.info("🧠 SegMoTE 模型后台加载中...")
    
    logger.info("✅ 服务启动完成")


# 关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("👋 服务正在关闭...")
    # TODO: 清理资源
    logger.info("✅ 服务已关闭")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
