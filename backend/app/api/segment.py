"""
肺部分割 API 接口
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, List
import numpy as np
from PIL import Image
import io
import base64
import torch
import torch.nn.functional as F
from pathlib import Path
from loguru import logger
import time
import sys

# 添加 ai_models 目录到路径
AI_MODELS_DIR = Path(__file__).parent.parent.parent.parent / 'ai_models'
sys.path.insert(0, str(AI_MODELS_DIR))

try:
    from model_integration import LungSegmentationModel
    AI_MODEL_AVAILABLE = True
    logger.info("✅ 成功导入 ai_models 中的 LungSegmentationModel")
except ImportError as e:
    AI_MODEL_AVAILABLE = False
    logger.warning(f"⚠️ 无法导入 ai_models: {e}，将使用后备分割算法")

from app.models.unet import UNet2D
from app.config import settings

router = APIRouter()


class SegmentationRequest(BaseModel):
    """分割请求模型"""
    image_data: str  # base64 编码的图像
    enhance_contrast: bool = True
    reduce_noise: bool = True


class SegmentationResponse(BaseModel):
    """分割响应模型"""
    success: bool
    message: str
    data: Dict[str, Any]
    processing_time: float


# 全局模型实例
_segmentation_model = None


async def get_segmentation_model():
    """获取分割模型（单例）- 优先使用 ai_models 中的模型"""
    global _segmentation_model
    
    if _segmentation_model is None:
        logger.info("🔍 加载肺部分割模型...")
        
        # 优先尝试使用 ai_models 中的 LungSegmentationModel
        if AI_MODEL_AVAILABLE:
            try:
                logger.info(" 尝试加载 ai_models 中的 LungSegmentationModel...")
                _segmentation_model = LungSegmentationModel()
                if _segmentation_model.model is not None:
                    logger.info("✅ 成功加载 LungSegmentationModel（ai_models）")
                    return _segmentation_model
                else:
                    logger.warning("⚠️ LungSegmentationModel 未加载到权重，使用后备方案")
                    _segmentation_model = None
            except Exception as e:
                logger.warning(f"⚠️ LungSegmentationModel 加载失败：{e}，使用后备方案")
                _segmentation_model = None
        
        # 如果 ai_models 不可用，尝试使用 UNet2D
        if _segmentation_model is None:
            model_path = Path(settings.MODEL_DIR) / settings.SEGMENTATION_MODEL
            
            if not model_path.exists():
                logger.warning(f"⚠️ 模型文件不存在：{model_path}，使用后备分割算法")
                _segmentation_model = "fallback"
                return _segmentation_model
            
            # 加载模型
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            model = UNet2D(in_channels=1, out_channels=2)
            model.load_state_dict(torch.load(model_path, map_location=device))
            model.to(device)
            model.eval()
            _segmentation_model = model
            logger.info(f"✅ 模型加载成功：{settings.SEGMENTATION_MODEL}")
    
    return _segmentation_model


@router.post("/", response_model=SegmentationResponse)
@router.post("/analyze", response_model=SegmentationResponse)
async def segment_lung(
    image: UploadFile = File(..., description="上传的 CT 图像（PNG/JPG/DICOM）"),
    enhance_contrast: bool = Form(True),
    reduce_noise: bool = Form(True)
):
    """
    肺部图像分割
    
    - **image**: 上传的医学图像文件
    - **enhance_contrast**: 是否增强对比度
    - **reduce_noise**: 是否降噪
    
    返回：
    - 分割后的图像（base64）
    - 左右肺面积统计
    - 肺部占比
    """
    start_time = time.time()
    
    try:
        logger.info(f"📥 收到分割请求，文件大小：{len(await image.read()) / 1024:.2f} KB")
        await image.seek(0)
        
        # 读取并预处理图像
        image_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(image_bytes))
        
        # 转换为灰度图
        if pil_image.mode != 'L':
            pil_image = pil_image.convert('L')
        
        # 调整大小
        pil_image = pil_image.resize((512, 512), Image.Resampling.LANCZOS)
        
        # 图像预处理
        image_array = np.array(pil_image, dtype=np.float32) / 255.0
        
        # 使用综合预处理函数
        image_array = preprocess_image(image_array, enhance_contrast, reduce_noise)
        
        # 获取模型
        model = await get_segmentation_model()
        
        # 执行推理
        use_fallback = False
        if AI_MODEL_AVAILABLE and hasattr(model, 'analyze') and model.model is not None:
            # 尝试使用 ai_models 中的 LungSegmentationModel
            logger.info("🤖 尝试使用 ai_models 中的 LungSegmentationModel 进行推理")
            try:
                # 转换为 OpenCV 格式（numpy array）
                cv_image = np.array(pil_image)
                analysis_result = model.analyze(cv_image)
                
                # 检查模型是否成功分割
                if analysis_result['lung_area_pixels'] > 0:
                    # 成功分割
                    logger.info(f"✅ LungSegmentationModel 分割成功：{analysis_result['lung_area_pixels']} 像素")
                    # LungSegmentationModel 返回的 mask 已经是 0-255 的 uint8 数组
                    binary_mask = analysis_result['mask']
                    mask = (binary_mask / 255.0).astype(np.float32)
                    model_type = "lung_segmentation_model"
                else:
                    # 模型返回空结果，使用后备算法
                    logger.warning("⚠️ LungSegmentationModel 返回空结果，使用后备算法")
                    use_fallback = True
            except Exception as e:
                logger.warning(f"⚠️ LungSegmentationModel 推理失败：{e}，使用后备算法")
                use_fallback = True
        elif model == "fallback":
            # 模型已被设置为后备模式
            use_fallback = True
        elif model is not None:
            # 使用 UNet2D 模型推理
            logger.info("🤖 使用 UNet2D 模型推理")
            try:
                with torch.no_grad():
                    input_tensor = torch.from_numpy(image_array).unsqueeze(0).unsqueeze(0)
                    device = next(model.parameters()).device
                    input_tensor = input_tensor.to(device)
                    
                    output = model(input_tensor)
                    mask = F.softmax(output, dim=1)[0, 1].cpu().numpy()
                model_type = "unet"
                binary_mask = (mask > 0.5).astype(np.uint8) * 255
            except Exception as e:
                logger.warning(f"⚠️ UNet2D 推理失败：{e}，使用后备算法")
                use_fallback = True
        else:
            use_fallback = True
        
        # 使用后备分割模式
        if use_fallback:
            logger.info("🎭 使用后备图像分割算法（适配截图）")
            mask = generate_simulated_mask(image_array)
            model_type = "fallback"
            binary_mask = (mask > 0.5).astype(np.uint8) * 255
        
        # 生成可视化结果
        result_image = visualize_segmentation(pil_image, binary_mask)
        
        # 计算统计信息
        # 对于截图类图像，估算像素间距：假设胸部宽度约 350mm，图像宽度 512 像素
        # 像素间距 ≈ 350/512 ≈ 0.68mm，取 0.7mm
        pixel_spacing = 0.7 if model_type == "fallback" else 1.0
        stats = calculate_lung_stats(binary_mask, pixel_spacing)
        
        # 验证分割结果
        validation = validate_segmentation(binary_mask)
        
        # 如果验证失败且使用的是后备算法，尝试使用不同的阈值重新分割
        if not validation["passed"] and model_type == "fallback":
            logger.warning(f"⚠️ 分割结果验证失败：{validation['reason']}，尝试使用不同参数重新分割")
            
            # 尝试使用不同的阈值和形态学操作参数
            import cv2
            
            # 处理多通道输入：转换为灰度
            if len(image_array.shape) == 3:
                if image_array.shape[2] == 3:
                    img_gray = np.mean(image_array, axis=2)
                elif image_array.shape[2] == 4:
                    img_gray = np.mean(image_array[:, :, :3], axis=2)
            else:
                img_gray = image_array
            
            # 确保输入是 uint8 格式
            if img_gray.dtype == np.float32 or img_gray.dtype == np.float64:
                img_uint8 = (img_gray * 255).astype(np.uint8)
            else:
                img_uint8 = img_gray
            
            # 使用不同的阈值方法
            blur = cv2.GaussianBlur(img_uint8, (3, 3), 0)
            _, mask_alt = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            # 使用不同的形态学操作参数
            kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
            kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
            mask_alt = cv2.morphologyEx(mask_alt, cv2.MORPH_OPEN, kernel_open, iterations=1)
            mask_alt = cv2.morphologyEx(mask_alt, cv2.MORPH_CLOSE, kernel_close, iterations=1)
            
            # 验证新的分割结果
            validation_alt = validate_segmentation(mask_alt)
            
            if validation_alt["passed"] or validation_alt["confidence"] > validation["confidence"]:
                logger.info("✅ 使用备选参数重新分割成功")
                binary_mask = mask_alt
                result_image = visualize_segmentation(pil_image, binary_mask)
                stats = calculate_lung_stats(binary_mask, pixel_spacing)
        
        # 转换为 base64
        result_base64 = image_to_base64(result_image)
        mask_base64 = image_to_base64(Image.fromarray(binary_mask))
        
        processing_time = time.time() - start_time
        
        logger.info(f"✅ 分割完成，耗时：{processing_time:.2f}s，验证结果：{validation['reason']}")
        
        return SegmentationResponse(
            success=True,
            message="分割成功",
            data={
                "original_image": image_to_base64(pil_image),
                "segmented_image": result_base64,
                "mask": mask_base64,
                "stats": stats,
                "model_type": model_type,
                "validation": validation
            },
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"❌ 分割失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"分割失败：{str(e)}")


def enhance_contrast_fn(image: np.ndarray) -> np.ndarray:
    """对比度增强（CLAHE）"""
    import cv2
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    image_uint8 = (image * 255).astype(np.uint8)
    enhanced = clahe.apply(image_uint8)
    return enhanced.astype(np.float32) / 255.0


def reduce_noise_fn(image: np.ndarray) -> np.ndarray:
    """噪声抑制（高斯模糊）"""
    import cv2
    image_uint8 = (image * 255).astype(np.uint8)
    denoised = cv2.GaussianBlur(image_uint8, (5, 5), 0)
    return denoised.astype(np.float32) / 255.0


def preprocess_image(image: np.ndarray, enhance_contrast: bool = True, reduce_noise: bool = True) -> np.ndarray:
    """
    综合预处理函数
    
    Args:
        image: 输入图像（0-1 的 float32 数组）
        enhance_contrast: 是否增强对比度
        reduce_noise: 是否降噪
    
    Returns:
        预处理后的图像
    """
    result = image.copy()
    
    # 对比度增强
    if enhance_contrast:
        result = enhance_contrast_fn(result)
    
    # 噪声抑制
    if reduce_noise:
        result = reduce_noise_fn(result)
    
    # 归一化到 0-1 范围
    result = np.clip(result, 0, 1)
    
    return result


def generate_simulated_mask(image: np.ndarray) -> np.ndarray:
    """后备分割算法 - 使用传统图像处理（来自 ai_service.py）
    
    适配截图类型的图像（整体较亮）
    改进：
    - 处理多通道输入（避免 OpenCV 通道错误）
    - 处理单个连通区域的情况（用中线分割）
    - 添加面积约束排除噪声
    - 优化阈值选择和形态学操作
    - 增强连通区域分析
    """
    import cv2
    
    # 处理多通道输入：转换为灰度
    if len(image.shape) == 3:
        if image.shape[2] == 3:
            image = np.mean(image, axis=2)
        elif image.shape[2] == 4:
            image = np.mean(image[:, :, :3], axis=2)
    
    # 确保输入是 uint8 格式
    if image.dtype == np.float32 or image.dtype == np.float64:
        image_uint8 = (image * 255).astype(np.uint8)
    else:
        image_uint8 = image
    
    # 分析图像直方图，动态确定阈值
    mean_val = np.mean(image_uint8)
    std_val = np.std(image_uint8)
    
    # 对于截图（整体较亮），使用自适应阈值
    # 肺部区域通常比背景暗
    if mean_val > 150:  # 亮图像（截图）
        # 使用 Otsu 自适应阈值
        blur = cv2.GaussianBlur(image_uint8, (5, 5), 0)
        _, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    else:  # 暗图像（原始 CT）
        # 使用自适应阈值而非固定阈值
        blur = cv2.GaussianBlur(image_uint8, (5, 5), 0)
        _, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 形态学操作：开运算去小噪声，闭运算填充肺内空洞
    # 优化核大小和迭代次数
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    
    # 先开运算去除小噪声
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open, iterations=1)
    # 再闭运算填充肺内空洞
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close, iterations=2)
    
    # 找到连通区域
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if len(contours) > 0:
        # 面积约束：过滤掉过小的噪声区域
        # 计算图像总面积的1%作为最小面积阈值
        total_area = mask.shape[0] * mask.shape[1]
        min_area_threshold = total_area * 0.01
        
        # 过滤出有效的轮廓
        valid_contours = [c for c in contours if cv2.contourArea(c) > min_area_threshold]
        
        if len(valid_contours) >= 2:
            # 取最大的两个区域作为左右肺
            valid_contours = sorted(valid_contours, key=cv2.contourArea, reverse=True)[:2]
            lung_mask = np.zeros_like(mask)
            cv2.drawContours(lung_mask, valid_contours, -1, 255, -1)
            mask = lung_mask
        elif len(valid_contours) == 1:
            # 只有一个连通区域（可能两肺连通），用中线分割
            c = valid_contours[0]
            x, y, w, h = cv2.boundingRect(c)
            mid_x = x + w // 2
            
            left_mask = np.zeros_like(mask)
            right_mask = np.zeros_like(mask)
            cv2.drawContours(left_mask, [c], -1, 255, -1)
            right_mask = left_mask.copy()
            
            left_mask[:, mid_x:] = 0
            right_mask[:, :mid_x] = 0
            
            mask = np.maximum(left_mask, right_mask)
        else:
            # 没有有效轮廓，使用全局阈值重试
            _, mask = cv2.threshold(image_uint8, 100, 255, cv2.THRESH_BINARY_INV)
    else:
        # 没有找到轮廓，使用全局阈值重试
        _, mask = cv2.threshold(image_uint8, 100, 255, cv2.THRESH_BINARY_INV)
    
    # 转换为 float32 并归一化
    return (mask / 255.0).astype(np.float32)


def visualize_segmentation(original: Image.Image, mask: np.ndarray) -> Image.Image:
    """可视化分割结果"""
    import cv2
    
    # 转换为 OpenCV 格式
    img_cv = cv2.cvtColor(np.array(original), cv2.COLOR_GRAY2BGR)
    
    # 创建彩色掩码
    mask_color = np.zeros_like(img_cv)
    mask_color[mask > 0] = [0, 255, 0]  # 绿色
    
    # 叠加
    result = cv2.addWeighted(img_cv, 0.7, mask_color, 0.3, 0)
    
    return Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))


def validate_segmentation(mask: np.ndarray) -> Dict[str, Any]:
    """
    验证分割结果的质量
    
    Args:
        mask: 分割掩码（0-255 的 uint8 数组）
    
    Returns:
        包含验证结果的字典，包括是否通过验证、置信度和原因
    """
    height, width = mask.shape
    total_pixels = height * width
    lung_pixels = int(np.sum((mask > 0).astype(np.uint8)))
    
    # 计算肺部占比
    lung_percentage = float(lung_pixels / total_pixels * 100) if total_pixels > 0 else 0
    
    # 左右肺分割（以中线为界）
    left_lung = int(np.sum((mask[:, :width//2] > 0).astype(np.uint8)))
    right_lung = int(np.sum((mask[:, width//2:] > 0).astype(np.uint8)))
    
    # 计算左右肺面积比例
    left_ratio = left_lung / lung_pixels if lung_pixels > 0 else 0
    right_ratio = right_lung / lung_pixels if lung_pixels > 0 else 0
    
    # 验证标准
    validation_passed = True
    confidence = 0.95
    reason = "分割结果有效"
    
    # 检查肺部占比是否合理（通常在 10%-60% 之间）
    if lung_percentage < 5:
        validation_passed = False
        confidence = 0.1
        reason = "肺部区域过小"
    elif lung_percentage > 70:
        validation_passed = False
        confidence = 0.3
        reason = "肺部区域过大"
    
    # 检查左右肺比例是否合理（通常在 0.3-3.0 之间）
    if left_ratio > 0 and right_ratio > 0:
        ratio = max(left_ratio, right_ratio) / min(left_ratio, right_ratio)
        if ratio > 3.0:
            validation_passed = False
            confidence = 0.5
            reason = "左右肺比例失衡"
    
    # 检查是否有肺部区域
    if lung_pixels == 0:
        validation_passed = False
        confidence = 0.05
        reason = "未检测到肺部区域"
    
    return {
        "passed": validation_passed,
        "confidence": confidence,
        "reason": reason,
        "lung_percentage": lung_percentage,
        "left_ratio": left_ratio,
        "right_ratio": right_ratio
    }


def calculate_lung_stats(mask: np.ndarray, pixel_spacing_mm: float = 0.7) -> Dict[str, Any]:
    """
    计算肺部统计信息
    
    Args:
        mask: 分割掩码（0-255 的 uint8 数组）
        pixel_spacing_mm: 像素间距（毫米），默认 0.7mm（典型 CT 分辨率）
    """
    height, width = mask.shape
    total_pixels = height * width
    lung_pixels = int(np.sum((mask > 0).astype(np.uint8)))
    
    # 左右肺分割（以中线为界）
    # 注意：在医学图像中，图像的左侧对应患者的右肺
    left_lung = int(np.sum((mask[:, :width//2] > 0).astype(np.uint8)))
    right_lung = int(np.sum((mask[:, width//2:] > 0).astype(np.uint8)))
    
    # 面积转换（像素 -> mm²）
    area_conversion = pixel_spacing_mm * pixel_spacing_mm
    
    # 计算实际面积（mm²）
    lung_area_mm2 = lung_pixels * area_conversion
    left_lung_area_mm2 = left_lung * area_conversion
    right_lung_area_mm2 = right_lung * area_conversion
    
    # 计算肺部占比
    lung_percentage = round(float(lung_pixels / total_pixels * 100), 2)
    
    # 疑似结节检测（简化版）
    from scipy import ndimage
    labeled_array, num_features = ndimage.label((mask > 0).astype(np.uint8))
    
    # 验证分割结果
    validation = validate_segmentation(mask)
    
    return {
        "lung_area": round(lung_area_mm2, 2),
        "lung_percentage": lung_percentage,
        "left_lung_area": round(left_lung_area_mm2, 2),
        "right_lung_area": round(right_lung_area_mm2, 2),
        "suspicious_nodules": max(0, num_features - 1),  # 减去肺部主体
        "confidence": validation["confidence"],
        "validation": validation
    }


def image_to_base64(image: Image.Image) -> str:
    """图像转 base64"""
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')
