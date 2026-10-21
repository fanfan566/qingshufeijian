"""
基于 lungmask 的肺部分割 API
支持 DICOM 和 PNG/JPG 格式图像
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-GUI environment
import matplotlib.pyplot as plt
import io
import base64
import tempfile
import os
from PIL import Image
import SimpleITK as sitk
from loguru import logger
import time

# Try to import lungmask
try:
    from lungmask import LMInferer
    LUNGMASK_AVAILABLE = True
    logger.info("✅ lungmask module available")
    inferer = None
    logger.info("ℹ️ lungmask model will load on first request")
except ImportError as e:
    LUNGMASK_AVAILABLE = False
    logger.warning(f"⚠️ lungmask unavailable: {e}, will use fallback algorithm")
    inferer = None

router = APIRouter()


def _validate_segmentation(
    left_px: int, right_px: int, lung_px: int, body_px: int, total_px: int
) -> dict:
    """
    Strict anatomical validation. Returns {passed: bool, reason: str, confidence: float, warnings: list}
    All checks use pixel counts (not mm²) since pixel_spacing may be inaccurate for screenshots.
    """
    warnings = []
    confidence = 0.95
    eps = 1e-8

    if lung_px == 0:
        return {"passed": False, "reason": "未检测到任何肺部区域", "confidence": 0.0, "warnings": ["肺区域为空"]}

    # Check 1: lung-to-body ratio (lung should be 20-50% of body cross-section)
    if body_px > 0:
        lung_body_ratio = lung_px / body_px
        if lung_body_ratio < 0.12:
            warnings.append(f"肺部仅占身体 {lung_body_ratio:.1%}（过低，可能未正确分割）")
            confidence -= 0.30
        elif lung_body_ratio > 0.60:
            warnings.append(f"肺部占身体 {lung_body_ratio:.1%}（过高，可能包含了非肺组织）")
            confidence -= 0.25
        # This is the KEY metric - it catches the 23.5% of total image that was 60%+ of body issue
    else:
        warnings.append("无法估算身体区域")
        confidence -= 0.15

    # Check 2: left/right ratio (right lung should be >= left, ratio 0.7-1.15)
    if left_px > 0 and right_px > 0:
        lr = left_px / right_px
        if lr > 1.25:
            warnings.append(f"左肺显著大于右肺 (左:右={lr:.2f}:1，正常应 ≤1.15:1)")
            confidence -= 0.30
        elif lr < 0.70:
            warnings.append(f"右肺显著大于左肺 (左:右={lr:.2f}:1，正常应 ≥0.70:1)")
            confidence -= 0.25

    # Check 3: lung-to-total ratio (in a properly cropped CT, lungs ~15-35% of image)
    if total_px > 0:
        lung_total = lung_px / total_px
        if lung_total < 0.05:
            warnings.append(f"肺部仅占图像 {lung_total:.1%}（异常低）")
            confidence -= 0.20
        elif lung_total > 0.50:
            warnings.append(f"肺部占图像 {lung_total:.1%}（异常高，可能分割过度）")
            confidence -= 0.20

    # Check 4: each lung should have reasonable minimum size
    if total_px > 0:
        min_reasonable = total_px * 0.03  # each lung should be at least 3% of image
        if left_px < min_reasonable and left_px > 0:
            warnings.append(f"左肺过小（{left_px} 像素）")
            confidence -= 0.15
        if right_px < min_reasonable and right_px > 0:
            warnings.append(f"右肺过小（{right_px} 像素）")
            confidence -= 0.15

    # ≥3 warnings → fail
    if len(warnings) >= 2:
        confidence = max(0.0, confidence - 0.25)

    passed = confidence >= 0.40 and len(warnings) <= 1
    if not passed and not warnings:
        warnings.append("综合评分过低")

    return {
        "passed": passed,
        "reason": "; ".join(warnings) if warnings else "校验通过",
        "confidence": max(0.0, round(confidence, 2)),
        "warnings": warnings,
    }


def _extract_ct_roi(img_uint8: np.ndarray) -> tuple:
    """
    For screenshots: detect and extract the actual CT scan region.
    Screenshots contain UI chrome, dark backgrounds, text.
    The CT scan appears as a bright-ish rounded/circular region.
    Returns (roi_array, offset_x, offset_y) or (None, 0, 0) on failure.
    """
    import cv2
    h, w = img_uint8.shape

    # Step 1: Threshold to find bright regions (the CT scan is brighter than UI background)
    _, binary = cv2.threshold(img_uint8, 40, 255, cv2.THRESH_BINARY)

    # Step 2: Morphological operations to connect the CT region
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=4)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=2)

    # Step 3: Find contours, look for the largest one that's roughly central and substantial
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, 0, 0

    # Filter: need a substantial region (at least 15% of image)
    min_area = h * w * 0.10
    candidates = [(i, cv2.contourArea(c)) for i, c in enumerate(contours) if cv2.contourArea(c) > min_area]

    if not candidates:
        # Try lower threshold
        _, binary2 = cv2.threshold(img_uint8, 20, 255, cv2.THRESH_BINARY)
        binary2 = cv2.morphologyEx(binary2, cv2.MORPH_CLOSE, kernel, iterations=4)
        contours2, _ = cv2.findContours(binary2, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates2 = [(i, cv2.contourArea(c)) for i, c in enumerate(contours2) if cv2.contourArea(c) > min_area]
        if not candidates2:
            return None, 0, 0
        candidates = candidates2

    # Take the largest candidate
    best_idx = max(candidates, key=lambda x: x[1])[0]
    best_contour = contours[best_idx] if best_idx < len(contours) else contours2[best_idx]

    x, y, bw, bh = cv2.boundingRect(best_contour)

    # Sanity: the ROI should be substantial
    if bw * bh < h * w * 0.10:
        return None, 0, 0

    # Extract ROI
    roi = img_uint8[y:y+bh, x:x+bw]
    return roi, x, y


def _segment_ct_slice(ct_gray: np.ndarray) -> np.ndarray:
    """
    Segment lungs from a properly cropped CT slice (grayscale, 0-255).
    Assumes: lungs are the darkest substantial regions within the body cross-section.
    """
    import cv2

    h, w = ct_gray.shape

    # Step 1: Find the body cross-section
    # Body tissue is brighter than lungs. Threshold at a low value to get everything except lungs.
    _, body_thresh = cv2.threshold(ct_gray, 30, 255, cv2.THRESH_BINARY)
    body_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    body_thresh = cv2.morphologyEx(body_thresh, cv2.MORPH_CLOSE, body_kernel, iterations=4)
    body_thresh = cv2.morphologyEx(body_thresh, cv2.MORPH_OPEN, body_kernel, iterations=2)

    # Get largest contour as body
    body_contours, _ = cv2.findContours(body_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not body_contours:
        return np.zeros((h, w), dtype=np.uint8)

    body_contour = max(body_contours, key=cv2.contourArea)
    body_area_px = cv2.contourArea(body_contour)

    if body_area_px < h * w * 0.05:
        return np.zeros((h, w), dtype=np.uint8)

    body_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(body_mask, [body_contour], -1, 255, -1)

    # Step 2: Within the body, find low-density (dark) regions = lungs
    # Use Otsu on body region only
    body_pixels = ct_gray[body_mask > 0]
    if len(body_pixels) == 0:
        return np.zeros((h, w), dtype=np.uint8)

    body_mean = body_pixels.mean()
    body_std = body_pixels.std()

    # Lungs are significantly darker than body mean
    # Use mean - 1.0*std as threshold (lungs are typically 1+ std below mean)
    lung_thresh_val = max(0, int(body_mean - 0.8 * body_std))

    # Also try Otsu within body for robustness
    body_roi = ct_gray.copy()
    body_roi[body_mask == 0] = 255  # set outside body to white so Otsu focuses on body
    _, otsu_val = cv2.threshold(body_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Use the HIGHER of the two thresholds (more conservative = less false positive)
    final_thresh = max(lung_thresh_val, int(otsu_val))
    final_thresh = min(final_thresh, int(body_mean - 0.5 * body_std))  # cap it
    final_thresh = max(final_thresh, 10)  # floor

    _, lung_mask = cv2.threshold(ct_gray, final_thresh, 255, cv2.THRESH_BINARY)
    lung_mask = cv2.bitwise_and(lung_mask, lung_mask, mask=body_mask)

    # Step 3: Morphological cleanup
    morph_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    lung_mask = cv2.morphologyEx(lung_mask, cv2.MORPH_OPEN, morph_kernel, iterations=2)
    lung_mask = cv2.morphologyEx(lung_mask, cv2.MORPH_CLOSE, morph_kernel, iterations=3)

    # Step 4: Separate left and right lungs
    all_contours, _ = cv2.findContours(lung_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not all_contours:
        return np.zeros((h, w), dtype=np.uint8)

    # Filter small noise
    all_contours = sorted(all_contours, key=cv2.contourArea, reverse=True)
    max_c_area = cv2.contourArea(all_contours[0])
    valid = [c for c in all_contours if cv2.contourArea(c) > max_c_area * 0.03]

    if not valid:
        return np.zeros((h, w), dtype=np.uint8)

    # Split by midline
    mid_x = w // 2
    left_c = [c for c in valid if cv2.boundingRect(c)[0] + cv2.boundingRect(c)[2] // 2 < mid_x]
    right_c = [c for c in valid if cv2.boundingRect(c)[0] + cv2.boundingRect(c)[2] // 2 >= mid_x]

    left_mask = np.zeros((h, w), dtype=np.uint8)
    right_mask = np.zeros((h, w), dtype=np.uint8)

    if left_c:
        cv2.drawContours(left_mask, left_c, -1, 255, -1)
    if right_c:
        cv2.drawContours(right_mask, right_c, -1, 255, -1)

    # If one side is empty, split the combined region
    if not left_c and right_c:
        combined = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(combined, valid, -1, 255, -1)
        left_mask = combined.copy()
        left_mask[:, mid_x:] = 0
        right_mask = combined.copy()
        right_mask[:, :mid_x] = 0
    elif left_c and not right_c:
        combined = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(combined, valid, -1, 255, -1)
        right_mask = combined.copy()
        right_mask[:, :mid_x] = 0
        left_mask = combined.copy()
        left_mask[:, mid_x:] = 0

    # Merge
    result = cv2.bitwise_or(left_mask, right_mask)

    # Final cleanup
    result = cv2.morphologyEx(result, cv2.MORPH_OPEN, morph_kernel, iterations=1)

    return result


def _array_to_base64(fig) -> str:
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


def fallback_segmentation(image_array: np.ndarray) -> np.ndarray:
    """
    Fallback segmentation for when lungmask is unavailable.
    Handles both cropped CT slices and raw screenshots.
    """
    import cv2

    # Ensure grayscale
    if len(image_array.shape) == 3:
        if image_array.shape[2] == 3:
            image_array = np.mean(image_array, axis=2)
        elif image_array.shape[2] == 4:
            image_array = np.mean(image_array[:, :, :3], axis=2)

    h, w = image_array.shape

    # Normalize to 0-255
    img_min, img_max = float(image_array.min()), float(image_array.max())
    if img_max - img_min < 1e-8:
        return np.zeros((h, w), dtype=np.uint8)

    img_uint8 = np.clip((image_array - img_min) / (img_max - img_min) * 255, 0, 255).astype(np.uint8)

    # Detect if this is a screenshot (has large dark margins) vs a cropped CT
    # Check corners: if corners are very dark, it's likely a screenshot with dark background
    corner_size = min(h, w) // 10
    corners = np.concatenate([
        img_uint8[:corner_size, :corner_size].flatten(),
        img_uint8[:corner_size, -corner_size:].flatten(),
        img_uint8[-corner_size:, :corner_size].flatten(),
        img_uint8[-corner_size:, -corner_size:].flatten(),
    ])
    corner_mean = corners.mean()

    is_screenshot = corner_mean < 25  # dark corners = screenshot

    if is_screenshot:
        logger.info("📸 检测到截图格式，尝试提取CT区域...")
        roi, ox, oy = _extract_ct_roi(img_uint8)
        if roi is not None:
            logger.info(f"  提取到CT区域: {roi.shape}, 偏移=({ox}, {oy})")
            seg_roi = _segment_ct_slice(roi)
            # Map back to full image
            full_mask = np.zeros((h, w), dtype=np.uint8)
            full_mask[oy:oy+seg_roi.shape[0], ox:ox+seg_roi.shape[1]] = seg_roi
            return full_mask
        else:
            logger.warning("  未能提取CT区域，回退到全图分割")

    # For cropped CT or failed screenshot extraction: segment the full image
    return _segment_ct_slice(img_uint8)


@router.post("/dicom")
async def segment_dicom(
    file: UploadFile = File(..., description="上传的 DICOM 文件（.dcm）"),
    slice_index: int = Form(None, description="指定切片索引，默认为中间切片")
):
    """Receive DICOM file, return segmentation result."""
    start_time = time.time()
    logger.info(f"📥 Received DICOM segmentation request")
    await file.seek(0)

    with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        image = sitk.ReadImage(tmp_path)
        ct_array = sitk.GetArrayFromImage(image)
        logger.info(f"📊 DICOM shape: {ct_array.shape}")

        spacing = image.GetSpacing()
        pixel_spacing_mm = (spacing[0] + spacing[1]) / 2.0
        logger.info(f"📏 Pixel spacing: avg={pixel_spacing_mm:.3f}mm")

        slice_idx = ct_array.shape[0] // 2 if slice_index is None else min(max(0, slice_index), ct_array.shape[0] - 1)
        ct_slice = ct_array[slice_idx]

        # Execute segmentation
        if LUNGMASK_AVAILABLE:
            global inferer
            if inferer is None:
                logger.info(" Loading lungmask model on first request...")
                try:
                    inferer = LMInferer()
                    logger.info("✅ lungmask model loaded")
                except Exception as e:
                    logger.warning(f"⚠️ lungmask load failed: {e}, using fallback")
                    LUNGMASK_AVAILABLE = False

            if inferer is not None:
                logger.info("🤖 Using lungmask for segmentation")
                segmentation = inferer.apply(image)
                seg_slice = segmentation[slice_idx]
                model_type = "lungmask"
            else:
                logger.info("🎭 Using fallback segmentation")
                seg_slice = fallback_segmentation(ct_slice)
                model_type = "fallback"
        else:
            logger.info("🎭 Using fallback segmentation")
            seg_slice = fallback_segmentation(ct_slice)
            model_type = "fallback"

        # Generate comparison image
        fig, axes = plt.subplots(1, 3, figsize=(15, 5), dpi=100)
        vmin, vmax = np.percentile(ct_slice, 5), np.percentile(ct_slice, 95)
        axes[0].imshow(ct_slice, cmap='gray', vmin=vmin, vmax=vmax)
        axes[0].set_title('原始 CT')
        axes[0].axis('off')
        axes[1].imshow(seg_slice, cmap='jet')
        axes[1].set_title('分割掩码')
        axes[1].axis('off')
        axes[2].imshow(ct_slice, cmap='gray', vmin=vmin, vmax=vmax)
        axes[2].imshow(seg_slice, cmap='jet', alpha=0.4)
        axes[2].set_title('叠加结果')
        axes[2].axis('off')
        plt.suptitle('肺部图像分割结果', fontsize=16)
        plt.tight_layout()
        img_base64 = _array_to_base64(fig)

        # Statistics
        lung_px = int(np.sum(seg_slice > 0))
        total_px = seg_slice.shape[0] * seg_slice.shape[1]
        width = seg_slice.shape[1]
        left_px = int(np.sum(seg_slice[:, :width//2] > 0))
        right_px = int(np.sum(seg_slice[:, width//2:] > 0))
        body_px = int(np.sum((ct_slice > np.percentile(ct_slice, 5)).astype(np.uint8)))

        # Validate
        val = _validate_segmentation(left_px, right_px, lung_px, body_px, total_px)

        area_per_pixel = pixel_spacing_mm * pixel_spacing_mm
        lung_pct = round(lung_px / total_px * 100, 2) if total_px > 0 else 0
        processing_time = round(time.time() - start_time, 2)

        if model_type == "lungmask":
            final_confidence = 0.98 if val["passed"] else max(0.10, val["confidence"])
        else:
            final_confidence = val["confidence"] if val["passed"] else max(0.05, val["confidence"] * 0.3)

        if not val["passed"]:
            logger.warning(f"⚠️ Segmentation FAILED validation: {val['reason']}")

        logger.info(f"✅ DICOM segmentation done in {processing_time}s, validation: {val['reason']}")

        return JSONResponse({
            "success": True,
            "message": "分割成功",
            "data": {
                "slice_index": slice_idx,
                "total_slices": ct_array.shape[0],
                "result_image": img_base64,
                "image_format": "data:image/png;base64",
                "stats": {
                    "lung_area": round(lung_px * area_per_pixel, 2),
                    "lung_percentage": lung_pct,
                    "left_lung_area": round(left_px * area_per_pixel, 2),
                    "right_lung_area": round(right_px * area_per_pixel, 2),
                    "pixel_spacing_mm": round(pixel_spacing_mm, 3),
                    "confidence": round(final_confidence, 2),
                    "validation": val,
                },
                "model_type": model_type,
                "processing_time": processing_time,
            },
        })
    except Exception as e:
        logger.error(f"❌ DICOM segmentation failed: {e}")
        raise HTTPException(status_code=500, detail=f"分割失败：{str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/image")
async def segment_image(
    file: UploadFile = File(..., description="上传的 PNG/JPG 图像"),
    enhance_contrast: bool = Form(True, description="是否增强对比度")
):
    """Receive PNG/JPG image, return segmentation result."""
    start_time = time.time()
    logger.info(f"📥 Received image segmentation request")
    await file.seek(0)

    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content)).convert('L')
        img_array = np.array(img)
        logger.info(f"📊 Image shape: {img_array.shape}")

        # Preprocessing
        if enhance_contrast:
            import cv2
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            img_array = clahe.apply(img_array)

        # Segment
        seg_mask = fallback_segmentation(img_array)
        model_type = "fallback"

        # Generate result image
        fig, axes = plt.subplots(1, 2, figsize=(12, 5), dpi=100)
        axes[0].imshow(img_array, cmap='gray')
        axes[0].set_title('原始图像')
        axes[0].axis('off')
        axes[1].imshow(img_array, cmap='gray')
        axes[1].imshow(seg_mask, cmap='jet', alpha=0.5)
        axes[1].set_title('分割叠加结果')
        axes[1].axis('off')
        plt.suptitle('图像分割结果', fontsize=16)
        plt.tight_layout()
        img_base64 = _array_to_base64(fig)

        # Statistics
        height, width = seg_mask.shape
        estimated_pixel_spacing = 350.0 / width if width > 0 else 0.7
        area_per_pixel = estimated_pixel_spacing * estimated_pixel_spacing

        lung_px = int(np.sum(seg_mask > 0))
        total_px = height * width
        left_px = int(np.sum(seg_mask[:, :width//2] > 0))
        right_px = int(np.sum(seg_mask[:, width//2:] > 0))
        body_px = int(np.sum((img_array > np.percentile(img_array, 5)).astype(np.uint8)))

        # Validate
        val = _validate_segmentation(left_px, right_px, lung_px, body_px, total_px)

        lung_pct = round(lung_px / total_px * 100, 2) if total_px > 0 else 0
        processing_time = round(time.time() - start_time, 2)

        final_confidence = val["confidence"] if val["passed"] else max(0.05, val["confidence"] * 0.3)

        if not val["passed"]:
            logger.warning(f"⚠️ Image segmentation FAILED validation: {val['reason']}")

        logger.info(f"✅ Image segmentation done in {processing_time}s, validation: {val['reason']}")

        return JSONResponse({
            "success": True,
            "message": "分割成功",
            "data": {
                "result_image": img_base64,
                "image_format": "data:image/png;base64",
                "stats": {
                    "lung_area": round(lung_px * area_per_pixel, 2),
                    "lung_percentage": lung_pct,
                    "left_lung_area": round(left_px * area_per_pixel, 2),
                    "right_lung_area": round(right_px * area_per_pixel, 2),
                    "pixel_spacing_mm": round(estimated_pixel_spacing, 3),
                    "confidence": round(final_confidence, 2),
                    "validation": val,
                },
                "model_type": model_type,
                "processing_time": processing_time,
            },
        })
    except Exception as e:
        logger.error(f"❌ Image segmentation failed: {e}")
        raise HTTPException(status_code=500, detail=f"分割失败：{str(e)}")


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model": "lungmask" if LUNGMASK_AVAILABLE else "fallback",
        "lungmask_available": LUNGMASK_AVAILABLE
    }
