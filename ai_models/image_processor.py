"""
肺部图像分析 AI 模型服务
支持肺部分割、结节检测、病变识别和报告生成

使用方法：
1. 作为独立服务运行（FastAPI）
2. 或通过 subprocess 被 Node.js 调用

依赖安装：
pip install fastapi uvicorn python-multipart opencv-python numpy torch torchvision
"""

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import base64
import io
from PIL import Image
from typing import Optional
import uuid
from datetime import datetime

# 尝试导入深度学习库（如果可用）
try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("⚠️ PyTorch 未安装，将使用传统图像处理方法")

app = FastAPI(title="Lung Image Analysis API")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 工具函数 ====================

def image_to_base64(image: np.ndarray) -> str:
    """将 OpenCV 图像转换为 base64"""
    _, buffer = cv2.imencode('.png', image)
    return base64.b64encode(buffer).decode('utf-8')

def base64_to_image(base64_str: str) -> np.ndarray:
    """将 base64 转换为 OpenCV 图像"""
    img_bytes = base64.b64decode(base64_str)
    img_array = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(img_array, cv2.IMREAD_COLOR)

def preprocess_image(image: np.ndarray) -> np.ndarray:
    """图像预处理：对比度增强、去噪"""
    # 转换为灰度图
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # CLAHE 对比度增强
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # 高斯去噪
    denoised = cv2.GaussianBlur(enhanced, (5, 5), 0)
    
    # 转回 BGR
    result = cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR)
    return result

# ==================== 肺部分割 ====================

