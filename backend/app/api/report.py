"""
自动诊断报告生成 API
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, List
import time
from datetime import datetime
from loguru import logger
import json

router = APIRouter()


class ReportGenerationRequest(BaseModel):
    """报告生成请求"""
    patient_id: str
    patient_name: str
    patient_age: int
    patient_gender: str
    examination_type: str
    segmentation_result: Dict[str, Any]
    nodule_result: Dict[str, Any]
    lesion_result: Dict[str, Any]


class ReportGenerationResponse(BaseModel):
    """报告生成响应"""
    success: bool
    message: str
    data: Dict[str, Any]


@router.post("/generate", response_model=ReportGenerationResponse)
async def generate_report(
    request_data: dict
):
    """
    生成结构化诊断报告
    
    整合分割、结节检测、病变识别结果，生成完整的诊断报告
    """
    start_time = time.time()
    
    try:
        logger.info("📝 开始生成诊断报告...")
        
        # 解析请求数据
        patient_info = request_data.get('patient_info', {})
        segmentation = request_data.get('segmentation', {})
        nodules = request_data.get('nodules', {})
        lesions = request_data.get('lesions', {})
        
        # 生成报告
        report = {
            "report_id": f"LUNG-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "examination_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "patient_info": patient_info,
            "examination_findings": {
                "lung_segmentation": {
                    "total_lung_area": segmentation.get('stats', {}).get('lung_area', 0),
                    "lung_percentage": segmentation.get('stats', {}).get('lung_percentage', 0),
                    "left_right_ratio": calculate_lung_ratio(segmentation)
                },
                "pulmonary_nodules": {
                    "detected": len(nodules.get('nodules', [])),
                    "details": nodules.get('nodules', []),
                    "risk_assessment": assess_nodule_risk(nodules)
                },
                "lung_lesions": {
                    "detected": len(lesions.get('lesions', [])),
                    "primary_diagnosis": lesions.get('primary_diagnosis', '未见明显异常'),
                    "severity": lesions.get('severity', '无')
                }
            },
            "impression": generate_impression(nodules, lesions),
            "recommendations": generate_recommendations(nodules, lesions),
            "radiologist": "AI Assistant",
            "review_status": "Preliminary"
        }
        
        # 生成 Lung-RADS 分级（肺部结节专用）
        report["lung_rads_category"] = calculate_lung_rads_category(nodules, lesions)
        
        processing_time = time.time() - start_time
        
        logger.info(f"✅ 报告生成完成")
        
        return ReportGenerationResponse(
            success=True,
            message="诊断报告生成成功",
            data={
                "report": report,
                "report_json": json.dumps(report, ensure_ascii=False, indent=2),
                "processing_time": processing_time
            }
        )
        
    except Exception as e:
        logger.error(f"❌ 报告生成失败：{str(e)}")
        raise HTTPException(status_code=500, detail=f"报告生成失败：{str(e)}")


def calculate_lung_ratio(segmentation: Dict) -> float:
    """计算左右肺比例"""
    stats = segmentation.get('stats', {})
    left = stats.get('left_lung_area', 0)
    right = stats.get('right_lung_area', 0)
    
    if right == 0:
        return 1.0
    
    return round(left / right, 2)


def assess_nodule_risk(nodules: Dict) -> str:
    """评估结节风险（基于 Lung-RADS）"""
    nodule_list = nodules.get('nodules', [])
    
    if not nodule_list:
        return "低风险"
    
    # 检查高风险结节或大结节（>=15mm）
    high_risk_count = sum(1 for n in nodule_list if n.get('malignancy_risk') == 'high')
    large_solid_nodules = sum(1 for n in nodule_list if n.get('size', 0) >= 15 and n.get('type') == 'solid')
    
    if high_risk_count > 0 or large_solid_nodules > 0:
        return "中高风险"
    
    # 检查中等风险结节（8-15mm）
    medium_risk_count = sum(1 for n in nodule_list if n.get('malignancy_risk') == 'medium')
    nodules_8_15mm = sum(1 for n in nodule_list if 8 <= n.get('size', 0) < 15)
    
    if medium_risk_count > 0 or nodules_8_15mm > 0:
        return "中低风险"
    
    # 小结节（<8mm）
    return "低风险"


def generate_impression(nodules: Dict, lesions: Dict) -> str:
    """生成印象（诊断结论）"""
    impressions = []
    
    # 结节相关
    nodule_count = len(nodules.get('nodules', []))
    if nodule_count > 0:
        risk = assess_nodule_risk(nodules)
        impressions.append(f"肺内见{nodule_count}个结节影，风险评估：{risk}")
    
    # 病变相关
    primary_lesion = lesions.get('primary_diagnosis', '')
    if primary_lesion and primary_lesion != '未见明显异常':
        severity = lesions.get('severity', '')
        impressions.append(f"{primary_lesion}表现，程度：{severity}")
    
    if not impressions:
        return "双肺未见明显异常"
    
    return "；".join(impressions)


def generate_recommendations(nodules: Dict, lesions: Dict) -> List[str]:
    """生成建议（基于 Lung-RADS）"""
    recommendations = []
    
    # 根据结节风险评估
    nodule_risk = assess_nodule_risk(nodules)
    nodule_list = nodules.get('nodules', [])
    max_nodule_size = max([n.get('size', 0) for n in nodule_list], default=0)
    
    if nodule_risk == "中高风险":
        recommendations.append("建议3个月复查胸部CT或进一步评估（增强CT/PET-CT）")
        if max_nodule_size >= 15:
            recommendations.append(f"最大结节{max_nodule_size:.1f}mm，建议结合临床考虑组织取样")
    elif nodule_risk == "中低风险":
        recommendations.append("建议6个月复查胸部CT")
        recommendations.append("密切随访观察结节变化")
    elif nodule_risk == "低风险" and nodule_list:
        recommendations.append("建议12个月后复查CT（年度筛查）")
    
    # 根据病变
    primary_lesion = lesions.get('primary_diagnosis', '')
    if primary_lesion == '肺炎':
        recommendations.append("抗感染治疗")
        recommendations.append("治疗后复查")
    elif primary_lesion == '肺气肿':
        recommendations.append("戒烟，避免有害气体吸入")
        recommendations.append("呼吸功能锻炼")
    elif primary_lesion == '肺纤维化':
        recommendations.append("定期随访肺功能")
        recommendations.append("避免接触致纤维化因素")
    
    if not recommendations:
        recommendations.append("定期体检，保持健康生活方式")
    
    return recommendations


def calculate_lung_rads_category(nodules: Dict, lesions: Dict) -> str:
    """
    计算 Lung-RADS 分级（肺部结节专用）

    0: 不完整 - 需要进一步影像评估
    1: 阴性 - 无结节或明确良性结节
    2: 良性表现或行为 - 低风险
    3: 可能良性 - 中低风险，建议短期随访
    4A: 可疑异常 - 中高风险，建议进一步评估
    4B: 高度可疑 - 高风险，建议组织取样
    4X: 可疑异常 + 修饰符
    """
    nodule_list = nodules.get('nodules', [])

    if not nodule_list and lesions.get('primary_diagnosis', '') == '未见明显异常':
        return "Lung-RADS 1类 - 阴性"

    # 检查是否有高风险结节或大结节（>15mm）
    high_risk = sum(1 for n in nodule_list if n.get('malignancy_risk') == 'high')
    very_large_nodules = sum(1 for n in nodule_list if n.get('size', 0) > 20)
    large_solid_nodules = sum(1 for n in nodule_list if n.get('size', 0) >= 15 and n.get('type') == 'solid')

    if high_risk > 0 or very_large_nodules > 0 or large_solid_nodules > 0:
        return "Lung-RADS 4A类 - 可疑异常，建议3个月复查或进一步评估"

    # 检查中等风险结节（8-15mm 实性结节）
    medium_risk = sum(1 for n in nodule_list if n.get('malignancy_risk') == 'medium')
    nodules_8_15mm = sum(1 for n in nodule_list if 8 <= n.get('size', 0) < 15 and n.get('type') == 'solid')

    if medium_risk > 0 or nodules_8_15mm > 0:
        return "Lung-RADS 3类 - 可能良性，建议6个月复查"

    # 小结节（<8mm）
    if nodule_list:
        return "Lung-RADS 2类 - 良性表现，年度筛查"

    return "Lung-RADS 1类 - 阴性"


@router.get("/template")
async def get_report_template():
    """获取报告模板"""
    template = {
        "patient_info": {
            "patient_id": "",
            "patient_name": "",
            "patient_age": 0,
            "patient_gender": "",
            "examination_id": ""
        },
        "examination_findings": {
            "lung_segmentation": {},
            "pulmonary_nodules": {},
            "lung_lesions": {}
        },
        "impression": "",
        "recommendations": [],
        "lung_rads_category": ""
    }
    
    return {"template": template}
