"""
基于 lungmask 的肺部分割 API - 完整专业版
使用预训练的 lungmask 模型，提供准确的肺部分割
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import List
from fastapi.responses import JSONResponse
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
# 中文字体，避免对比图标题显示为方框
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
import io
import base64
import tempfile
import os
from PIL import Image
import SimpleITK as sitk
from loguru import logger
import time
import math

# 导入 lungmask
try:
    from lungmask import LMInferer
    LUNGMASK_AVAILABLE = True
    logger.info("✅ 正在加载 lungmask 模型...")
    inferer = LMInferer()  # 启动时加载模型
    logger.info("✅ lungmask 模型加载成功")
except Exception as e:
    LUNGMASK_AVAILABLE = False
    logger.error(f"❌ lungmask 加载失败：{e}")
    inferer = None

router = APIRouter()


def validate_segmentation_result(
    left_area: int,
    right_area: int,
    total_lung_area: int,
    effective_area: int,
    total_pixels: int,
    pixel_spacing_mm: float = 0.7,
    ratio_reliable: bool = True,
    crop_warnings=None,
) -> dict:
    """
    分割结果校验：
    - 主要采用“肺野占有效CT区域百分比”，避免截图缩放导致 mm² 误导
    - 左右肺必须基于独立区域统计，不再按中线硬切
    - 增加强异常规则：left/right < 0.5 或 > 1.5 必须判定失败
    """
    warnings = list(crop_warnings or [])
    confidence = 0.95

    if total_lung_area == 0:
        return {
            "passed": False,
            "reason": "未检测到肺部区域",
            "confidence": 0.0,
            "warnings": ["肺区域为空"],
        }

    if effective_area > 0:
        lung_effective_ratio = total_lung_area / effective_area
        if lung_effective_ratio < 0.18:
            warnings.append(f"肺野占有效区域 {lung_effective_ratio:.1%}（过低，可能分割不足）")
            confidence -= 0.28
        elif lung_effective_ratio > 0.82:
            warnings.append(f"肺野占有效区域 {lung_effective_ratio:.1%}（过高，可能包含边框/骨骼/软组织）")
            confidence -= 0.30
    else:
        warnings.append("无法估算有效CT区域")
        confidence -= 0.20

    forced_fail = False

    if left_area > 0 and right_area > 0:
        lr_ratio = left_area / right_area
        if lr_ratio < 0.5:
            warnings.append("左肺分割可能不完整，请人工复核")
            confidence -= 0.30
            forced_fail = True
        elif lr_ratio > 1.5:
            warnings.append("右肺分割可能不完整，请人工复核")
            confidence -= 0.30
            forced_fail = True
        elif lr_ratio > 1.30:
            warnings.append(f"左肺远大于右肺 ({lr_ratio:.2f}:1)")
            confidence -= 0.18
        elif lr_ratio < 0.65:
            warnings.append(f"右肺远大于左肺 (左:右={lr_ratio:.2f}:1)")
            confidence -= 0.18
    elif left_area == 0 and right_area > 0:
        warnings.append("左肺分割可能不完整，请人工复核")
        confidence -= 0.35
        forced_fail = True
    elif right_area == 0 and left_area > 0:
        warnings.append("右肺分割可能不完整，请人工复核")
        confidence -= 0.35
        forced_fail = True

    if total_pixels > 0:
        lung_total = total_lung_area / total_pixels
        if lung_total < 0.03:
            warnings.append(f"肺野占整张图像 {lung_total:.1%}（异常低）")
            confidence -= 0.10
        elif lung_total > 0.70:
            warnings.append(f"肺野占整张图像 {lung_total:.1%}（异常高）")
            confidence -= 0.10

    if total_pixels > 0:
        min_px = total_pixels * 0.015
        if left_area < min_px and left_area > 0:
            warnings.append("左肺区域过小")
            confidence -= 0.10
        if right_area < min_px and right_area > 0:
            warnings.append("右肺区域过小")
            confidence -= 0.10

    area_px = pixel_spacing_mm * pixel_spacing_mm
    for name, px in [("左肺", left_area), ("右肺", right_area)]:
        mm2 = px * area_px
        if mm2 > 0 and (mm2 < 2000 or mm2 > 120000):
            warnings.append(f"{name}面积估计值偏离常见范围")
            confidence -= 0.08

    if not ratio_reliable:
        warnings.append("左右肺比例受图像裁切/偏移影响，结果可靠性下降")
        confidence -= 0.18
        forced_fail = True

    if len(warnings) >= 2:
        confidence = max(0.0, confidence - 0.12)

    passed = (confidence >= 0.40 and len(warnings) <= 2 and ratio_reliable and not forced_fail)
    if forced_fail:
        passed = False
    if not passed and not warnings:
        warnings.append("综合评分过低")

    warnings = list(dict.fromkeys(warnings))

    return {
        "passed": passed,
        "reason": "; ".join(warnings) if warnings else "校验通过",
        "confidence": max(0.0, round(confidence, 2)),
        "warnings": warnings,
    }


def _estimate_effective_ct_area(img_uint8: np.ndarray) -> np.ndarray:
    """
    估算有效CT区域，尽量排除截图边框、纯白背景、页面留白。
    返回 uint8 mask（0/255）
    """
    import cv2

    h, w = img_uint8.shape
    blurred = cv2.GaussianBlur(img_uint8, (5, 5), 0)

    non_white_mask = np.where(blurred < 245, 255, 0).astype(np.uint8)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    non_white_mask = cv2.morphologyEx(non_white_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    non_white_mask = cv2.morphologyEx(non_white_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(non_white_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.ones((h, w), dtype=np.uint8) * 255

    min_area = h * w * 0.05
    candidates = [c for c in contours if cv2.contourArea(c) > min_area]
    if not candidates:
        return np.ones((h, w), dtype=np.uint8) * 255

    best = max(candidates, key=cv2.contourArea)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [best], -1, 255, -1)
    return mask


def _detect_ct_region(img_uint8: np.ndarray) -> tuple:
    """
    截图检测：从截图（含黑色边框/UI元素）中提取CT区域
    Returns (roi_array, offset_x, offset_y) or (None, 0, 0)
    """
    import cv2
    h, w = img_uint8.shape

    binary = np.where((img_uint8 > 8) & (img_uint8 < 245), 255, 0).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=3)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=2)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, 0, 0

    min_area = h * w * 0.08
    candidates = [c for c in contours if cv2.contourArea(c) > min_area]
    if not candidates:
        return None, 0, 0

    best = max(candidates, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(best)
    if bw * bh < h * w * 0.05:
        return None, 0, 0

    pad_x = max(2, int(bw * 0.02))
    pad_y = max(2, int(bh * 0.02))
    x1 = min(w, x + pad_x)
    y1 = min(h, y + pad_y)
    x2 = max(x1 + 1, min(w, x + bw - pad_x))
    y2 = max(y1 + 1, min(h, y + bh - pad_y))

    roi = img_uint8[y1:y2, x1:x2]
    return roi, x1, y1


def _create_body_region_mask(img_uint8: np.ndarray) -> np.ndarray:
    """
    针对截图/照片中的单层 CT，先提取身体截面区域，避免把黑色背景、UI 边框、
    左右留白误识别为肺野。
    """
    import cv2

    h, w = img_uint8.shape
    blurred = cv2.GaussianBlur(img_uint8, (5, 5), 0)

    # 身体组织通常高于纯空气背景，先用较宽松阈值取非空气区域
    body_candidate = np.where((blurred > 20) & (blurred < 245), 255, 0).astype(np.uint8)

    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    body_candidate = cv2.morphologyEx(body_candidate, cv2.MORPH_CLOSE, close_kernel, iterations=2)
    body_candidate = cv2.morphologyEx(body_candidate, cv2.MORPH_OPEN, open_kernel, iterations=1)

    contours, _ = cv2.findContours(body_candidate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.zeros((h, w), dtype=np.uint8)

    min_area = h * w * 0.10
    center_x, center_y = w / 2.0, h / 2.0
    best_score = None
    best_mask = np.zeros((h, w), dtype=np.uint8)

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        x, y, bw, bh = cv2.boundingRect(contour)
        cx = x + bw / 2.0
        cy = y + bh / 2.0

        center_penalty = abs(cx - center_x) / max(w, 1) + abs(cy - center_y) / max(h, 1)
        fill_ratio = area / max(bw * bh, 1)
        score = area * (1.0 + fill_ratio) - center_penalty * h * w * 0.15

        if best_score is None or score > best_score:
            best_score = score
            best_mask = np.zeros((h, w), dtype=np.uint8)
            cv2.drawContours(best_mask, [contour], -1, 255, -1)

    if np.sum(best_mask) == 0:
        return np.zeros((h, w), dtype=np.uint8)

    # 适度腐蚀掉贴边外圈，减少截图边框和机床黑边影响
    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    best_mask = cv2.erode(best_mask, erode_kernel, iterations=1)

    return best_mask


def _segment_ct_body(img_uint8: np.ndarray) -> np.ndarray:
    """
    从CT身体截面分割肺部（已裁剪，无边框）
    修复：减小边缘切除幅度(1%→保留更多肺组织)，增加连通域合并
    """
    import cv2
    h, w = img_uint8.shape

    effective_mask = _estimate_effective_ct_area(img_uint8)
    body_mask = _create_body_region_mask(img_uint8)
    analysis_mask = cv2.bitwise_and(effective_mask, body_mask)
    if np.sum(analysis_mask) == 0:
        analysis_mask = effective_mask
    effective_pixels = img_uint8[analysis_mask > 0]
    if len(effective_pixels) == 0:
        return np.zeros((h, w), dtype=np.uint8)

    p10 = float(np.percentile(effective_pixels, 10))
    p35 = float(np.percentile(effective_pixels, 35))
    p50 = float(np.percentile(effective_pixels, 50))

    thresh_val = int(min(p35, (p10 + p50) / 2.0))
    thresh_val = max(8, min(110, thresh_val))

    lung_candidate = np.where((img_uint8 <= thresh_val) & (analysis_mask > 0), 255, 0).astype(np.uint8)

    # 修复：边缘切除从 3% 降至 1%，保留靠近边缘的肺组织
    edge_margin_x = max(2, int(w * 0.01))
    edge_margin_y = max(2, int(h * 0.01))
    lung_candidate[:edge_margin_y, :] = 0
    lung_candidate[h - edge_margin_y:, :] = 0
    lung_candidate[:, :edge_margin_x] = 0
    lung_candidate[:, w - edge_margin_x:] = 0

    open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    lung_candidate = cv2.morphologyEx(lung_candidate, cv2.MORPH_OPEN, open_kernel, iterations=2)
    lung_candidate = cv2.morphologyEx(lung_candidate, cv2.MORPH_CLOSE, close_kernel, iterations=2)

    contours, _ = cv2.findContours(lung_candidate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.zeros((h, w), dtype=np.uint8)

    body_center_x = w / 2.0
    body_center_y = h / 2.0
    body_area = max(int(np.sum(body_mask > 0)), 1)

    candidates = []
    min_component_area = max(int(body_area * 0.015), int(h * w * 0.002))

    for c in contours:
        area = cv2.contourArea(c)
        if area < min_component_area:
            continue

        x, y, bw, bh = cv2.boundingRect(c)
        cx = x + bw / 2.0
        cy = y + bh / 2.0
        aspect = bh / max(bw, 1)
        extent = area / max(bw * bh, 1)
        center_distance = abs(cx - body_center_x) / max(w, 1) + abs(cy - body_center_y) / max(h, 1)

        # 肺野通常位于胸腔中上部，不应太靠下，也不应细长畸形
        if cy > h * 0.82:
            continue
        if aspect < 0.45 or aspect > 3.2:
            continue
        if extent < 0.18:
            continue
        if center_distance > 0.95:
            continue

        side = "left" if cx < body_center_x else "right"
        side_penalty = abs(cx - (w * 0.30 if side == "left" else w * 0.70)) / max(w, 1)
        score = area * (1.4 - min(side_penalty, 0.8)) * (1.0 + min(extent, 0.8))

        candidates.append({
            "contour": c,
            "area": area,
            "cx": cx,
            "cy": cy,
            "side": side,
            "score": score,
        })

    if not candidates:
        return np.zeros((h, w), dtype=np.uint8)

    left_candidates = sorted([item for item in candidates if item["side"] == "left"], key=lambda item: item["score"], reverse=True)
    right_candidates = sorted([item for item in candidates if item["side"] == "right"], key=lambda item: item["score"], reverse=True)

    kept = []
    if left_candidates:
        kept.append(left_candidates[0]["contour"])
    if right_candidates:
        kept.append(right_candidates[0]["contour"])

    # 若只找到单侧，补充最接近胸腔中心带的次优区域，但限制面积，避免整块背景被吞进来
    if not kept:
        return np.zeros((h, w), dtype=np.uint8)
    if len(kept) == 1:
        backup = sorted(candidates, key=lambda item: item["score"], reverse=True)
        for item in backup:
            if item["contour"] is kept[0]:
                continue
            if item["area"] <= body_area * 0.35:
                kept.append(item["contour"])
                break

    result = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(result, kept, -1, 255, -1)

    result = cv2.bitwise_and(result, analysis_mask)
    result = cv2.morphologyEx(result, cv2.MORPH_OPEN, open_kernel, iterations=1)
    result = cv2.morphologyEx(result, cv2.MORPH_CLOSE, close_kernel, iterations=2)

    # 限制结果必须落在身体区域内部，减少整个黑底被误认为肺
    result = cv2.bitwise_and(result, body_mask)

    return result


def array_to_base64_png(fig) -> str:
    """将 matplotlib 图像转为 Base64 编码的 PNG 字符串"""
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    return img_base64


def image_to_base64_png(image: Image.Image) -> str:
    """将 PIL 图像转为 Base64 编码 PNG 字符串"""
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


def _connected_components(binary_mask: np.ndarray):
    import cv2
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_mask.astype(np.uint8), connectivity=8)
    return num_labels, labels, stats, centroids


def _extract_left_right_lungs(
    binary_mask: np.ndarray,
    patient_left_on_image_right: bool = True,
    anatomical_mapping_reliable: bool = True,
):
    """
    基于连通域提取左右肺，并显式区分：
    - 图像左右（image left / image right）
    - 解剖左右（patient left / patient right）

    约定：
    - patient_left_on_image_right=True：图像右侧对应“解剖左肺”
      这符合经过 DICOM LPS 归一后的常规轴位显示
    - patient_left_on_image_right=False：图像左侧对应“解剖左肺”
    - 对普通截图/照片，若无法确认方向，可把 anatomical_mapping_reliable=False，
      这样仍返回左右掩码，但会显式标记“解剖侧别不可靠”

    返回：left_mask(解剖左肺), right_mask(解剖右肺), suspected_issue_regions
    """
    suspected_issue_regions = []
    binary_mask = (binary_mask > 0).astype(np.uint8)

    if np.sum(binary_mask) == 0:
        return np.zeros_like(binary_mask), np.zeros_like(binary_mask), ["empty_mask"]

    num_labels, labels, stats, centroids = _connected_components(binary_mask)
    components = []
    for label in range(1, num_labels):
        area = int(stats[label, 4])
        if area <= 0:
            continue

        x = int(stats[label, 0])
        y = int(stats[label, 1])
        w = int(stats[label, 2])
        h = int(stats[label, 3])
        cx = float(centroids[label][0])
        cy = float(centroids[label][1])

        components.append({
            "label": label,
            "area": area,
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "x1": x,
            "y1": y,
            "x2": x + w,
            "y2": y + h,
            "cx": cx,
            "cy": cy,
        })

    if not components:
        return np.zeros_like(binary_mask), np.zeros_like(binary_mask), ["empty_components"]

    width = binary_mask.shape[1]
    total_pixels = int(np.sum(binary_mask))
    min_anchor_area = max(int(total_pixels * 0.08), int(binary_mask.shape[0] * binary_mask.shape[1] * 0.003))

    major_components = [
        item for item in sorted(components, key=lambda item: item["area"], reverse=True)
        if item["area"] >= min_anchor_area
    ]

    image_left_mask = np.zeros_like(binary_mask)
    image_right_mask = np.zeros_like(binary_mask)

    def _merge_label(mask: np.ndarray, label_value: int):
        return np.where(labels == label_value, 1, mask).astype(np.uint8)

    if len(major_components) >= 2:
        anchors = sorted(major_components[:2], key=lambda item: item["cx"])
        image_left_anchor, image_right_anchor = anchors[0], anchors[1]

        image_left_mask = _merge_label(image_left_mask, image_left_anchor["label"])
        image_right_mask = _merge_label(image_right_mask, image_right_anchor["label"])

        for comp in components:
            label = comp["label"]
            if label in {image_left_anchor["label"], image_right_anchor["label"]}:
                continue

            overlap_left = max(0, min(comp["y2"], image_left_anchor["y2"]) - max(comp["y1"], image_left_anchor["y1"]))
            overlap_right = max(0, min(comp["y2"], image_right_anchor["y2"]) - max(comp["y1"], image_right_anchor["y1"]))

            dist_left = abs(comp["cx"] - image_left_anchor["cx"])
            dist_right = abs(comp["cx"] - image_right_anchor["cx"])

            left_score = overlap_left * 2.0 - dist_left * 0.35
            right_score = overlap_right * 2.0 - dist_right * 0.35

            if left_score == right_score:
                if comp["cx"] < width / 2.0:
                    image_left_mask = _merge_label(image_left_mask, label)
                else:
                    image_right_mask = _merge_label(image_right_mask, label)
            elif left_score > right_score:
                image_left_mask = _merge_label(image_left_mask, label)
            else:
                image_right_mask = _merge_label(image_right_mask, label)
    else:
        primary = max(components, key=lambda item: item["area"])
        primary_mask = (labels == primary["label"]).astype(np.uint8)

        image_left_half = np.zeros_like(primary_mask)
        image_right_half = np.zeros_like(primary_mask)
        mid_x = width // 2
        image_left_half[:, :mid_x] = primary_mask[:, :mid_x]
        image_right_half[:, mid_x:] = primary_mask[:, mid_x:]

        if np.sum(image_left_half) == 0 or np.sum(image_right_half) == 0:
            if primary["cx"] < width / 2.0:
                image_left_mask = primary_mask
                image_right_mask = np.zeros_like(binary_mask)
                suspected_issue_regions.append("single_lung_component_image_left_side")
            else:
                image_left_mask = np.zeros_like(binary_mask)
                image_right_mask = primary_mask
                suspected_issue_regions.append("single_lung_component_image_right_side")

            suspected_issue_regions.append("left_right_split_unreliable")
        else:
            image_left_mask = image_left_half.astype(np.uint8)
            image_right_mask = image_right_half.astype(np.uint8)
            suspected_issue_regions.append("single_component_split_by_midline")
            suspected_issue_regions.append("left_right_split_unreliable")

    if patient_left_on_image_right:
        left_mask = image_right_mask.astype(np.uint8)
        right_mask = image_left_mask.astype(np.uint8)
    else:
        left_mask = image_left_mask.astype(np.uint8)
        right_mask = image_right_mask.astype(np.uint8)

    if not anatomical_mapping_reliable:
        suspected_issue_regions.append("anatomical_left_right_mapping_unreliable")

    left_pixels = int(np.sum(left_mask))
    right_pixels = int(np.sum(right_mask))
    total_lung_pixels = left_pixels + right_pixels

    if total_lung_pixels > 0:
        smaller_ratio = min(left_pixels, right_pixels) / max(total_lung_pixels, 1)
        if 0 < smaller_ratio < 0.18:
            if left_pixels < right_pixels:
                suspected_issue_regions.append("left_lung_severely_undersegmented")
            else:
                suspected_issue_regions.append("right_lung_severely_undersegmented")
        elif 0 < smaller_ratio < 0.24:
            if left_pixels < right_pixels:
                suspected_issue_regions.append("left_lung_possibly_undersegmented")
            else:
                suspected_issue_regions.append("right_lung_possibly_undersegmented")

        if left_pixels == 0:
            suspected_issue_regions.append("left_lung_missing")
        if right_pixels == 0:
            suspected_issue_regions.append("right_lung_missing")

    if len(components) > 3:
        suspected_issue_regions.append("additional_fragmented_regions_detected")

    return left_mask, right_mask, list(dict.fromkeys(suspected_issue_regions))


def _detect_crop_and_offset(mask: np.ndarray, left_mask: np.ndarray, right_mask: np.ndarray):
    """
    检测图像裁切/偏移：
    - 上下左右触边分别生成 crop_warnings
    - 若存在明显触边，则 ratio_reliable=False
    """
    h, w = mask.shape
    crop_warnings = []
    suspected_issue_regions = []
    ratio_reliable = True

    if np.sum(mask) == 0:
        return ["未检测到有效肺部分割区域"], ["empty_mask"], False

    touch_top = bool(np.any(mask[0, :] > 0))
    touch_bottom = bool(np.any(mask[h - 1, :] > 0))
    touch_left = bool(np.any(mask[:, 0] > 0))
    touch_right = bool(np.any(mask[:, w - 1] > 0))

    if touch_top:
        crop_warnings.append("肺部分割触及图像上边缘，可能存在上方裁切")
        suspected_issue_regions.append("top_edge_crop")
    if touch_bottom:
        crop_warnings.append("肺部分割触及图像下边缘，可能存在下方裁切")
        suspected_issue_regions.append("bottom_edge_crop")
    if touch_left:
        crop_warnings.append("肺部分割触及图像左边缘，可能存在左侧裁切")
        suspected_issue_regions.append("left_edge_crop")
    if touch_right:
        crop_warnings.append("肺部分割触及图像右边缘，可能存在右侧裁切")
        suspected_issue_regions.append("right_edge_crop")

    ys, xs = np.where(mask > 0)
    if len(xs) > 0 and len(ys) > 0:
        x_min, x_max = int(xs.min()), int(xs.max())
        y_min, y_max = int(ys.min()), int(ys.max())
        if x_min <= max(2, int(w * 0.01)):
            ratio_reliable = False
        if x_max >= w - 1 - max(2, int(w * 0.01)):
            ratio_reliable = False
        if y_min <= max(2, int(h * 0.01)):
            ratio_reliable = False
        if y_max >= h - 1 - max(2, int(h * 0.01)):
            ratio_reliable = False

    if touch_top or touch_bottom or touch_left or touch_right:
        ratio_reliable = False

    if np.sum(left_mask) == 0:
        suspected_issue_regions.append("left_lung_missing")
    if np.sum(right_mask) == 0:
        suspected_issue_regions.append("right_lung_missing")

    return list(dict.fromkeys(crop_warnings)), list(dict.fromkeys(suspected_issue_regions)), ratio_reliable


def _get_lung_status(side: str, percentage: float) -> str:
    """
    肺占比状态：
    - 左肺常见约 40%-55%
    - 右肺常见约 45%-60%
    仅用于提示，不直接作为疾病/分割失败的硬性依据。
    """
    if side == "left":
        if 40 <= percentage <= 55:
            return "normal"
        if (35 <= percentage < 40) or (55 < percentage <= 60):
            return "warning"
        return "abnormal"

    if 45 <= percentage <= 60:
        return "normal"
    if (40 <= percentage < 45) or (60 < percentage <= 65):
        return "warning"
    return "abnormal"


def _precheck_input_image(img_uint8: np.ndarray) -> dict:
    """
    对普通图片做快速输入预校验，尽早识别明显不适合做肺部分割的输入。
    仅用于提示，不直接抛异常，避免误杀可用截图。
    """
    h, w = img_uint8.shape[:2]
    warnings = []
    passed = True

    if min(h, w) < 200:
        warnings.append("图像尺寸过小，可能不是原始胸部CT")
        passed = False

    aspect_ratio = w / max(h, 1)
    if aspect_ratio < 0.7 or aspect_ratio > 1.4:
        warnings.append("图像宽高比异常，可能不是标准胸部CT")
        passed = False

    center_y1, center_y2 = h // 3, max(h // 3 + 1, (2 * h) // 3)
    center_x1, center_x2 = w // 3, max(w // 3 + 1, (2 * w) // 3)
    center_region = img_uint8[center_y1:center_y2, center_x1:center_x2]

    if center_region.size > 0:
        center_std = float(np.std(center_region))
        center_mean = float(np.mean(center_region))
        if center_std < 8:
            warnings.append("图像中心区域纹理过少，可能不是有效胸部CT层面")
            passed = False
        if center_mean < 8 or center_mean > 245:
            warnings.append("图像中心区域灰度异常，可能存在大面积空白或背景")
            passed = False

    body_mask = _create_body_region_mask(img_uint8)
    body_ratio = float(np.sum(body_mask > 0)) / max(h * w, 1)
    if body_ratio < 0.12:
        warnings.append("图像中的身体区域占比过低，可能存在过度裁剪或非胸部图像")
        passed = False

    return {
        "passed": passed,
        "warnings": list(dict.fromkeys(warnings)),
        "image_size": [int(h), int(w)],
        "aspect_ratio": round(float(aspect_ratio), 3),
        "body_ratio": round(float(body_ratio), 4),
    }


def _summarize_segmentation_findings(
    lung_percentage: float,
    validation: dict,
    suspected_issue_regions: list,
    ratio_reliable: bool,
    anatomical_mapping_reliable: bool,
) -> dict:
    """
    将底层杂乱 warning / issue 收敛为面向前端和报告的分层总结。
    """
    severity = "info"
    summary = "分割结果基本可用"
    reasons = []
    suggestions = []

    if lung_percentage < 30:
        severity = "error"
        summary = "本次分析结果不可靠：肺部区域占比明显过低"
        reasons.append(f"肺部区域在有效图像中的占比仅 {lung_percentage:.1f}%，明显低于常见胸部CT范围")
        suggestions.extend([
            "请重新上传完整的胸部CT图像或标准DICOM序列",
            "避免使用裁切过度、包含大量边框或页面背景的截图",
        ])
    elif lung_percentage > 80:
        severity = "error"
        summary = "本次分析结果不可靠：肺部区域占比明显过高"
        reasons.append(f"肺部区域在有效图像中的占比达到 {lung_percentage:.1f}%，可能混入背景或非肺组织")
        suggestions.extend([
            "请检查图像是否包含大面积黑边、白边或非医学界面元素",
            "建议上传原始DICOM而非二次截图",
        ])

    if not validation.get("passed", True):
        if severity == "info":
            severity = "warning"
            summary = "分割结果存在明显异常，建议人工复核"
        reasons.extend(validation.get("warnings", []))

    if not ratio_reliable:
        severity = "error" if severity == "info" else severity
        reasons.append("左右肺比例受裁切或触边影响，当前面积统计不稳定")
        suggestions.append("请上传肺野完整、无遮挡、未触边的图像")

    if not anatomical_mapping_reliable:
        if severity == "info":
            severity = "warning"
        reasons.append("当前输入无法可靠判断解剖左右，左右肺文字结论仅供参考")
        suggestions.append("如需可靠左右侧别，请优先上传原始DICOM序列")

    if "left_lung_missing" in suspected_issue_regions or "right_lung_missing" in suspected_issue_regions:
        severity = "error" if severity != "error" else severity
        reasons.append("分割结果疑似缺失单侧肺野")
        suggestions.append("请检查图像是否仅包含单肺、严重裁切或层面不合适")

    if "single_component_split_by_midline" in suspected_issue_regions or "left_right_split_unreliable" in suspected_issue_regions:
        if severity == "info":
            severity = "warning"
        reasons.append("当前左右肺来自单连通域回退切分，侧别稳定性不足")

    reasons = list(dict.fromkeys([item for item in reasons if item]))
    suggestions = list(dict.fromkeys([item for item in suggestions if item]))

    return {
        "severity": severity,
        "summary": summary,
        "reasons": reasons,
        "suggestions": suggestions,
        "is_reliable": severity == "info",
    }


def _mask_to_boundary_points(mask: np.ndarray, max_points: int = 300):
    import cv2
    mask_uint8 = (mask > 0).astype(np.uint8) * 255
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    points = []
    for contour in contours:
        contour_points = contour.squeeze(axis=1) if len(contour.shape) == 3 else contour
        if len(contour_points.shape) != 2:
            continue
        for idx, pt in enumerate(contour_points):
            if idx % max(1, len(contour_points) // max_points + 1) == 0:
                points.append([int(pt[0]), int(pt[1])])
    return points[:max_points]


def _create_overlay_and_mask_images(
    base_img: np.ndarray,
    left_mask: np.ndarray,
    right_mask: np.ndarray,
    model_label: str = "Lungmask AI",
):
    """
    返回 original_image / overlay_image / mask_image / comparison_image
    左肺红色，右肺绿色，半透明叠加
    """
    grayscale = base_img.astype(np.float32)
    min_val = float(np.min(grayscale))
    max_val = float(np.max(grayscale))
    if max_val - min_val < 1e-6:
        norm = np.zeros_like(grayscale, dtype=np.uint8)
    else:
        norm = ((grayscale - min_val) / (max_val - min_val) * 255.0).clip(0, 255).astype(np.uint8)

    rgb = np.stack([norm, norm, norm], axis=-1).astype(np.uint8)
    overlay = rgb.copy()

    left_bool = left_mask > 0
    right_bool = right_mask > 0

    overlay[left_bool] = (overlay[left_bool] * 0.45 + np.array([255, 0, 0]) * 0.55).astype(np.uint8)
    overlay[right_bool] = (overlay[right_bool] * 0.45 + np.array([0, 220, 0]) * 0.55).astype(np.uint8)

    mask_rgb = np.zeros_like(rgb)
    mask_rgb[left_bool] = np.array([255, 0, 0], dtype=np.uint8)
    mask_rgb[right_bool] = np.array([0, 220, 0], dtype=np.uint8)

    original_image = image_to_base64_png(Image.fromarray(rgb))
    overlay_image = image_to_base64_png(Image.fromarray(overlay))
    mask_image = image_to_base64_png(Image.fromarray(mask_rgb))

    fig, axes = plt.subplots(1, 3, figsize=(18, 6), dpi=150)
    axes[0].imshow(norm, cmap='gray')
    axes[0].set_title('原始图像', fontsize=16, fontweight='bold')
    axes[0].axis('off')

    axes[1].imshow(mask_rgb)
    axes[1].set_title('肺部分割掩码', fontsize=16, fontweight='bold')
    axes[1].axis('off')

    axes[2].imshow(overlay)
    axes[2].set_title('分割结果叠加', fontsize=16, fontweight='bold')
    axes[2].axis('off')

    plt.suptitle(f'肺部分割结果 - {model_label}', fontsize=18, fontweight='bold', y=1.02)
    plt.tight_layout()
    comparison_image = array_to_base64_png(fig)

    combined_boundary = ((left_mask > 0) | (right_mask > 0)).astype(np.uint8)
    boundary_points = _mask_to_boundary_points(combined_boundary)

    return original_image, overlay_image, mask_image, comparison_image, boundary_points


def _build_segmentation_response(
    base_image: np.ndarray,
    combined_mask: np.ndarray,
    pixel_spacing_mm: float,
    effective_pixels: int,
    total_pixels: int,
    processing_time: float,
    model_type: str,
    extra_data=None,
    patient_left_on_image_right: bool = True,
    anatomical_mapping_reliable: bool = True,
    model_label: str = "Lungmask AI",
):
    extra_data = extra_data or {}

    left_mask, right_mask, suspected_issue_regions = _extract_left_right_lungs(
        (combined_mask > 0).astype(np.uint8),
        patient_left_on_image_right=patient_left_on_image_right,
        anatomical_mapping_reliable=anatomical_mapping_reliable,
    )
    merged_mask = ((left_mask > 0) | (right_mask > 0)).astype(np.uint8)

    left_lung_pixels = int(np.sum(left_mask > 0))
    right_lung_pixels = int(np.sum(right_mask > 0))
    lung_pixels = int(np.sum(merged_mask > 0))

    crop_warnings, crop_issue_regions, ratio_reliable = _detect_crop_and_offset(merged_mask, left_mask, right_mask)
    suspected_issue_regions = list(dict.fromkeys(suspected_issue_regions + crop_issue_regions))

    raw_left_lung_percentage = round(left_lung_pixels / max(lung_pixels, 1) * 100, 2)
    raw_right_lung_percentage = round(right_lung_pixels / max(lung_pixels, 1) * 100, 2)

    if right_lung_pixels > 0:
        raw_left_right_ratio = round(left_lung_pixels / max(right_lung_pixels, 1), 3)
    else:
        raw_left_right_ratio = None

    left_lung_percentage = raw_left_lung_percentage
    right_lung_percentage = raw_right_lung_percentage
    left_right_ratio = raw_left_right_ratio

    left_lung_status = _get_lung_status("left", left_lung_percentage)
    right_lung_status = _get_lung_status("right", right_lung_percentage)

    if left_lung_status == "abnormal":
        suspected_issue_regions.append("left_lung_ratio_abnormal")
    elif left_lung_status == "warning":
        suspected_issue_regions.append("left_lung_ratio_borderline")

    if right_lung_status == "abnormal":
        suspected_issue_regions.append("right_lung_ratio_abnormal")
    elif right_lung_status == "warning":
        suspected_issue_regions.append("right_lung_ratio_borderline")

    validation = validate_segmentation_result(
        left_area=left_lung_pixels,
        right_area=right_lung_pixels,
        total_lung_area=lung_pixels,
        effective_area=effective_pixels,
        total_pixels=total_pixels,
        pixel_spacing_mm=pixel_spacing_mm,
        ratio_reliable=ratio_reliable,
        crop_warnings=crop_warnings,
    )

    if left_right_ratio is not None and left_right_ratio < 0.50:
        validation["passed"] = False
        if "左肺分割可能不完整，请人工复核" not in validation["warnings"]:
            validation["warnings"].append("左肺分割可能不完整，请人工复核")
        suspected_issue_regions.append("left_lung_undersegmented")
    elif left_right_ratio is not None and left_right_ratio > 1.55:
        validation["passed"] = False
        if "右肺分割可能不完整，请人工复核" not in validation["warnings"]:
            validation["warnings"].append("右肺分割可能不完整，请人工复核")
        suspected_issue_regions.append("right_lung_undersegmented")

    if left_lung_status == "abnormal" and right_lung_status == "abnormal":
        validation["passed"] = False
        if "双肺占比同时明显偏离常见范围，请人工复核" not in validation["warnings"]:
            validation["warnings"].append("双肺占比同时明显偏离常见范围，请人工复核")

    validation["warnings"] = list(dict.fromkeys(validation["warnings"]))
    validation["reason"] = "; ".join(validation["warnings"]) if validation["warnings"] else "校验通过"

    final_confidence = 0.98 if validation["passed"] else max(0.05, validation["confidence"])

    original_image, overlay_image, mask_image, comparison_image, boundary_points = _create_overlay_and_mask_images(
        base_image,
        left_mask,
        right_mask,
        model_label=model_label,
    )

    area_per_pixel = pixel_spacing_mm * pixel_spacing_mm
    lung_percentage = round(lung_pixels / max(effective_pixels, 1) * 100, 2)
    segmentation_summary = _summarize_segmentation_findings(
        lung_percentage=lung_percentage,
        validation=validation,
        suspected_issue_regions=suspected_issue_regions,
        ratio_reliable=ratio_reliable,
        anatomical_mapping_reliable=anatomical_mapping_reliable,
    )

    return {
        "success": True,
        "message": "分割成功",
        "data": {
            **extra_data,
            "original_image": original_image,
            "result_image": overlay_image,
            "overlay_image": overlay_image,
            "mask_image": mask_image,
            "comparison_image": comparison_image,
            "image_format": "png",
            "stats": {
                "lung_area": round(lung_pixels * area_per_pixel, 2),
                "lung_percentage": lung_percentage,
                "left_lung_area": round(left_lung_pixels * area_per_pixel, 2),
                "right_lung_area": round(right_lung_pixels * area_per_pixel, 2),
                "left_lung_percentage": left_lung_percentage,
                "right_lung_percentage": right_lung_percentage,
                "left_right_ratio": left_right_ratio,
                "raw_left_lung_percentage": raw_left_lung_percentage,
                "raw_right_lung_percentage": raw_right_lung_percentage,
                "effective_area_pixels": effective_pixels,
                "pixel_spacing_mm": round(pixel_spacing_mm, 3),
                "confidence": round(final_confidence, 2),
                "validation": {
                    "passed": validation["passed"],
                    "reason": validation["reason"],
                    "warnings": validation["warnings"],
                },
                "summary": segmentation_summary,
                "left_lung_status": left_lung_status,
                "right_lung_status": right_lung_status,
                "ratio_reliable": ratio_reliable,
                "crop_warnings": crop_warnings,
                "patient_left_on_image_right": patient_left_on_image_right,
                "anatomical_mapping_reliable": anatomical_mapping_reliable,
            },
            "suspected_issue_regions": list(dict.fromkeys(suspected_issue_regions)),
            "showable_boundary_points": boundary_points,
            "model_type": model_type,
            "processing_time": round(processing_time, 2),
        }
    }


def _normalize_image_to_patient_orientation(image: sitk.Image, segmentation=None):
    """
    使用 DICOM/ITK 方向矩阵将图像统一到患者坐标系（LPS）。
    这样后续左右肺判断基于稳定的患者左右方向，而不是原始像素排列方向。
    """
    original_direction = tuple(float(v) for v in image.GetDirection())
    original_size = tuple(int(v) for v in image.GetSize())
    dim = image.GetDimension()

    orientation_info = {
        "original_direction": [round(v, 6) for v in original_direction],
        "original_size": list(original_size),
        "normalized": False,
        "orientation_code_before": None,
        "orientation_code_after": None,
        "normalization_error": None,
    }

    try:
        orientation_info["orientation_code_before"] = sitk.DICOMOrientImageFilter.GetOrientationFromDirectionCosines(
            original_direction
        )
    except Exception:
        orientation_info["orientation_code_before"] = "UNKNOWN"

    normalized_image = image
    normalized_segmentation = segmentation

    try:
        orienter = sitk.DICOMOrientImageFilter()
        orienter.SetDesiredCoordinateOrientation("LPS")
        normalized_image = orienter.Execute(image)
        orientation_info["normalized"] = orientation_info["orientation_code_before"] != "LPS"

        try:
            orientation_info["orientation_code_after"] = sitk.DICOMOrientImageFilter.GetOrientationFromDirectionCosines(
                normalized_image.GetDirection()
            )
        except Exception:
            orientation_info["orientation_code_after"] = "UNKNOWN"

        if segmentation is not None:
            if isinstance(segmentation, sitk.Image):
                normalized_segmentation = orienter.Execute(segmentation)
            else:
                seg_img = sitk.GetImageFromArray(np.asarray(segmentation))
                seg_img.CopyInformation(image)
                normalized_segmentation = sitk.GetArrayFromImage(orienter.Execute(seg_img))
    except Exception as exc:
        orientation_info["normalization_error"] = str(exc)
        normalized_image = image
        normalized_segmentation = segmentation
        orientation_info["orientation_code_after"] = orientation_info["orientation_code_before"]

    return normalized_image, normalized_segmentation, orientation_info


def _get_3d_lung_bounds(segmentation: np.ndarray) -> dict:
    """
    从 3D segmentation 中提取肺野 bounding box 和中段信息。
    """
    seg = np.asarray(segmentation)
    if seg.ndim < 3:
        non_zero = np.where(seg > 0)
        if len(non_zero) == 0 or non_zero[0].size == 0:
            return {"has_lung": False}
        return {
            "has_lung": True,
            "z_min": 0,
            "z_max": 0,
            "z_mid": 0,
            "slice_count": 1,
            "bbox": {
                "z": [0, 0],
                "y": [int(non_zero[0].min()), int(non_zero[0].max())],
                "x": [int(non_zero[1].min()), int(non_zero[1].max())],
            },
        }

    non_zero = np.where(seg > 0)
    if len(non_zero) < 3 or non_zero[0].size == 0:
        return {"has_lung": False}

    z_min, z_max = int(non_zero[0].min()), int(non_zero[0].max())
    y_min, y_max = int(non_zero[1].min()), int(non_zero[1].max())
    x_min, x_max = int(non_zero[2].min()), int(non_zero[2].max())
    z_mid = int(round((z_min + z_max) / 2.0))

    return {
        "has_lung": True,
        "z_min": z_min,
        "z_max": z_max,
        "z_mid": z_mid,
        "slice_count": z_max - z_min + 1,
        "bbox": {
            "z": [z_min, z_max],
            "y": [y_min, y_max],
            "x": [x_min, x_max],
        },
    }


def _normalize_ct_slice_for_display(ct_slice: np.ndarray) -> np.ndarray:
    """
    将 CT 切片稳定窗宽窗位到肺窗附近，提升 overlay / mask 可读性。
    优先按 HU 肺窗 [-1000, 400] 截断；若并非标准 HU，则退化为分位数拉伸。
    """
    arr = np.asarray(ct_slice, dtype=np.float32)

    finite_mask = np.isfinite(arr)
    if not np.any(finite_mask):
        return np.zeros_like(arr, dtype=np.uint8)

    finite_values = arr[finite_mask]
    vmin = float(np.min(finite_values))
    vmax = float(np.max(finite_values))

    if vmin < -300 and vmax > 300:
        lower, upper = -1000.0, 400.0
    else:
        lower = float(np.percentile(finite_values, 1))
        upper = float(np.percentile(finite_values, 99))
        if upper - lower < 1e-6:
            upper = lower + 1.0

    clipped = np.clip(arr, lower, upper)
    norm = ((clipped - lower) / (upper - lower) * 255.0).clip(0, 255).astype(np.uint8)
    return norm


def _postprocess_lungmask_slice(seg_slice: np.ndarray) -> np.ndarray:
    """
    对 lungmask 单切片结果做轻量后处理：
    - 保留标签 > 0 的肺野
    - 去掉极小碎片
    - 填补小孔洞
    - 尽量保留左右双肺主区域，避免只取到单个异常大连通域
    """
    import cv2

    binary = (seg_slice > 0).astype(np.uint8)
    if np.sum(binary) == 0:
        return binary

    h, w = binary.shape
    min_area = max(64, int(h * w * 0.0012))

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    components = []
    for label in range(1, num_labels):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        cx = float(centroids[label][0])
        components.append((label, area, cx))

    if not components:
        return np.zeros_like(binary)

    mid_x = w / 2.0
    left_candidates = sorted([item for item in components if item[2] < mid_x], key=lambda item: item[1], reverse=True)
    right_candidates = sorted([item for item in components if item[2] >= mid_x], key=lambda item: item[1], reverse=True)

    keep_labels = set()

    if left_candidates:
        keep_labels.add(left_candidates[0][0])
    if right_candidates:
        keep_labels.add(right_candidates[0][0])

    if len(keep_labels) < 2:
        components.sort(key=lambda item: item[1], reverse=True)
        for label, _, _ in components[:2]:
            keep_labels.add(label)

    primary_mask = np.isin(labels, list(keep_labels)).astype(np.uint8)
    primary_mask = cv2.morphologyEx(
        primary_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
        iterations=2,
    )
    primary_mask = cv2.morphologyEx(
        primary_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
        iterations=1,
    )

    return primary_mask.astype(np.uint8)


def _score_lung_slice(
    seg_slice: np.ndarray,
    patient_left_on_image_right: bool = True,
    anatomical_mapping_reliable: bool = True,
) -> tuple[float, dict]:
    """
    给单层肺部分割结果打分，优先选择：
    - 肺野面积较大
    - 左右双肺都存在
    - 左右肺面积相对均衡
    """
    binary = (seg_slice > 0).astype(np.uint8)
    total_area = int(np.sum(binary))
    if total_area <= 0:
        return -1e9, {"total_area": 0, "left_area": 0, "right_area": 0, "ratio": 0.0, "components_ok": False}

    left_mask, right_mask, _ = _extract_left_right_lungs(
        binary,
        patient_left_on_image_right=patient_left_on_image_right,
        anatomical_mapping_reliable=anatomical_mapping_reliable,
    )
    left_area = int(np.sum(left_mask > 0))
    right_area = int(np.sum(right_mask > 0))
    components_ok = left_area > 0 and right_area > 0

    lr_ratio = left_area / max(right_area, 1) if right_area > 0 else 0.0
    ratio_symmetry = min(lr_ratio, 1.0 / max(lr_ratio, 1e-6)) if lr_ratio > 0 else 0.0

    score = float(total_area)
    if components_ok:
        score += total_area * 0.8
    else:
        score -= total_area * 0.6

    score += total_area * ratio_symmetry * 0.9

    if left_area < total_area * 0.2 or right_area < total_area * 0.2:
        score -= total_area * 0.5

    return score, {
        "total_area": total_area,
        "left_area": left_area,
        "right_area": right_area,
        "ratio": round(lr_ratio, 4) if lr_ratio > 0 else 0.0,
        "components_ok": components_ok,
    }


def _select_best_lung_slice(
    ct_array: np.ndarray,
    segmentation: np.ndarray,
    patient_left_on_image_right: bool = True,
    anatomical_mapping_reliable: bool = True,
) -> tuple[int, list[dict], dict]:
    """
    自动选择展示层：
    1. 基于 3D lung bounding box 的中段作为主锚点
    2. 在中段附近优先选“双肺存在 + 面积较大 + 左右较平衡”的层
    3. 同时返回多候选层，供前端切换
    """
    total_slices = int(ct_array.shape[0])
    if total_slices <= 1:
        return 0, [{"slice_index": 0, "kind": "best", "label": "自动评分最佳层"}], {
            "method": "single_slice",
            "bounding_box": {"z": [0, 0]},
            "z_mid": 0,
        }

    lung_areas = [int(np.sum(segmentation[idx] > 0)) for idx in range(total_slices)]
    non_zero_indices = [idx for idx, area in enumerate(lung_areas) if area > 0]

    if not non_zero_indices:
        fallback_idx = total_slices // 2
        candidates = [{"slice_index": int(fallback_idx), "kind": "best", "label": "自动评分最佳层"}]
        return fallback_idx, candidates, {
            "method": "no_lung_detected_fallback",
            "bounding_box": None,
            "z_mid": fallback_idx,
        }

    bounds = _get_3d_lung_bounds(segmentation)
    z_mid = int(bounds.get("z_mid", int(round((non_zero_indices[0] + non_zero_indices[-1]) / 2.0))))
    z_min = int(bounds.get("z_min", non_zero_indices[0]))
    z_max = int(bounds.get("z_max", non_zero_indices[-1]))

    max_area = max(lung_areas[idx] for idx in non_zero_indices)
    area_threshold = max(32, int(max_area * 0.40))
    candidate_indices = [idx for idx in non_zero_indices if lung_areas[idx] >= area_threshold]
    if not candidate_indices:
        candidate_indices = non_zero_indices

    search_radius = max(2, int(math.ceil((z_max - z_min + 1) * 0.12)))
    focused_indices = [idx for idx in candidate_indices if abs(idx - z_mid) <= search_radius]
    if not focused_indices:
        focused_indices = candidate_indices

    best_idx = focused_indices[0]
    best_score = None
    candidate_debug = []

    for idx in focused_indices:
        seg_slice = _postprocess_lungmask_slice(segmentation[idx])
        slice_score, slice_meta = _score_lung_slice(
            seg_slice,
            patient_left_on_image_right=patient_left_on_image_right,
            anatomical_mapping_reliable=anatomical_mapping_reliable,
        )

        distance_penalty = abs(idx - z_mid) / max((z_max - z_min + 1), 1)
        area_bonus = (lung_areas[idx] / max(max_area, 1)) * max_area * 0.45
        final_score = slice_score + area_bonus - lung_areas[idx] * distance_penalty * 0.22

        candidate_debug.append({
            "slice_index": int(idx),
            "score": round(float(final_score), 2),
            "total_area": int(slice_meta["total_area"]),
            "left_area": int(slice_meta["left_area"]),
            "right_area": int(slice_meta["right_area"]),
            "ratio": slice_meta["ratio"],
            "components_ok": bool(slice_meta["components_ok"]),
            "distance_to_mid": int(abs(idx - z_mid)),
        })

        logger.info(
            f"🫁 候选切片 idx={idx}, area={slice_meta['total_area']}, "
            f"left={slice_meta['left_area']}, right={slice_meta['right_area']}, "
            f"ratio={slice_meta['ratio']}, components_ok={slice_meta['components_ok']}, "
            f"mid={z_mid}, final_score={final_score:.2f}"
        )

        if best_score is None or final_score > best_score:
            best_idx = idx
            best_score = final_score

    max_area_idx = max(non_zero_indices, key=lambda idx: lung_areas[idx])
    candidate_order = []
    for idx, kind, label in [
        (best_idx, "best", "自动评分最佳层"),
        (max(best_idx - 1, z_min), "previous", "上一层"),
        (min(best_idx + 1, z_max), "next", "下一层"),
        (z_mid, "middle", "3D中段层"),
        (max_area_idx, "max_area", "最大肺面积层"),
    ]:
        if idx not in candidate_order:
            candidate_order.append(idx)

    candidate_map = {item["slice_index"]: item for item in candidate_debug}
    candidates = []
    for idx in candidate_order:
        debug_meta = candidate_map.get(idx)
        candidates.append({
            "slice_index": int(idx),
            "kind": next(kind for candidate_idx, kind, _ in [
                (best_idx, "best", "自动评分最佳层"),
                (max(best_idx - 1, z_min), "previous", "上一层"),
                (min(best_idx + 1, z_max), "next", "下一层"),
                (z_mid, "middle", "3D中段层"),
                (max_area_idx, "max_area", "最大肺面积层"),
            ] if candidate_idx == idx),
            "label": next(label for candidate_idx, _, label in [
                (best_idx, "best", "自动评分最佳层"),
                (max(best_idx - 1, z_min), "previous", "上一层"),
                (min(best_idx + 1, z_max), "next", "下一层"),
                (z_mid, "middle", "3D中段层"),
                (max_area_idx, "max_area", "最大肺面积层"),
            ] if candidate_idx == idx),
            "area": int(lung_areas[idx]),
            "is_selected": bool(idx == best_idx),
            "score": debug_meta["score"] if debug_meta else None,
            "distance_to_mid": debug_meta["distance_to_mid"] if debug_meta else int(abs(idx - z_mid)),
        })

    selection_meta = {
        "method": "3d_bbox_mid_with_multicandidate",
        "bounding_box": bounds.get("bbox") if bounds.get("has_lung") else None,
        "z_mid": int(z_mid),
        "z_range": [int(z_min), int(z_max)],
        "search_radius": int(search_radius),
        "candidate_debug": candidate_debug,
    }

    logger.info(f"✅ 自动选取最佳肺部切片: idx={best_idx}, best_score={best_score:.2f}, z_mid={z_mid}")
    return int(best_idx), candidates, selection_meta


def _build_dicom_segmentation_response(
    image,
    ct_array: np.ndarray,
    segmentation: np.ndarray,
    requested_slice_index: int | None,
    start_time: float,
    model_type: str,
    orientation_info=None,
):
    spacing = image.GetSpacing()
    pixel_spacing_mm = (spacing[0] + spacing[1]) / 2.0
    logger.info(f"📏 像素间距：X={spacing[0]:.3f}mm, Y={spacing[1]:.3f}mm, 平均={pixel_spacing_mm:.3f}mm")

    candidate_slices = []
    selection_meta = {}
    patient_left_on_image_right = True
    anatomical_mapping_reliable = True

    if requested_slice_index is None:
        slice_idx, candidate_slices, selection_meta = _select_best_lung_slice(
            ct_array,
            segmentation,
            patient_left_on_image_right=patient_left_on_image_right,
            anatomical_mapping_reliable=anatomical_mapping_reliable,
        )
    else:
        slice_idx = min(max(0, requested_slice_index), ct_array.shape[0] - 1)
        candidate_slices = [{
            "slice_index": int(slice_idx),
            "kind": "manual",
            "label": "手动指定层",
            "area": int(np.sum(segmentation[slice_idx] > 0)),
            "is_selected": True,
        }]
        selection_meta = {
            "method": "manual_slice_index",
            "bounding_box": _get_3d_lung_bounds(segmentation).get("bbox"),
            "z_mid": int(slice_idx),
        }

    ct_slice = ct_array[slice_idx]
    display_slice = _normalize_ct_slice_for_display(ct_slice)
    seg_slice = _postprocess_lungmask_slice(segmentation[slice_idx])

    total_pixels = seg_slice.shape[0] * seg_slice.shape[1]
    effective_mask_arr = _estimate_effective_ct_area(display_slice)
    effective_pixels = int(np.sum(effective_mask_arr > 0))
    if effective_pixels <= 0:
        effective_pixels = int(np.sum(display_slice > np.percentile(display_slice, 3)))

    processing_time = time.time() - start_time
    return _build_segmentation_response(
        base_image=display_slice,
        combined_mask=seg_slice,
        pixel_spacing_mm=pixel_spacing_mm,
        effective_pixels=effective_pixels,
        total_pixels=total_pixels,
        processing_time=processing_time,
        model_type=model_type,
        extra_data={
            "slice_index": slice_idx,
            "total_slices": ct_array.shape[0],
            "selected_by": "auto_best_lung_slice" if requested_slice_index is None else "manual_slice_index",
            "candidate_slices": candidate_slices,
            "selection_meta": selection_meta,
            "orientation_info": orientation_info or {},
        },
        patient_left_on_image_right=patient_left_on_image_right,
        anatomical_mapping_reliable=anatomical_mapping_reliable,
    )


@router.post("/dicom")
async def segment_dicom(
  file: UploadFile = File(..., description="上传的 DICOM 文件（.dcm）"),
  slice_index: int = Form(None, description="指定切片索引，默认为中间切片")
):
    """
    接收 DICOM 文件，使用 lungmask 进行专业分割
    返回三列对比图：原始 CT + 分割掩码 + 叠加结果
    """
    if not LUNGMASK_AVAILABLE or inferer is None:
        raise HTTPException(status_code=503, detail="lungmask 模型未加载")

    start_time = time.time()
    logger.info("📥 收到 DICOM 分割请求")

    with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        image = sitk.ReadImage(tmp_path)

        logger.info("🤖 使用 lungmask 进行分割...")
        segmentation = inferer.apply(image)

        image, segmentation, orientation_info = _normalize_image_to_patient_orientation(image, segmentation)
        ct_array = sitk.GetArrayFromImage(image)
        if isinstance(segmentation, sitk.Image):
            segmentation = sitk.GetArrayFromImage(segmentation)
        segmentation = np.asarray(segmentation)

        response = _build_dicom_segmentation_response(
            image=image,
            ct_array=ct_array,
            segmentation=segmentation,
            requested_slice_index=slice_index,
            start_time=start_time,
            model_type="lungmask",
            orientation_info=orientation_info,
        )

        logger.info(
            f"✅ DICOM 分割完成，耗时：{response['data']['processing_time']:.2f}s，"
            f"校验：{response['data']['stats']['validation']['reason']}"
        )
        return JSONResponse(response)

    except Exception as e:
        logger.error(f"❌ 分割失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"分割失败：{str(e)}")

    finally:
        os.unlink(tmp_path)


@router.post("/dicom-series")
async def segment_dicom_series(
    files: List[UploadFile] = File(..., description="上传的 DICOM 序列文件列表"),
    slice_index: int = Form(None, description="指定切片索引，默认为中间切片")
):
    """
    接收多个 DICOM 文件（来自同一序列），按 2D 切片方式选取一层展示并分割
    """
    if not LUNGMASK_AVAILABLE or inferer is None:
        raise HTTPException(status_code=503, detail="lungmask 模型未加载")

    if not files:
        raise HTTPException(status_code=400, detail="未上传 DICOM 序列文件")

    start_time = time.time()
    logger.info(f"📥 收到 DICOM 序列分割请求，共 {len(files)} 个文件")

    temp_dir = tempfile.mkdtemp(prefix="dicom_series_")
    saved_paths = []

    try:
        for index, upload in enumerate(files):
            filename = upload.filename or f"slice_{index:04d}.dcm"
            safe_name = os.path.basename(filename)
            if not safe_name.lower().endswith((".dcm", ".dicom")):
                continue

            target_path = os.path.join(temp_dir, safe_name)
            content = await upload.read()
            with open(target_path, "wb") as output_file:
                output_file.write(content)
            saved_paths.append(target_path)

        if not saved_paths:
            raise HTTPException(status_code=400, detail="未检测到有效的 DICOM 文件")

        reader = sitk.ImageSeriesReader()
        try:
            series_ids = reader.GetGDCMSeriesIDs(temp_dir)
        except Exception:
            series_ids = None

        if series_ids:
            selected_series_id = max(
                series_ids,
                key=lambda sid: len(reader.GetGDCMSeriesFileNames(temp_dir, sid))
            )
            dicom_names = reader.GetGDCMSeriesFileNames(temp_dir, selected_series_id)
            logger.info(f"📚 检测到 {len(series_ids)} 个 Series，选择文件数最多的 Series：{selected_series_id}，共 {len(dicom_names)} 张")
            reader.SetFileNames(dicom_names)
            image = reader.Execute()
        else:
            try:
                image = sitk.ReadImage(saved_paths)
            except Exception as series_error:
                logger.warning(f"⚠️ DICOM 序列读取失败，尝试退化为单文件模式：{series_error}")
                image = sitk.ReadImage(saved_paths[0])

        ct_array = sitk.GetArrayFromImage(image)
        if ct_array.ndim == 2:
            ct_array = np.expand_dims(ct_array, axis=0)
            image = sitk.JoinSeries([image])

        logger.info("🤖 使用 lungmask 进行 DICOM 序列分割...")
        segmentation = inferer.apply(image)
        if segmentation.ndim == 2:
            segmentation = np.expand_dims(segmentation, axis=0)

        image, segmentation, orientation_info = _normalize_image_to_patient_orientation(image, segmentation)
        ct_array = sitk.GetArrayFromImage(image)
        if isinstance(segmentation, sitk.Image):
            segmentation = sitk.GetArrayFromImage(segmentation)
        segmentation = np.asarray(segmentation)

        response = _build_dicom_segmentation_response(
            image=image,
            ct_array=ct_array,
            segmentation=segmentation,
            requested_slice_index=slice_index,
            start_time=start_time,
            model_type="lungmask-dicom-series",
            orientation_info=orientation_info,
        )

        logger.info(
            f"✅ DICOM 序列分割完成，耗时：{response['data']['processing_time']:.2f}s，"
            f"校验：{response['data']['stats']['validation']['reason']}"
        )
        return JSONResponse(response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ DICOM 序列分割失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"DICOM 序列分割失败：{str(e)}")

    finally:
        for path in saved_paths:
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception:
                pass
        try:
            if os.path.exists(temp_dir):
                os.rmdir(temp_dir)
        except Exception:
            pass


@router.post("/image")
async def segment_image(
    file: UploadFile = File(..., description="上传的 PNG/JPG 图像"),
    enhance_contrast: bool = Form(True, description="是否增强对比度")
):
    """
    接收普通图片（PNG/JPG），使用 lungmask 或后备算法分割
    注意：lungmask 主要针对 CT 图像优化，对普通图像使用后备算法
    """
    start_time = time.time()
    logger.info("📥 收到图像分割请求")

    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content)).convert('L')
        img_array = np.array(img)

        import cv2

        if enhance_contrast:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            img_array = clahe.apply(img_array)

        precheck = _precheck_input_image(img_array)

        ct_roi, offset_x, offset_y = _detect_ct_region(img_array)
        target_array = ct_roi if ct_roi is not None else img_array

        seg_mask_uint8 = _segment_ct_body(target_array)
        body_mask_target = _create_body_region_mask(target_array)

        if np.sum(seg_mask_uint8 > 0) == 0:
            from skimage.filters import threshold_otsu

            effective_mask = _estimate_effective_ct_area(target_array)
            analysis_mask = cv2.bitwise_and(effective_mask, body_mask_target)
            if np.sum(analysis_mask) == 0:
                analysis_mask = effective_mask
            masked_array = target_array.copy()
            masked_array[analysis_mask == 0] = 255

            img_norm = (masked_array - masked_array.min()) / (masked_array.max() - masked_array.min() + 1e-8)
            thresh = threshold_otsu(img_norm[effective_mask > 0]) if np.any(effective_mask > 0) else threshold_otsu(img_norm)

            fallback_mask = np.where((img_norm < thresh) & (analysis_mask > 0), 255, 0).astype(np.uint8)

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            seg_mask_uint8 = cv2.morphologyEx(fallback_mask, cv2.MORPH_OPEN, kernel, iterations=2)
            seg_mask_uint8 = cv2.morphologyEx(seg_mask_uint8, cv2.MORPH_CLOSE, kernel, iterations=2)

            eh, ew = seg_mask_uint8.shape
            margin_x = max(4, int(ew * 0.03))
            margin_y = max(4, int(eh * 0.03))
            seg_mask_uint8[:margin_y, :] = 0
            seg_mask_uint8[eh - margin_y:, :] = 0
            seg_mask_uint8[:, :margin_x] = 0
            seg_mask_uint8[:, ew - margin_x:] = 0

            contours, _ = cv2.findContours(seg_mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if len(contours) > 0:
                min_area = eh * ew * 0.005
                contours = [c for c in contours if cv2.contourArea(c) >= min_area]
                contours = sorted(contours, key=cv2.contourArea, reverse=True)[:4]
                lung_mask = np.zeros_like(seg_mask_uint8)
                cv2.drawContours(lung_mask, contours, -1, 255, -1)
                seg_mask_uint8 = cv2.bitwise_and(lung_mask, analysis_mask)
                seg_mask_uint8 = cv2.bitwise_and(seg_mask_uint8, body_mask_target)

        effective_mask_target = _estimate_effective_ct_area(target_array)
        analysis_mask_target = cv2.bitwise_and(effective_mask_target, body_mask_target)
        if np.sum(analysis_mask_target) == 0:
            analysis_mask_target = effective_mask_target
        effective_pixels = int(np.sum(analysis_mask_target > 0))

        if ct_roi is not None:
            full_mask = np.zeros_like(img_array, dtype=np.uint8)
            roi_h, roi_w = seg_mask_uint8.shape
            full_mask[offset_y:offset_y + roi_h, offset_x:offset_x + roi_w] = seg_mask_uint8
            seg_mask_uint8 = full_mask

            full_effective = np.zeros_like(img_array, dtype=np.uint8)
            eff_h, eff_w = analysis_mask_target.shape
            full_effective[offset_y:offset_y + eff_h, offset_x:offset_x + eff_w] = analysis_mask_target
            effective_pixels = int(np.sum(full_effective > 0))
        else:
            full_analysis_mask = cv2.bitwise_and(_estimate_effective_ct_area(img_array), _create_body_region_mask(img_array))
            if np.sum(full_analysis_mask) == 0:
                full_analysis_mask = _estimate_effective_ct_area(img_array)
            effective_pixels = int(np.sum(full_analysis_mask > 0))

        total_pixels = img_array.shape[0] * img_array.shape[1]
        estimated_pixel_spacing = 350.0 / img_array.shape[1]
        processing_time = time.time() - start_time

        response = _build_segmentation_response(
            base_image=img_array,
            combined_mask=(seg_mask_uint8 > 0).astype(np.uint8),
            pixel_spacing_mm=estimated_pixel_spacing,
            effective_pixels=effective_pixels,
            total_pixels=total_pixels,
            processing_time=processing_time,
            model_type="otsu+fallback",
            extra_data={
                "input_precheck": precheck,
            },
            patient_left_on_image_right=True,
            anatomical_mapping_reliable=False,
        )

        response["data"]["input_precheck"] = precheck
        summary = response["data"]["stats"].get("summary", {})
        if (not precheck.get("passed", True)) and summary.get("severity") == "info":
            summary["severity"] = "warning"
            summary["summary"] = "输入图像疑似不是标准胸部CT，结果仅供参考"
            summary["reasons"] = list(dict.fromkeys(precheck.get("warnings", []) + summary.get("reasons", [])))
            if "请优先上传完整的胸部CT图像或原始DICOM序列" not in summary.get("suggestions", []):
                summary["suggestions"] = list(dict.fromkeys(summary.get("suggestions", []) + ["请优先上传完整的胸部CT图像或原始DICOM序列"]))

        logger.info(
            f"✅ 图像分割完成，耗时：{processing_time:.2f}s，"
            f"校验：{response['data']['stats']['validation']['reason']}"
        )

        return JSONResponse(response)

    except Exception as e:
        logger.error(f"❌ 分割失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"分割失败：{str(e)}")


@router.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "model": "lungmask" if LUNGMASK_AVAILABLE else "fallback",
        "lungmask_available": LUNGMASK_AVAILABLE
    }
