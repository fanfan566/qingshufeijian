"""
基于 SegMoTE 的肺部分割 API

模型：SegMoTE（CVPR 2026, SAM ViT-B + Token-level MoE），权重来自 D:\\SegMoTE-main\\checkpoints
接口与 /api/lungmask/full/* 返回结构保持一致，前端可直接复用展示逻辑：
- POST /api/segmote/image         普通图片（胸部 CT 截图 / 胸片 PNG/JPG）
- POST /api/segmote/dicom         单个 DICOM 文件
- POST /api/segmote/dicom-series  DICOM 序列
- GET  /api/segmote/health        模型状态
"""
import io
import os
import tempfile
import time
from typing import List, Optional

import numpy as np
import SimpleITK as sitk
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from loguru import logger
from PIL import Image

from app.api.segment_lungmask_full import (
    _build_segmentation_response,
    _get_3d_lung_bounds,
    _select_best_lung_slice,
    _normalize_ct_slice_for_display,
    _normalize_image_to_patient_orientation,
    _postprocess_lungmask_slice,
    _precheck_input_image,
)
from app.services.segmote_engine import get_segmote_engine, summarize_confidence

router = APIRouter()

# DICOM 序列中直接推理的最大层数，超过后先均匀采样再在最佳层附近细化
MAX_DENSE_SLICES = 64
COARSE_SAMPLE_SLICES = 40
REFINE_RADIUS = 3


def _require_engine():
    engine = get_segmote_engine()
    if not engine.load():
        raise HTTPException(status_code=503, detail=f"SegMoTE 模型未加载：{engine.load_error}")
    return engine


def _model_feedback(engine, result: dict, inference_time: float, extra: Optional[dict] = None) -> dict:
    """返回给前端的模型推理反馈信息"""
    info = {
        **engine.info(),
        **summarize_confidence(result),
        "inference_time": round(inference_time, 3),
        "foreground_pixels": int(np.sum(result["mask"] > 0)),
    }
    if extra:
        info.update(extra)
    return info


def _attach_model_feedback(response: dict, model_info: dict) -> dict:
    data = response["data"]
    data["model_info"] = model_info
    # 置信度改为由 SegMoTE 输出概率/IoU 预测与解剖学校验共同决定，而非固定值
    stats = data["stats"]
    if stats["validation"]["passed"]:
        stats["confidence"] = round(model_info["model_confidence"], 2)
    else:
        stats["confidence"] = round(min(stats["confidence"], model_info["model_confidence"]), 2)
    return response


