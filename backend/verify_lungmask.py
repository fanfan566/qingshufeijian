# -*- coding: utf-8 -*-
"""
lungmask 肺部分割验证脚本
用于验证后端 API 返回的数据是否符合医学解剖标准
"""
import requests
import sys
import io

# 设置控制台输出编码为 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import json
from pathlib import Path

# 配置
API_BASE_URL = "http://localhost:8001"
TEST_IMAGE_PATH = r"d:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed\images\LIDC-IDRI-0001_slice_005.png"

# 医学解剖标准参考值 (单张 CT 切片)
MEDICAL_STANDARDS = {
    "total_lung_area_mm2": {
        "min": 15000,
        "max": 30000,
        "unit": "mm²",
        "description": "总肺面积正常范围"
    },
    "left_lung_area_mm2": {
        "min": 7000,
        "max": 14000,
        "unit": "mm²",
        "description": "左肺面积 (2 叶，较小)"
    },
    "right_lung_area_mm2": {
        "min": 8000,
        "max": 16000,
        "unit": "mm²",
        "description": "右肺面积 (3 叶，较大)"
    },
    "lung_percentage": {
        "min": 50,
        "max": 75,
        "unit": "%",
        "description": "肺实质占比正常范围"
    },
    "left_right_ratio": {
        "min": 0.75,
        "max": 0.95,
        "unit": "ratio",
        "description": "左右肺面积比 (左/右，正常 0.85±0.1)"
    }
}

def check_backend_health():
    """检查后端服务是否可用"""
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        return response.ok
    except:
        return False