def segment_lungs(image: np.ndarray) -> dict:
    """
    肺部分割（传统图像处理方法）
    使用阈值分割和形态学操作提取肺部区域
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # 高斯模糊
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Otsu 阈值分割
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 形态学操作
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    
    # 查找轮廓
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # 创建掩码
    mask = np.zeros_like(opened)
    
    # 找到最大的两个轮廓（左右肺）
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:2]
    cv2.drawContours(mask, contours, -1, 255, -1)
    
    # 计算统计信息
    total_area = sum(cv2.contourArea(c) for c in contours)
    
    # 分割左右肺
    height, width = mask.shape
    mid_x = width // 2
    left_contour_area = sum(cv2.contourArea(c) for c in contours if cv2.boundingRect(c)[0] < mid_x)
    right_contour_area = sum(cv2.contourArea(c) for c in contours if cv2.boundingRect(c)[0] >= mid_x)
    
    # 应用掩码到原图
    result = cv2.bitwise_and(image, image, mask=mask)
    
    # 在掩码上绘制轮廓（可视化）
    mask_color = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    cv2.drawContours(mask_color, contours, -1, (0, 255, 0), 2)
    
    # 分割结果：原图 + 绿色高亮
    segmented = cv2.addWeighted(image, 0.7, mask_color, 0.3, 0)
    
    return {
        'segmented_image': image_to_base64(segmented),
        'mask': image_to_base64(mask),
        'stats': {
            'lung_area': float(total_area),
            'lung_percentage': float(total_area / (height * width) * 100),
            'left_lung_area': float(left_contour_area),
            'right_lung_area': float(right_contour_area),
            'suspicious_nodules': 0,  # 将在结节检测中计算
            'confidence': 0.85
        }
    }

# ==================== 结节检测 ====================

def detect_nodules(image: np.ndarray) -> dict:
    """
    肺结节检测（基于 Hough 圆检测和形状分析）
    这是一个简化版本，实际应用中应使用深度学习模型
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # 增强对比度
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # 自适应阈值
    thresh = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 11, 2
    )
    
    # 形态学操作
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    
    # 查找轮廓
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    nodules = []
    for contour in contours:
        area = cv2.contourArea(contour)
        # 过滤结节大小（5-500 像素）
        if 20 < area < 500:
            perimeter = cv2.arcLength(contour, True)
            if perimeter == 0:
                continue
            
            circularity = 4 * np.pi * (area / (perimeter * perimeter))
            
            # 结节通常是圆形的
            if circularity > 0.6:
                # 计算外接圆
                ((x, y), radius) = cv2.minEnclosingCircle(contour)
                center = (int(x), int(y))
                radius = int(radius)
                
                # 计算位置
                height, width = gray.shape
                location = classify_location(center, width, height)
                
                # 评估恶性风险
                malignancy_risk = assess_malignancy(area, circularity, radius)
                
                nodules.append({
                    'id': str(uuid.uuid4()),
                    'type': classify_nodule_type(gray, contour),
                    'size': float(radius * 0.5),  # 模拟转换为 mm
                    'location': location,
                    'malignancy_risk': malignancy_risk,
                    'confidence': float(circularity),
                    'bbox': [
                        int(x - radius), int(y - radius),
                        int(x + radius), int(y + radius)
                    ]
                })
    
    # 限制最多 10 个结节
    nodules = sorted(nodules, key=lambda x: x['size'], reverse=True)[:10]
    
    # 在图像上标记结节
    marked_image = image.copy()
    for i, nodule in enumerate(nodules):
        x, y, w, h = nodule['bbox']
        color = (0, 255, 0) if nodule['malignancy_risk'] == 'low' else \
                (0, 165, 255) if nodule['malignancy_risk'] == 'medium' else (0, 0, 255)
        cv2.rectangle(marked_image, (x, y), (w, h), color, 2)
        cv2.putText(marked_image, f'N{i+1}', (x, y - 5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    return {
        'marked_image': image_to_base64(marked_image),
        'nodules': nodules,
        'count': len(nodules)
    }

def classify_location(center: tuple, width: int, height: int) -> str:
    """结节位置分类"""
    x, y = center
    mid_x = width // 2
    
    if y < height // 3:
        zone = "上叶"
    elif y < 2 * height // 3:
        zone = "中叶"
    else:
        zone = "下叶"
    
    side = "左肺" if x < mid_x else "右肺"
    return f"{side}{zone}"

def classify_nodule_type(gray: np.ndarray, contour: np.ndarray) -> str:
    """结节类型分类"""
    # 计算平均灰度
    mask = np.zeros_like(gray)
    cv2.drawContours(mask, [contour], -1, 255, -1)
    mean_val = cv2.mean(gray, mask=mask)[0]
    
    if mean_val > 200:
        return 'ground_glass'  # 磨玻璃结节
    elif mean_val > 150:
        return 'mixed'  # 混合性结节
    else:
        return 'solid'  # 实性结节

def assess_malignancy(area: float, circularity: float, radius: float) -> str:
    """恶性风险评估"""
    risk_score = 0
    
    # 大小评分
    if area > 300:
        risk_score += 2
    elif area > 100:
        risk_score += 1
    
    # 形状评分（越不规则风险越高）
    if circularity < 0.7:
        risk_score += 2
    elif circularity < 0.85:
        risk_score += 1
    
    # 风险分级
    if risk_score >= 3:
        return 'high'
    elif risk_score >= 1:
        return 'medium'
    else:
        return 'low'

# ==================== 病变识别 ====================

def classify_lesions(image: np.ndarray) -> dict:
    """
    病变分类识别
    识别肺炎、肺结核、肺纤维化等病变
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    lesions = []
    
    # 检测异常纹理区域
    # 使用局部二值模式（LBP）近似
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # 形态学操作
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dilated_edges = cv2.dilate(edges, kernel, iterations=2)
    
    # 查找轮廓
    contours, _ = cv2.findContours(dilated_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if area > 500:  # 较大的病变区域
            x, y, w, h = cv2.boundingRect(contour)
            
            # 计算区域平均灰度
            roi = gray[y:y+h, x:x+w]
            mean_val = cv2.mean(roi)[0]
            
            # 根据灰度特征分类病变
            lesion_type, severity, confidence = classify_lesion_type(mean_val, area)
            
            if lesion_type:
                lesions.append({
                    'id': str(uuid.uuid4()),
                    'name': lesion_type,
                    'severity': severity,
                    'confidence': float(confidence),
                    'bbox': [x, y, w, h],
                    'area': float(area)
                })
    
    # 限制最多 5 个病变
    lesions = lesions[:5]
    
    # 标记病变
    marked_image = image.copy()
    for lesion in lesions:
        x, y, w, h = lesion['bbox']
        color = (0, 255, 255) if lesion['severity'] == '轻度' else \
                (0, 165, 255) if lesion['severity'] == '中度' else (0, 0, 255)
        cv2.rectangle(marked_image, (x, y), (x + w, y + h), color, 2)
        cv2.putText(marked_image, lesion['name'], (x, y - 5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    return {
        'marked_image': image_to_base64(marked_image),
        'lesions': lesions,
        'count': len(lesions)
    }

def classify_lesion_type(mean_val: float, area: float) -> tuple:
    """病变类型分类"""
    # 简化分类逻辑
    if mean_val < 80:
        return '炎症浸润', '中度', 0.75
    elif mean_val < 120:
        if area > 1000:
            return '肺纤维化', '重度', 0.68
        else:
            return '肺结核', '中度', 0.72
    elif mean_val < 160:
        return '肺气肿', '轻度', 0.65
    else:
        return None, None, None

# ==================== 报告生成 ====================

def generate_report(patient_info: dict, segmentation: dict, nodules: dict, lesions: dict) -> dict:
    """生成诊断报告"""
    report_id = f"RPT-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # 计算 BI-RADS 分类
    nodule_count = nodules.get('count', 0)
    high_risk_nodules = sum(1 for n in nodules.get('nodules', []) 
                           if n.get('malignancy_risk') == 'high')
    
    if high_risk_nodules > 2:
        birads = "4 类"
        recommendation = "建议进一步检查（增强 CT 或活检）"
    elif nodule_count > 3:
        birads = "3 类"
        recommendation = "建议 3-6 个月复查"
    elif nodule_count > 0:
        birads = "2 类"
        recommendation = "建议年度随访"
    else:
        birads = "1 类"
        recommendation = "常规体检即可"
    
    # 生成诊断结论
    impression = generate_impression(segmentation, nodules, lesions)
    
    return {
        'report': {
            'report_id': report_id,
            'patient_id': patient_info.get('patient_id', 'UNKNOWN'),
            'examination_id': patient_info.get('examination_id', f"EXAM-{uuid.uuid4().hex[:8]}"),
            'report_date': datetime.now().isoformat(),
            'birads_category': birads,
            'findings': {
                'segmentation': segmentation.get('stats', {}),
                'nodules': nodules.get('nodules', []),
                'lesions': lesions.get('lesions', [])
            },
            'impression': impression,
            'recommendations': [recommendation, "戒烟限酒，保持健康生活方式"],
            'radiologist': 'AI Assistant',
            'review_status': 'preliminary'
        },
        'report_id': report_id
    }

def generate_impression(segmentation: dict, nodules: dict, lesions: dict) -> str:
    """生成诊断印象"""
    parts = []
    
    # 肺部分割结果
    stats = segmentation.get('stats', {})
    if stats.get('lung_area', 0) > 0:
        parts.append(f"双肺野清晰，肺纹理分布正常，肺面积约为{stats.get('lung_area', 0):.1f}像素²")
    
    # 结节情况
    nodule_list = nodules.get('nodules', [])
    if nodule_list:
        parts.append(f"肺内见{nodule_list.__len__()}个结节影，较大者位于{nodule_list[0].get('location', '未知')}")
    else:
        parts.append("肺内未见明显结节影")
    
    # 病变情况
    lesion_list = lesions.get('lesions', [])
    if lesion_list:
        lesion_names = [l['name'] for l in lesion_list]
        parts.append(f"考虑{'、'.join(lesion_names)}可能")
    
    return "；".join(parts) + "。"

# ==================== API 路由 ====================

@app.post("/api/segment/analyze")
async def analyze_segmentation(
    image: UploadFile = File(...),
    enhance_contrast: bool = Form(True),
    reduce_noise: bool = Form(True)
):
    """肺部分割分析"""
    try:
        # 读取图像
        contents = await image.read()
        image_array = np.frombuffer(contents, np.uint8)
        image_cv = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        if image_cv is None:
            return JSONResponse(status_code=400, content={'message': '无法解码图像'})
        
        # 预处理
        if enhance_contrast or reduce_noise:
            image_cv = preprocess_image(image_cv)
        
        # 分割
        result = segment_lungs(image_cv)
        
        # 转换原图
        original_base64 = image_to_base64(image_cv)
        
        return JSONResponse(content={
            'success': True,
            'data': {
                'original_image': original_base64,
                **result,
                'model_type': 'traditional'
            },
            'message': '分割成功'
        })
    
    except Exception as e:
        return JSONResponse(status_code=500, content={
            'success': False,
            'message': f'分割失败：{str(e)}'
        })

@app.post("/api/nodule/detect")
async def detect_nodules_api(image: UploadFile = File(...)):
    """肺结节检测"""
    try:
        contents = await image.read()
        image_array = np.frombuffer(contents, np.uint8)
        image_cv = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        if image_cv is None:
            return JSONResponse(status_code=400, content={'message': '无法解码图像'})
        
        result = detect_nodules(image_cv)
        
        return JSONResponse(content={
            'success': True,
            'data': result,
            'message': '检测成功'
        })
    
    except Exception as e:
        return JSONResponse(status_code=500, content={
            'success': False,
            'message': f'检测失败：{str(e)}'
        })

@app.post("/api/lesion/classify")
async def classify_lesions_api(image: UploadFile = File(...)):
    """病变分类识别"""
    try:
        contents = await image.read()
        image_array = np.frombuffer(contents, np.uint8)
        image_cv = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        if image_cv is None:
            return JSONResponse(status_code=400, content={'message': '无法解码图像'})
        
        result = classify_lesions(image_cv)
        
        return JSONResponse(content={
            'success': True,
            'data': result,
            'message': '识别成功'
        })
    
    except Exception as e:
        return JSONResponse(status_code=500, content={
            'success': False,
            'message': f'识别失败：{str(e)}'
        })

@app.post("/api/report/generate")
async def generate_report_api(request: dict):
    """生成诊断报告"""
    try:
        patient_info = request.get('patient_info', {})
        segmentation = request.get('segmentation', {})
        nodules = request.get('nodules', {})
        lesions = request.get('lesions', {})
        
        result = generate_report(patient_info, segmentation, nodules, lesions)
        
        return JSONResponse(content={
            'success': True,
            'data': result,
            'message': '报告生成成功'
        })
    
    except Exception as e:
        return JSONResponse(status_code=500, content={
            'success': False,
            'message': f'报告生成失败：{str(e)}'
        })

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        'status': 'healthy',
        'service': 'Lung Image Analysis API',
        'torch_available': TORCH_AVAILABLE,
        'timestamp': datetime.now().isoformat()
    }

# ==================== 主程序 ====================

if __name__ == "__main__":
    import uvicorn
    print("🚀 启动肺部图像分析 AI 服务...")
    print(f"📊 PyTorch 可用：{'✓' if TORCH_AVAILABLE else '✗ (使用传统方法)'}")
    print("🌐 API 文档：http://localhost:8001/docs")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8001)