def _estimate_body_area(gray: np.ndarray, lung_mask: np.ndarray) -> int:
    """
    估算身体截面（含肺野）像素数，作为“肺野占比”的分母。
    Otsu 区分空气/组织 -> 取最大组织连通域 -> 填充孔洞（肺野被包含进来）-> 并上模型肺掩码。
    """
    import cv2
    from scipy.ndimage import binary_fill_holes

    h, w = gray.shape
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, tissue = cv2.threshold(blurred, 0, 1, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    tissue = cv2.morphologyEx(tissue, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(tissue, connectivity=8)
    if num_labels <= 1:
        return h * w
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    body = binary_fill_holes(labels == largest) | (lung_mask > 0)

    body_pixels = int(np.sum(body))
    return body_pixels if body_pixels >= h * w * 0.10 else h * w


# --------------------------------------------------------------------------- #
# 普通图片
# --------------------------------------------------------------------------- #
def _segment_image_sync(content: bytes, enhance_contrast: bool) -> dict:
    import cv2

    engine = _require_engine()
    start_time = time.time()

    rgb = np.array(Image.open(io.BytesIO(content)).convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    model_input = gray
    if enhance_contrast:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        model_input = clahe.apply(gray)

    precheck = _precheck_input_image(gray)

    infer_start = time.time()
    result = engine.segment(model_input, targets=["lung"])
    inference_time = time.time() - infer_start

    raw_mask = result["mask"]
    lung_mask = _postprocess_lungmask_slice(raw_mask)

    effective_pixels = _estimate_body_area(gray, lung_mask)

    response = _build_segmentation_response(
        base_image=gray,
        combined_mask=lung_mask,
        pixel_spacing_mm=350.0 / gray.shape[1],
        effective_pixels=effective_pixels,
        total_pixels=gray.shape[0] * gray.shape[1],
        processing_time=time.time() - start_time,
        model_type="segmote",
        extra_data={"input_precheck": precheck},
        patient_left_on_image_right=True,
        anatomical_mapping_reliable=False,
        model_label="SegMoTE",
    )

    model_info = _model_feedback(engine, result, inference_time, {
        "raw_foreground_pixels": int(np.sum(raw_mask > 0)),
        "postprocessed_foreground_pixels": int(np.sum(lung_mask > 0)),
    })
    response = _attach_model_feedback(response, model_info)

    summary = response["data"]["stats"].get("summary", {})
    if not precheck.get("passed", True) and summary.get("severity") == "info":
        summary["severity"] = "warning"
        summary["summary"] = "输入图像疑似不是标准胸部影像，结果仅供参考"
        summary["reasons"] = list(dict.fromkeys(precheck.get("warnings", []) + summary.get("reasons", [])))
        summary["is_reliable"] = False

    return response


@router.post("/image")
async def segment_image(
    file: UploadFile = File(..., description="上传的 PNG/JPG 胸部 CT 截图或胸片"),
    enhance_contrast: bool = Form(True, description="是否增强对比度（CLAHE）"),
):
    logger.info("📥 收到 SegMoTE 图像分割请求")
    content = await file.read()
    try:
        response = await run_in_threadpool(_segment_image_sync, content, enhance_contrast)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ SegMoTE 分割失败：{e}")
        raise HTTPException(status_code=500, detail=f"分割失败：{e}")

    data = response["data"]
    logger.info(
        f"✅ SegMoTE 图像分割完成，耗时 {data['processing_time']:.2f}s，"
        f"推理 {data['model_info']['inference_time']:.2f}s，校验：{data['stats']['validation']['reason']}"
    )
    return JSONResponse(response)


# --------------------------------------------------------------------------- #
# DICOM（体数据逐层推理）
# --------------------------------------------------------------------------- #
def _segment_volume(engine, ct_array: np.ndarray, requested_slice: Optional[int]):
    """
    对 CT 体数据逐层运行 SegMoTE。
    层数较多时先均匀采样定位肺野范围，再对最佳层附近做稠密推理，返回与 ct_array 同形状的分割体。
    未推理的层保持为 0。
    """
    total = ct_array.shape[0]
    segmentation = np.zeros(ct_array.shape, dtype=np.uint8)
    done = {}

    def run(idx: int):
        if idx in done or idx < 0 or idx >= total:
            return
        display = _normalize_ct_slice_for_display(ct_array[idx])
        result = engine.segment(display, targets=["lung"])
        segmentation[idx] = result["mask"]
        done[idx] = result

    if total <= MAX_DENSE_SLICES:
        indices = list(range(total))
    else:
        indices = sorted(set(np.linspace(0, total - 1, COARSE_SAMPLE_SLICES).round().astype(int).tolist()))
    for idx in indices:
        run(idx)

    if requested_slice is not None:
        run(min(max(0, requested_slice), total - 1))
    elif total > MAX_DENSE_SLICES:
        best = max(done, key=lambda i: int(np.sum(segmentation[i] > 0)))
        step = max(1, int(np.ceil(total / COARSE_SAMPLE_SLICES)))
        for idx in range(best - step * REFINE_RADIUS, best + step * REFINE_RADIUS + 1):
            run(idx)

    return segmentation, done


def _build_dicom_response(image, ct_array, segmentation, requested_slice, start_time, model_type, orientation_info):
    """选择展示层并构建与 lungmask 专业版一致的响应（肺野占比分母使用身体截面面积）"""
    spacing = image.GetSpacing()
    pixel_spacing_mm = (spacing[0] + spacing[1]) / 2.0

    if requested_slice is None:
        slice_idx, candidate_slices, selection_meta = _select_best_lung_slice(ct_array, segmentation)
    else:
        slice_idx = min(max(0, requested_slice), ct_array.shape[0] - 1)
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

    display_slice = _normalize_ct_slice_for_display(ct_array[slice_idx])
    seg_slice = _postprocess_lungmask_slice(segmentation[slice_idx])

    return _build_segmentation_response(
        base_image=display_slice,
        combined_mask=seg_slice,
        pixel_spacing_mm=pixel_spacing_mm,
        effective_pixels=_estimate_body_area(display_slice, seg_slice),
        total_pixels=seg_slice.shape[0] * seg_slice.shape[1],
        processing_time=time.time() - start_time,
        model_type=model_type,
        extra_data={
            "slice_index": int(slice_idx),
            "total_slices": int(ct_array.shape[0]),
            "selected_by": "auto_best_lung_slice" if requested_slice is None else "manual_slice_index",
            "candidate_slices": candidate_slices,
            "selection_meta": selection_meta,
            "orientation_info": orientation_info or {},
        },
        patient_left_on_image_right=True,
        anatomical_mapping_reliable=True,
        model_label="SegMoTE",
    )


def _segment_dicom_image_sync(image: sitk.Image, slice_index: Optional[int], model_type: str) -> dict:
    engine = _require_engine()
    start_time = time.time()

    image, _, orientation_info = _normalize_image_to_patient_orientation(image)
    ct_array = sitk.GetArrayFromImage(image)
    if ct_array.ndim == 2:
        ct_array = ct_array[np.newaxis, ...]
    elif ct_array.ndim == 4:
        ct_array = ct_array[..., 0]

    infer_start = time.time()
    segmentation, results = _segment_volume(engine, ct_array, slice_index)
    inference_time = time.time() - infer_start
    logger.info(f"🧠 SegMoTE 已推理 {len(results)}/{ct_array.shape[0]} 层，用时 {inference_time:.2f}s")

    response = _build_dicom_response(image, ct_array, segmentation, slice_index, start_time, model_type, orientation_info)

    shown_idx = response["data"]["slice_index"]
    shown_result = results.get(shown_idx) or max(results.values(), key=lambda r: int(np.sum(r["mask"])))
    model_info = _model_feedback(engine, shown_result, inference_time, {
        "inferred_slices": len(results),
        "total_slices": int(ct_array.shape[0]),
    })
    return _attach_model_feedback(response, model_info)


@router.post("/dicom")
async def segment_dicom(
    file: UploadFile = File(..., description="上传的 DICOM 文件（.dcm）"),
    slice_index: int = Form(None, description="指定切片索引，默认自动选择最佳肺部层面"),
):
    logger.info("📥 收到 SegMoTE DICOM 分割请求")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dcm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        image = sitk.ReadImage(tmp_path)
        response = await run_in_threadpool(_segment_dicom_image_sync, image, slice_index, "segmote-dicom")
        return JSONResponse(response)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ SegMoTE DICOM 分割失败：{e}")
        raise HTTPException(status_code=500, detail=f"分割失败：{e}")
    finally:
        os.unlink(tmp_path)


@router.post("/dicom-series")
async def segment_dicom_series(
    files: List[UploadFile] = File(..., description="上传的 DICOM 序列文件列表"),
    slice_index: int = Form(None, description="指定切片索引，默认自动选择最佳肺部层面"),
):
    if not files:
        raise HTTPException(status_code=400, detail="未上传 DICOM 序列文件")

    logger.info(f"📥 收到 SegMoTE DICOM 序列分割请求，共 {len(files)} 个文件")
    temp_dir = tempfile.mkdtemp(prefix="segmote_series_")
    saved_paths = []

    try:
        for index, upload in enumerate(files):
            safe_name = os.path.basename(upload.filename or f"slice_{index:04d}.dcm")
            if not safe_name.lower().endswith((".dcm", ".dicom")):
                continue
            target_path = os.path.join(temp_dir, safe_name)
            with open(target_path, "wb") as output_file:
                output_file.write(await upload.read())
            saved_paths.append(target_path)

        if not saved_paths:
            raise HTTPException(status_code=400, detail="未检测到有效的 DICOM 文件")

        reader = sitk.ImageSeriesReader()
        try:
            series_ids = reader.GetGDCMSeriesIDs(temp_dir)
        except Exception:
            series_ids = None

        if series_ids:
            series_id = max(series_ids, key=lambda sid: len(reader.GetGDCMSeriesFileNames(temp_dir, sid)))
            reader.SetFileNames(reader.GetGDCMSeriesFileNames(temp_dir, series_id))
            image = reader.Execute()
        else:
            try:
                image = sitk.ReadImage(saved_paths)
            except Exception as series_error:
                logger.warning(f"⚠️ DICOM 序列读取失败，退化为单文件模式：{series_error}")
                image = sitk.ReadImage(saved_paths[0])

        if image.GetDimension() == 2:
            image = sitk.JoinSeries([image])

        response = await run_in_threadpool(_segment_dicom_image_sync, image, slice_index, "segmote-dicom-series")
        return JSONResponse(response)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ SegMoTE DICOM 序列分割失败：{e}")
        raise HTTPException(status_code=500, detail=f"DICOM 序列分割失败：{e}")
    finally:
        for path in saved_paths:
            try:
                os.unlink(path)
            except OSError:
                pass
        try:
            os.rmdir(temp_dir)
        except OSError:
            pass


@router.get("/health")
async def health_check():
    engine = get_segmote_engine()
    return {"status": "ok" if engine.available else "not_loaded", "model": engine.info()}