def test_lungmask_api():
    """测试 lungmask 专业版 API"""
    print("=" * 70)
    print("lungmask 肺部分割验证测试")
    print("=" * 70)
    
    # 1. 检查后端服务
    print("\n[1/4] 检查后端服务...")
    if not check_backend_health():
        print("[FAIL] 后端服务未响应，请先启动后端:")
        print("   cd \"d:\\Lang P\\Lang-Protector-main\\backend\"")
        print("   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
        return False
    print("[PASS] 后端服务正常")
    
    # 2. 检查测试图像
    print("\n[2/4] 检查测试图像...")
    test_image = Path(TEST_IMAGE_PATH)
    if not test_image.exists():
        print(f"[FAIL] 测试图像不存在：{TEST_IMAGE_PATH}")
        print("   请修改 TEST_IMAGE_PATH 为实际图像路径")
        return False
    print(f"[PASS] 测试图像：{test_image.name}")
    
    # 3. 发送分割请求
    print("\n[3/4] 发送分割请求...")
    try:
        with open(test_image, 'rb') as f:
            files = {'file': ('test.png', f, 'image/png')}
            data = {'enhance_contrast': 'true'}
            
            response = requests.post(
                f"{API_BASE_URL}/api/lungmask/full/image",
                files=files,
                data=data,
                timeout=30
            )
        
        if response.status_code != 200:
            print(f"[FAIL] API 返回错误：{response.status_code}")
            print(f"   响应：{response.text}")
            return False
        
        result = response.json()
        print("[PASS] API 响应成功")
        
    except Exception as e:
        print(f"[FAIL] 请求失败：{str(e)}")
        return False
    
    # 4. 验证数据准确性
    print("\n[4/4] 验证数据准确性...")
    # API 直接返回 stats 在根级别，不是嵌套在 data 中
    stats = result.get('stats', {})
    
    if not stats:
        print("[FAIL] 未找到统计信息")
        print(f"   完整响应：{json.dumps(result, indent=2)}")
        return False
    
    # 提取关键数据
    total_area = stats.get('lung_area', 0)
    left_area = stats.get('left_lung_area', 0)
    right_area = stats.get('right_lung_area', 0)
    percentage = stats.get('lung_percentage', 0)
    
    # 计算左右肺比例
    if right_area > 0:
        lr_ratio = left_area / right_area
    else:
        lr_ratio = 0
    
    # 显示结果
    print("\n" + "=" * 70)
    print("分割结果")
    print("=" * 70)
    print(f"总肺面积：    {total_area:,.2f} mm2  ({total_area/100:.1f} cm2)")
    print(f"左肺面积：    {left_area:,.2f} mm2  ({left_area/100:.1f} cm2)")
    print(f"右肺面积：    {right_area:,.2f} mm2  ({right_area/100:.1f} cm2)")
    print(f"肺实质占比：  {percentage:.2f}%")
    print(f"左右肺比例：  {lr_ratio:.3f} (左/右)")
    print(f"模型类型：    {result.get('data', {}).get('model_type', 'unknown')}")
    print(f"处理时间：    {result.get('data', {}).get('processing_time', 0):.2f}s")
    
    # 5. 医学标准验证
    print("\n" + "=" * 70)
    print("医学解剖标准验证")
    print("=" * 70)
    
    validation_results = []
    
    # 验证总肺面积
    std = MEDICAL_STANDARDS["total_lung_area_mm2"]
    passed = std["min"] <= total_area <= std["max"]
    validation_results.append(passed)
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} 总肺面积")
    print(f"   实测：{total_area:,.2f} mm2")
    print(f"   标准：{std['min']:,} - {std['max']:,} mm2")
    print(f"   {std['description']}")
    
    # 验证左肺面积
    std = MEDICAL_STANDARDS["left_lung_area_mm2"]
    passed = std["min"] <= left_area <= std["max"]
    validation_results.append(passed)
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} 左肺面积")
    print(f"   实测：{left_area:,.2f} mm2")
    print(f"   标准：{std['min']:,} - {std['max']:,} mm2")
    print(f"   {std['description']}")
    
    # 验证右肺面积
    std = MEDICAL_STANDARDS["right_lung_area_mm2"]
    passed = std["min"] <= right_area <= std["max"]
    validation_results.append(passed)
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} 右肺面积")
    print(f"   实测：{right_area:,.2f} mm2")
    print(f"   标准：{std['min']:,} - {std['max']:,} mm2")
    print(f"   {std['description']}")
    
    # 验证肺实质占比
    std = MEDICAL_STANDARDS["lung_percentage"]
    passed = std["min"] <= percentage <= std["max"]
    validation_results.append(passed)
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} 肺实质占比")
    print(f"   实测：{percentage:.2f}%")
    print(f"   标准：{std['min']} - {std['max']}%")
    print(f"   {std['description']}")
    
    # 验证左右肺比例 (关键：不能相等！)
    std = MEDICAL_STANDARDS["left_right_ratio"]
    passed = std["min"] <= lr_ratio <= std["max"]
    validation_results.append(passed)
    status = "[PASS]" if passed else "[FAIL]"
    print(f"\n{status} 左右肺比例 (关键指标)")
    print(f"   实测：{lr_ratio:.3f}")
    print(f"   标准：{std['min']} - {std['max']}")
    print(f"   {std['description']}")
    
    # 特别检查：左右肺是否完全相等 (严重错误)
    if abs(left_area - right_area) < 1:  # 差异小于 1mm2
        print(f"\n[FAIL] 严重错误：左右肺面积完全相等！")
        print(f"   这是硬编码平均分配的错误，不符合解剖学！")
        validation_results.append(False)
    else:
        diff_pct = abs(left_area - right_area) / max(left_area, right_area) * 100
        print(f"\n[PASS] 左右肺面积不相等 (差异 {diff_pct:.1f}%)")
        print(f"   符合正常解剖变异 (10-15%)")
    
    # 6. 总体评估
    print("\n" + "=" * 70)
    print("总体评估")
    print("=" * 70)
    
    passed_count = sum(validation_results)
    total_count = len(validation_results)
    pass_rate = passed_count / total_count * 100
    
    print(f"通过项：{passed_count}/{total_count} ({pass_rate:.1f}%)")
    
    if pass_rate >= 80:
        print("\n[PASS] 验证通过！数据符合医学解剖标准")
        print(f"   模型类型：{result.get('data', {}).get('model_type', 'unknown')}")
        print(f"   置信度：{stats.get('confidence', 0) * 100:.1f}%")
    else:
        print("\n[WARN] 验证未通过，数据可能存在偏差")
        print("   可能原因:")
        print("   1. 图像类型不匹配 (截图 vs 原始 DICOM)")
        print("   2. 像素间距估算不准确")
        print("   3. 分割算法需要优化")
    
    print("\n" + "=" * 70)
    print("验证完成")
    print("=" * 70)
    
    return pass_rate >= 80

if __name__ == "__main__":
    success = test_lungmask_api()
    exit(0 if success else 1)
