"""
病变识别 API 接口
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List
import numpy as np
from PIL import Image
import io
import base64
import time
from loguru import logger
import cv2

router = APIRouter()


class LesionClassificationResponse(BaseModel):
    """病变分类响应"""
    success: bool
    message: str
    data: Dict[str, Any]
    processing_time: float


@router.post("/classify", response_model=LesionClassificationResponse)
async def classify_lesion(
    image: UploadFile = File(..., description="肺部 CT 图像"),
    region_of_interest: str = File(None, description="感兴趣区域坐标")
):
    """
    肺部病变识别与分类

    识别肺炎、COPD、肺气肿、肺纤维化等病变
    """
    start_time = time.time()

    try:
        logger.info("🔍 开始病变识别...")

        image_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(pil_image.convert('L'))

        image_array = cv2.resize(image_array, (512, 512))
        image_array = normalize_image(image_array)

        lesions = classify_lesions_rule_based(image_array)

        result_image = visualize_lesions(pil_image, lesions)

        processing_time = time.time() - start_time

        logger.info(f"✅ 识别完成，耗时：{processing_time:.2f}s")

        return LesionClassificationResponse(
            success=True,
            message="病变识别完成",
            data={
                "original_image": image_to_base64(pil_image),
                "marked_image": image_to_base64(result_image),
                "lesions": lesions,
                "primary_diagnosis": lesions[0]['name'] if lesions else "未见明显异常",
                "severity": calculate_severity(lesions),
                "recommendation": generate_treatment_recommendation(lesions)
            },
            processing_time=processing_time
        )

    except Exception as e:
        logger.error(f"❌ 病变识别失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"识别失败：{str(e)}")


def normalize_image(image: np.ndarray) -> np.ndarray:
    """图像归一化并增强对比度"""
    image = image.astype(np.uint8)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(image)


def build_body_mask(image: np.ndarray) -> np.ndarray:
    """估计身体区域，减少背景干扰"""
    blur = cv2.GaussianBlur(image, (5, 5), 0)
    _, mask = cv2.threshold(blur, 8, 255, cv2.THRESH_BINARY)
    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels <= 1:
        return mask

    areas = stats[1:, cv2.CC_STAT_AREA]
    largest_idx = 1 + int(np.argmax(areas))
    result = np.zeros_like(mask)
    result[labels == largest_idx] = 255
    return result


def estimate_lung_mask(image: np.ndarray) -> np.ndarray:
    """基于暗区和左右分布保守估计肺野区域"""
    body_mask = build_body_mask(image)
    body_pixels = image[body_mask > 0]

    if len(body_pixels) < 1000:
        return body_mask

    h, w = image.shape
    p35 = np.percentile(body_pixels, 35)
    p55 = np.percentile(body_pixels, 55)

    dark_mask = np.zeros_like(image, dtype=np.uint8)
    dark_mask[(body_mask > 0) & (image <= p55)] = 255

    center_strip = np.zeros_like(image, dtype=np.uint8)
    center_strip[int(h * 0.08):int(h * 0.95), int(w * 0.42):int(w * 0.58)] = 255
    dark_mask[center_strip > 0] = 0

    kernel = np.ones((5, 5), np.uint8)
    dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    left_roi = np.zeros_like(image, dtype=np.uint8)
    right_roi = np.zeros_like(image, dtype=np.uint8)
    left_roi[int(h * 0.08):int(h * 0.95), int(w * 0.05):int(w * 0.50)] = 255
    right_roi[int(h * 0.08):int(h * 0.95), int(w * 0.50):int(w * 0.95)] = 255

    left = cv2.bitwise_and(dark_mask, left_roi)
    right = cv2.bitwise_and(dark_mask, right_roi)

    def keep_largest(mask_part):
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_part, connectivity=8)
        if num_labels <= 1:
            return np.zeros_like(mask_part)
        result = np.zeros_like(mask_part)
        areas = stats[1:, cv2.CC_STAT_AREA]
        order = np.argsort(-areas)
        for idx in order:
            label = 1 + int(idx)
            area = stats[label, cv2.CC_STAT_AREA]
            hh = stats[label, cv2.CC_STAT_HEIGHT]
            ww = stats[label, cv2.CC_STAT_WIDTH]
            if area < 0.01 * h * w:
                continue
            if hh < 0.18 * h or ww < 0.08 * w:
                continue
            result[labels == label] = 255
            break
        return result

    left_mask = keep_largest(left)
    right_mask = keep_largest(right)
    lung_mask = cv2.bitwise_or(left_mask, right_mask)

    if np.count_nonzero(lung_mask) < 0.06 * h * w:
        fallback = np.zeros_like(image, dtype=np.uint8)
        fallback[(body_mask > 0) & (image <= p35)] = 255
        fallback = cv2.morphologyEx(fallback, cv2.MORPH_OPEN, kernel, iterations=1)
        fallback = cv2.morphologyEx(fallback, cv2.MORPH_CLOSE, kernel, iterations=2)
        return fallback

    return lung_mask


def safe_div(a: float, b: float) -> float:
    return float(a) / float(b) if float(b) > 1e-6 else 0.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


def extract_features(image: np.ndarray, mask: np.ndarray) -> Dict[str, float]:
    """提取灰度、纹理、亮斑、网格样及低密度特征"""
    pixels = image[mask > 0]
    area = len(pixels)
    if area < 1200:
        return {
            "mean": 0.0,
            "std": 0.0,
            "bright_ratio": 0.0,
            "dark_ratio": 0.0,
            "ggo_ratio": 0.0,
            "reticular_ratio": 0.0,
            "low_density_ratio": 0.0,
            "grad_mean": 0.0,
            "grad_high_ratio": 0.0,
            "lap_var": 0.0,
        }

    blur = cv2.GaussianBlur(image, (5, 5), 0)
    grad_x = cv2.Sobel(blur, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(blur, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = cv2.magnitude(grad_x, grad_y)

    lap = cv2.Laplacian(blur, cv2.CV_32F, ksize=3)
    abs_lap = np.abs(lap)

    local_mean = cv2.GaussianBlur(image.astype(np.float32), (0, 0), 7)
    diff = image.astype(np.float32) - local_mean

    p18 = np.percentile(pixels, 18)
    p60 = np.percentile(pixels, 60)
    p72 = np.percentile(pixels, 72)
    p82 = np.percentile(pixels, 82)

    grad_mask_values = grad_mag[mask > 0]
    lap_mask_values = abs_lap[mask > 0]
    grad_high_thr = np.percentile(grad_mask_values, 78)
    reticular_grad_thr = np.percentile(grad_mask_values, 68)
    reticular_lap_thr = np.percentile(lap_mask_values, 68)
    low_grad_thr = np.percentile(grad_mask_values, 35)

    bright_ratio = safe_div(np.count_nonzero((mask > 0) & (image >= p82)), area)
    dark_ratio = safe_div(np.count_nonzero((mask > 0) & (image <= p18)), area)

    ggo_mask = (mask > 0) & (image >= p60) & (image <= p82) & (np.abs(diff) < 18)
    reticular_mask = (mask > 0) & (image >= p72) & (grad_mag >= reticular_grad_thr) & (abs_lap >= reticular_lap_thr)
    low_density_mask = (mask > 0) & (image <= p18) & (grad_mag <= low_grad_thr)

    return {
        "mean": float(np.mean(pixels)),
        "std": float(np.std(pixels)),
        "bright_ratio": bright_ratio,
        "dark_ratio": dark_ratio,
        "ggo_ratio": safe_div(np.count_nonzero(ggo_mask), area),
        "reticular_ratio": safe_div(np.count_nonzero(reticular_mask), area),
        "low_density_ratio": safe_div(np.count_nonzero(low_density_mask), area),
        "grad_mean": float(np.mean(grad_mask_values)),
        "grad_high_ratio": safe_div(np.count_nonzero((mask > 0) & (grad_mag >= grad_high_thr)), area),
        "lap_var": float(np.var(lap[mask > 0])),
    }


def severity_from_ratio(ratio: float, confidence: float) -> str:
    """根据受累比例和置信度给出严重度"""
    score = ratio * (0.7 + 0.3 * confidence)
    if score >= 0.18:
        return "重度"
    if score >= 0.10:
        return "中度"
    return "轻度"


def determine_location(mask: np.ndarray, feature_mask: np.ndarray) -> str:
    """根据病灶分布给出保守位置描述"""
    region = (mask > 0) & feature_mask
    if np.count_nonzero(region) < 200:
        return "双肺散在"

    ys, xs = np.where(region)
    h, w = mask.shape
    x_mean = float(np.mean(xs))
    y_mean = float(np.mean(ys))

    if np.count_nonzero(xs < w * 0.48) > np.count_nonzero(xs >= w * 0.52) * 1.2:
        side = "左肺"
    elif np.count_nonzero(xs >= w * 0.52) > np.count_nonzero(xs < w * 0.48) * 1.2:
        side = "右肺"
    else:
        side = "双肺"

    if y_mean < h * 0.38:
        zone = "上叶"
    elif y_mean < h * 0.68:
        zone = "中叶"
    else:
        zone = "下叶"

    if side == "双肺":
        return f"{side}{zone}为主"
    return f"{side}{zone}"


def classify_lesions_rule_based(image: np.ndarray) -> List[Dict[str, Any]]:
    """
    基于规则的病变识别
    使用灰度分布、局部纹理、亮斑/磨玻璃样区域、网格样高频纹理、低密度区比例做保守识别
    """
    lung_mask = estimate_lung_mask(image)
    analysis_mask = lung_mask if np.count_nonzero(lung_mask) > 0.04 * image.size else build_body_mask(image)
    features = extract_features(image, analysis_mask)

    logger.info(
        f"病变特征: bright={features['bright_ratio']:.3f}, dark={features['dark_ratio']:.3f}, "
        f"ggo={features['ggo_ratio']:.3f}, reticular={features['reticular_ratio']:.3f}, "
        f"low_density={features['low_density_ratio']:.3f}, std={features['std']:.2f}"
    )

    lesions = []
    pixels = image[analysis_mask > 0]
    if len(pixels) < 1200:
        return lesions

    p18 = np.percentile(pixels, 18)
    p60 = np.percentile(pixels, 60)
    p72 = np.percentile(pixels, 72)
    p82 = np.percentile(pixels, 82)

    blur = cv2.GaussianBlur(image, (5, 5), 0)
    grad_x = cv2.Sobel(blur, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(blur, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = cv2.magnitude(grad_x, grad_y)
    lap = cv2.Laplacian(blur, cv2.CV_32F, ksize=3)
    abs_lap = np.abs(lap)
    local_mean = cv2.GaussianBlur(image.astype(np.float32), (0, 0), 7)
    diff = image.astype(np.float32) - local_mean

    reticular_grad_thr = np.percentile(grad_mag[analysis_mask > 0], 68)
    reticular_lap_thr = np.percentile(abs_lap[analysis_mask > 0], 68)
    low_grad_thr = np.percentile(grad_mag[analysis_mask > 0], 35)

    ggo_mask = (analysis_mask > 0) & (image >= p60) & (image <= p82) & (np.abs(diff) < 18)
    reticular_mask = (analysis_mask > 0) & (image >= p72) & (grad_mag >= reticular_grad_thr) & (abs_lap >= reticular_lap_thr)
    low_density_mask = (analysis_mask > 0) & (image <= p18) & (grad_mag <= low_grad_thr)

    pneumonia_score = (
        max(0.0, features["ggo_ratio"] - 0.16) * 2.2 +
        max(0.0, features["bright_ratio"] - 0.18) * 1.8 +
        max(0.0, features["std"] - 34.0) / 55.0
    )

    fibrosis_score = (
        max(0.0, features["reticular_ratio"] - 0.13) * 2.8 +
        max(0.0, features["grad_high_ratio"] - 0.22) * 1.6 +
        max(0.0, features["lap_var"] - 260.0) / 420.0
    )

    emphysema_score = (
        max(0.0, features["low_density_ratio"] - 0.22) * 2.6 +
        max(0.0, features["dark_ratio"] - 0.26) * 1.6 +
        max(0.0, 30.0 - features["grad_mean"]) / 65.0
    )

    copd_score = emphysema_score * 0.75 + max(0.0, features["std"] - 28.0) / 90.0

    if pneumonia_score >= 0.20 and features["ggo_ratio"] >= 0.18 and features["bright_ratio"] >= 0.16:
        confidence = 0.5 + min(0.45, pneumonia_score * 0.22)
        lesions.append({
            "name": "肺炎",
            "confidence": round(clamp(confidence, 0.5, 0.95), 2),
            "severity": severity_from_ratio(max(features["ggo_ratio"], features["bright_ratio"]), confidence),
            "description": "肺野内见较局灶的磨玻璃样/片状偏高密度表现，提示炎性改变可能，建议结合症状与实验室检查判断。",
            "location": determine_location(analysis_mask, ggo_mask)
        })

    if fibrosis_score >= 0.22 and features["reticular_ratio"] >= 0.14 and features["grad_high_ratio"] >= 0.20:
        confidence = 0.5 + min(0.45, fibrosis_score * 0.20)
        lesions.append({
            "name": "肺纤维化",
            "confidence": round(clamp(confidence, 0.5, 0.95), 2),
            "severity": severity_from_ratio(features["reticular_ratio"], confidence),
            "description": "肺野纹理增粗并见网格样高频纹理倾向，存在纤维化样改变可能，建议结合高分辨率CT进一步评估。",
            "location": determine_location(analysis_mask, reticular_mask)
        })

    if emphysema_score >= 0.24 and features["low_density_ratio"] >= 0.24 and features["dark_ratio"] >= 0.24:
        confidence = 0.5 + min(0.45, emphysema_score * 0.19)
        lesions.append({
            "name": "肺气肿",
            "confidence": round(clamp(confidence, 0.5, 0.95), 2),
            "severity": severity_from_ratio(features["low_density_ratio"], confidence),
            "description": "肺野内低密度区域比例增高且局部纹理减少，符合肺气肿样改变倾向，建议结合肺功能检查。",
            "location": determine_location(analysis_mask, low_density_mask)
        })

    if copd_score >= 0.25 and emphysema_score >= 0.18 and features["dark_ratio"] >= 0.23 and features["std"] >= 30.0:
        confidence = 0.5 + min(0.45, copd_score * 0.18)
        lesions.append({
            "name": "COPD",
            "confidence": round(clamp(confidence, 0.5, 0.95), 2),
            "severity": severity_from_ratio(max(features["low_density_ratio"], features["dark_ratio"]), confidence),
            "description": "影像上见慢性阻塞性改变倾向，建议结合长期吸烟史、症状及肺功能结果综合判断。",
            "location": "双肺弥漫性"
        })

    lesions.sort(key=lambda x: x["confidence"], reverse=True)
    return lesions


def visualize_lesions(original: Image.Image, lesions: List[Dict]) -> Image.Image:
    """可视化病变区域"""
    img_gray = original.convert('L')
    img_cv = cv2.cvtColor(np.array(img_gray), cv2.COLOR_GRAY2BGR)

    y_offset = 50
    for lesion in lesions[:3]:
        text = f"{lesion['name']}: {lesion['confidence']*100:.1f}% ({lesion['severity']})"
        cv2.putText(
            img_cv,
            text,
            (20, y_offset),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 255),
            2
        )
        y_offset += 30

    return Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB))


def calculate_severity(lesions: List[Dict]) -> str:
    """计算总体严重程度"""
    if not lesions:
        return "正常"

    severity_scores = {"轻度": 1, "中度": 2, "重度": 3}
    max_severity = max(lesions, key=lambda x: severity_scores.get(x['severity'], 0))
    return max_severity['severity']


def generate_treatment_recommendation(lesions: List[Dict]) -> str:
    """生成治疗建议，保持与主要病变一致"""
    if not lesions:
        return "当前影像未见足够证据支持明确病变，建议结合临床症状随访；如症状明显可进一步行CT检查。"

    primary_lesion = lesions[0]['name']
    severity = lesions[0]['severity']

    recommendations = {
        "肺炎": f"提示{severity}肺炎可能，建议结合发热、咳嗽等临床表现与炎症指标评估，必要时复查胸片或CT。",
        "肺气肿": f"提示{severity}肺气肿样改变，建议结合吸烟史及肺功能检查综合评估，避免仅凭单张影像下结论。",
        "肺纤维化": f"提示{severity}肺纤维化样改变，建议至呼吸专科进一步评估，必要时完善高分辨率CT及肺功能检查。",
        "COPD": f"提示{severity}慢阻肺风险，建议结合病史、肺功能及临床症状综合评估，必要时专科随访。"
    }

    return recommendations.get(primary_lesion, "建议进一步专科就诊，完善相关检查。")


def image_to_base64(image: Image.Image) -> str:
    """图像转 base64"""
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')