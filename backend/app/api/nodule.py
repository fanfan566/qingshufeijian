"""
肺结节检测 API 接口
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from PIL import Image
import io
import base64
from loguru import logger
import time
import cv2

router = APIRouter()


class NoduleDetectionResponse(BaseModel):
    """结节检测响应"""
    success: bool
    message: str
    data: Dict[str, Any]
    processing_time: float


class NoduleInfo(BaseModel):
    """结节信息"""
    x: int
    y: int
    size: float  # 直径（mm）
    confidence: float
    type: str  # solid, subsolid, ground_glass
    malignancy_risk: str  # low, medium, high


def image_to_base64(image: Image.Image) -> str:
    """图像转 base64"""
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def parse_segmented_mask(segmented_mask: Optional[str], target_shape: Tuple[int, int]) -> Optional[np.ndarray]:
    """解析前端传入的分割掩码，失败时返回None"""
    if not segmented_mask:
        return None

    try:
        mask_data = segmented_mask
        if isinstance(mask_data, str) and mask_data.startswith("data:image"):
            mask_data = mask_data.split(",", 1)[1]

        mask_bytes = base64.b64decode(mask_data)
        mask_image = Image.open(io.BytesIO(mask_bytes)).convert("L")
        mask_array = np.array(mask_image)

        if mask_array.shape[:2] != target_shape:
            mask_array = cv2.resize(mask_array, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_NEAREST)

        _, binary_mask = cv2.threshold(mask_array, 127, 255, cv2.THRESH_BINARY)

        if np.count_nonzero(binary_mask) < target_shape[0] * target_shape[1] * 0.02:
            return None

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_OPEN, kernel)
        return binary_mask
    except Exception as e:
        logger.warning(f"分割掩码解析失败，改为整图保守检测：{e}")
        return None


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """标准化 + CLAHE 增强"""
    if image is None or image.size == 0:
        raise ValueError("输入图像为空")

    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    gray = gray.astype(np.float32)
    min_val = float(np.min(gray))
    max_val = float(np.max(gray))

    if max_val - min_val < 1e-6:
        norm = np.zeros_like(gray, dtype=np.uint8)
    else:
        norm = ((gray - min_val) / (max_val - min_val) * 255.0).astype(np.uint8)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(norm)
    return enhanced


def build_detection_roi(segmented_mask: Optional[np.ndarray], image_shape: Tuple[int, int]) -> np.ndarray:
    """构建检测区域，优先肺野掩码，否则使用整图中的保守中心区域"""
    h, w = image_shape

    if segmented_mask is not None and np.count_nonzero(segmented_mask) > h * w * 0.02:
        roi = segmented_mask.copy()
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        roi = cv2.morphologyEx(roi, cv2.MORPH_CLOSE, kernel)
        roi = cv2.morphologyEx(roi, cv2.MORPH_OPEN, kernel)
        return roi

    roi = np.zeros((h, w), dtype=np.uint8)
    x1 = int(w * 0.18)
    x2 = int(w * 0.82)
    y1 = int(h * 0.08)
    y2 = int(h * 0.92)
    roi[y1:y2, x1:x2] = 255
    return roi


def split_lung_regions(segmented_mask: Optional[np.ndarray], image_shape: Tuple[int, int]) -> Tuple[np.ndarray, np.ndarray]:
    """拆分左右肺区域，若无可靠掩码则按中线近似"""
    h, w = image_shape
    left_mask = np.zeros((h, w), dtype=np.uint8)
    right_mask = np.zeros((h, w), dtype=np.uint8)

    if segmented_mask is None or np.count_nonzero(segmented_mask) < h * w * 0.02:
        left_mask[:, :w // 2] = 255
        right_mask[:, w // 2:] = 255
        return left_mask, right_mask

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(segmented_mask, connectivity=8)

    components = []
    for i in range(1, num_labels):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < h * w * 0.01:
            continue
        x = int(stats[i, cv2.CC_STAT_LEFT])
        ww = int(stats[i, cv2.CC_STAT_WIDTH])
        cx = x + ww / 2.0
        components.append((area, cx, i))

    if len(components) >= 2:
        components.sort(key=lambda item: item[0], reverse=True)
        main_components = sorted(components[:2], key=lambda item: item[1])
        left_label = main_components[0][2]
        right_label = main_components[1][2]
        left_mask = np.where(labels == left_label, 255, 0).astype(np.uint8)
        right_mask = np.where(labels == right_label, 255, 0).astype(np.uint8)
        return left_mask, right_mask

    left_mask[:, :w // 2] = 255
    right_mask[:, w // 2:] = 255
    left_mask = cv2.bitwise_and(left_mask, segmented_mask)
    right_mask = cv2.bitwise_and(right_mask, segmented_mask)
    return left_mask, right_mask


def get_lung_location(x: int, y: int, left_mask: np.ndarray, right_mask: np.ndarray, image_shape: Tuple[int, int]) -> str:
    """根据坐标返回 左肺/右肺 + 上中下叶"""
    h, w = image_shape

    if 0 <= x < w and 0 <= y < h and left_mask[y, x] > 0:
        side = "左肺"
        region_mask = left_mask
    elif 0 <= x < w and 0 <= y < h and right_mask[y, x] > 0:
        side = "右肺"
        region_mask = right_mask
    else:
        side = "左肺" if x < w // 2 else "右肺"
        region_mask = left_mask if side == "左肺" else right_mask

    ys = np.where(region_mask > 0)[0]
    if ys.size > 0:
        y_min = int(np.min(ys))
        y_max = int(np.max(ys))
    else:
        y_min = 0
        y_max = h - 1

    span = max(1, y_max - y_min + 1)
    relative_y = (y - y_min) / span

    if relative_y < 0.33:
        zone = "上叶"
    elif relative_y < 0.66:
        zone = "中叶"
    else:
        zone = "下叶"

    return f"{side}{zone}"


def build_blob_response_map(enhanced: np.ndarray, roi: np.ndarray) -> np.ndarray:
    """使用 DoG + LoG 样响应构建候选图"""
    img = enhanced.astype(np.float32) / 255.0

    blur_small = cv2.GaussianBlur(img, (0, 0), 1.1)
    blur_large = cv2.GaussianBlur(img, (0, 0), 2.3)
    dog = cv2.subtract(blur_small, blur_large)

    log_resp = cv2.Laplacian(blur_small, cv2.CV_32F, ksize=3)
    log_resp = np.abs(log_resp)

    response = 0.6 * dog + 0.4 * log_resp
    response = np.clip(response, 0, None)

    roi_bool = roi > 0
    if np.count_nonzero(roi_bool) > 0:
        roi_values = response[roi_bool]
        mean_val = float(np.mean(roi_values))
        std_val = float(np.std(roi_values))
    else:
        mean_val = float(np.mean(response))
        std_val = float(np.std(response))

    threshold = mean_val + max(0.04, std_val * 0.9)
    binary = (response > threshold).astype(np.uint8) * 255
    binary = cv2.bitwise_and(binary, roi)

    kernel3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel3)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel5)
    return binary


def classify_nodule_type(mean_intensity: float, contrast_score: float, circularity: float) -> str:
    """基于局部亮度、对比度和形态进行保守分型"""
    if contrast_score > 22 and circularity > 0.72 and mean_intensity > 145:
        return "solid"
    if contrast_score > 14 and mean_intensity > 125:
        return "subsolid"
    return "ground_glass"


def compute_confidence(circularity: float, solidity: float, contrast_score: float, size_score: float) -> float:
    """计算 0.5-0.95 范围内的确定性置信度"""
    contrast_norm = np.clip(contrast_score / 35.0, 0.0, 1.0)
    score = (
        0.30 * np.clip(circularity, 0.0, 1.0) +
        0.24 * np.clip(solidity, 0.0, 1.0) +
        0.28 * contrast_norm +
        0.18 * np.clip(size_score, 0.0, 1.0)
    )
    confidence = 0.5 + 0.45 * score
    return float(np.clip(confidence, 0.5, 0.95))


def estimate_malignancy_risk(size_mm: float, nodule_type: str, confidence: float) -> str:
    """根据大小、类型和置信度给出确定性风险评估"""
    risk_score = 0.0

    if size_mm >= 12:
        risk_score += 0.45
    elif size_mm >= 8:
        risk_score += 0.30
    elif size_mm >= 5:
        risk_score += 0.18
    else:
        risk_score += 0.08

    if nodule_type == "solid":
        risk_score += 0.24
    elif nodule_type == "subsolid":
        risk_score += 0.16
    else:
        risk_score += 0.10

    risk_score += (confidence - 0.5) * 0.8

    if risk_score >= 0.72:
        return "high"
    if risk_score >= 0.48:
        return "medium"
    return "low"


def detect_nodules_traditional(image: np.ndarray, segmented_mask: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
    """
    使用确定性传统图像处理方法检测结节候选
    """
    enhanced = preprocess_image(image)
    h, w = enhanced.shape[:2]

    roi = build_detection_roi(segmented_mask, (h, w))
    left_mask, right_mask = split_lung_regions(segmented_mask, (h, w))
    candidate_map = build_blob_response_map(enhanced, roi)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(candidate_map, connectivity=8)

    image_area = h * w
    min_area = max(9, int(image_area * 0.00004))
    max_area = max(min_area + 1, int(image_area * 0.006))

    nodules = []

    for i in range(1, num_labels):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area or area > max_area:
            continue

        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        ww = int(stats[i, cv2.CC_STAT_WIDTH])
        hh = int(stats[i, cv2.CC_STAT_HEIGHT])

        component = np.where(labels == i, 255, 0).astype(np.uint8)
        contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        contour = max(contours, key=cv2.contourArea)
        contour_area = float(cv2.contourArea(contour))
        perimeter = float(cv2.arcLength(contour, True))
        if contour_area <= 0 or perimeter <= 0:
            continue

        circularity = float(4.0 * np.pi * contour_area / (perimeter * perimeter + 1e-6))
        hull = cv2.convexHull(contour)
        hull_area = float(cv2.contourArea(hull)) + 1e-6
        solidity = float(contour_area / hull_area)
        aspect_ratio = float(max(ww, hh) / max(1, min(ww, hh)))

        if circularity < 0.40 or solidity < 0.72 or aspect_ratio > 2.2:
            continue

        cx = x + ww // 2
        cy = y + hh // 2

        if roi[cy, cx] == 0:
            continue

        diameter_px = (ww + hh) / 2.0
        diameter_mm = diameter_px * 0.8
        if diameter_mm < 3.0 or diameter_mm > 30.0:
            continue

        radius_px = max(1.0, diameter_px / 2.0)
        pad = int(max(6, radius_px * 1.8))
        x1 = max(0, cx - pad)
        x2 = min(w, cx + pad)
        y1 = max(0, cy - pad)
        y2 = min(h, cy + pad)

        patch = enhanced[y1:y2, x1:x2]
        local_mask = component[y1:y2, x1:x2] > 0

        if patch.size == 0 or np.count_nonzero(local_mask) == 0:
            continue

        inside_mean = float(np.mean(patch[local_mask]))
        outside_mask = np.ones_like(local_mask, dtype=bool)
        outside_mask[local_mask] = False

        if np.count_nonzero(outside_mask) > 10:
            outside_mean = float(np.mean(patch[outside_mask]))
        else:
            outside_mean = inside_mean

        contrast_score = inside_mean - outside_mean
        if contrast_score < 8:
            continue

        size_score = 1.0 - min(abs(diameter_mm - 9.0) / 12.0, 1.0)
        nodule_type = classify_nodule_type(inside_mean, contrast_score, circularity)
        confidence = compute_confidence(circularity, solidity, contrast_score, size_score)

        if confidence < 0.55:
            continue

        location = get_lung_location(cx, cy, left_mask, right_mask, (h, w))
        malignancy_risk = estimate_malignancy_risk(diameter_mm, nodule_type, confidence)

        nodules.append({
            "id": len(nodules) + 1,
            "x": int(cx),
            "y": int(cy),
            "size": round(float(diameter_mm), 2),
            "confidence": round(float(confidence), 3),
            "type": nodule_type,
            "malignancy_risk": malignancy_risk,
            "location": location,
            "radius": int(max(4, radius_px)),
            "score": round(float(confidence), 3),
            "description": f"{location}见候选结节，直径约{diameter_mm:.1f}mm，局部对比度{'较高' if contrast_score > 18 else '中等'}。"
        })

    nodules.sort(key=lambda item: (-item["confidence"], -item["size"]))

    deduplicated = []
    for nodule in nodules:
        keep = True
        for existed in deduplicated:
            dx = nodule["x"] - existed["x"]
            dy = nodule["y"] - existed["y"]
            distance = (dx * dx + dy * dy) ** 0.5
            if distance < max(nodule["radius"], existed["radius"]) * 1.4:
                keep = False
                break
        if keep:
            deduplicated.append(nodule)

    for index, nodule in enumerate(deduplicated[:5]):
        nodule["id"] = index + 1

    return deduplicated[:5]


def visualize_nodules(original: Image.Image, nodules: List[Dict[str, Any]]) -> Image.Image:
    """可视化结节标记"""
    img_gray = original.convert('L').resize((512, 512))
    img_cv = cv2.cvtColor(np.array(img_gray), cv2.COLOR_GRAY2BGR)

    for nodule in nodules:
        x, y = int(nodule['x']), int(nodule['y'])
        radius = int(nodule.get('radius', max(4, nodule['size'] / 0.8 / 2)))

        if nodule['malignancy_risk'] == 'high':
            color = (0, 0, 255)
        elif nodule['malignancy_risk'] == 'medium':
            color = (0, 165, 255)
        else:
            color = (0, 255, 0)

        cv2.circle(img_cv, (x, y), radius, color, 2)
        cv2.circle(img_cv, (x, y), 2, (255, 255, 255), -1)
        label = f"N{nodule['id']} {nodule['location']}"
        cv2.putText(img_cv, label, (x + radius + 2, max(15, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

    return Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB))


def generate_recommendation(nodules: List[Dict[str, Any]]) -> str:
    """生成基于实际结果的保守建议"""
    if not nodules:
        return "未发现明确高可信结节候选，建议结合原始 CT 序列与临床信息综合判断，必要时定期复查。"

    max_size = max(n['size'] for n in nodules)
    max_confidence = max(n['confidence'] for n in nodules)
    high_risk_count = sum(1 for n in nodules if n['malignancy_risk'] == 'high')

    if high_risk_count > 0 or max_size >= 12 or max_confidence >= 0.82:
        return "发现较高关注度结节候选，建议尽快结合薄层 CT、既往影像对比及专科医生意见进一步评估。"
    if len(nodules) >= 2 or max_size >= 8 or max_confidence >= 0.70:
        return "发现可疑结节候选，建议结合既往影像资料，按医嘱进行短期随访或进一步检查。"
    return "发现少量低风险结节候选，建议记录位置与大小，结合临床情况定期复查。"


@router.post("/detect", response_model=NoduleDetectionResponse)
async def detect_nodules(
    image: UploadFile = File(..., description="肺部 CT 图像"),
    segmented_mask: str = File(None, description="分割掩码（可选）")
):
    """
    肺结节检测

    检测肺部 CT 图像中的疑似结节，并评估恶性风险
    """
    start_time = time.time()

    try:
        logger.info("🔍 开始结节检测...")

        image_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(pil_image.convert('L'))
        image_array = cv2.resize(image_array, (512, 512))

        mask_array = parse_segmented_mask(segmented_mask, image_array.shape[:2])
        nodules = detect_nodules_traditional(image_array, mask_array)

        result_image = visualize_nodules(pil_image, nodules)

        stats = {
            "total_nodules": len(nodules),
            "solid_nodules": sum(1 for n in nodules if n['type'] == 'solid'),
            "ground_glass_nodules": sum(1 for n in nodules if n['type'] == 'ground_glass'),
            "high_risk_nodules": sum(1 for n in nodules if n['malignancy_risk'] == 'high'),
            "average_size": round(float(np.mean([n['size'] for n in nodules])), 2) if nodules else 0
        }

        processing_time = time.time() - start_time
        logger.info(f"✅ 检测到 {len(nodules)} 个结节，耗时：{processing_time:.2f}s")

        return NoduleDetectionResponse(
            success=True,
            message=f"检测到 {len(nodules)} 个疑似结节",
            data={
                "original_image": image_to_base64(pil_image.convert('L').resize((512, 512))),
                "marked_image": image_to_base64(result_image),
                "nodules": nodules,
                "stats": stats,
                "recommendation": generate_recommendation(nodules)
            },
            processing_time=processing_time
        )

    except Exception as e:
        logger.error(f"❌ 结节检测失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"检测失败：{str(e)}")