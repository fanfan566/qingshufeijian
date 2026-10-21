"""
配置管理
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """应用配置"""
    
    # 服务配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # 模型配置
    MODEL_DIR: str = "data/models"
    SEGMENTATION_MODEL: str = "lung_unet_best.pth"
    NODULE_MODEL: str = "nodule_detector.pth"
    LESION_MODEL: str = "lesion_classifier.pth"

    # SegMoTE 分割模型配置（D:\SegMoTE-main）
    SEGMOTE_ROOT: str = r"D:\SegMoTE-main"
    SEGMOTE_DEVICE: str = "auto"            # auto / cuda / cpu
    SEGMOTE_IMAGE_SIZE: int = 512
    SEGMOTE_PROMPT_MODE: str = "text"       # text（文本提示 "lung"）/ none（无提示）
    SEGMOTE_TEXT_TOKENIZER: str = "openai/clip-vit-base-patch32"
    SEGMOTE_HF_ENDPOINT: str = "https://hf-mirror.com"  # 下载 CLIP tokenizer 用，留空则使用官方源
    SEGMOTE_PRELOAD: bool = True            # 启动时预加载模型
    
    # 图像处理配置
    IMAGE_SIZE: int = 512
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    
    # API 配置
    API_PREFIX: str = "/api"
    CORS_ORIGINS: str = "*"
    
    # 日志配置
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# 创建配置实例
settings = Settings()


def get_settings():
    """获取配置（用于依赖注入）"""
    return settings
