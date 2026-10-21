/**
 * 肺结节检测 API 服务
 */
import { apiRequest, type ApiResponse } from './apiService';
import { API_ENDPOINTS } from '../config/api';

export interface NoduleInfo {
  id: number;
  x: number;
  y: number;
  size: number;
  confidence: number;
  type: 'solid' | 'ground_glass' | 'subsolid';
  malignancy_risk: 'low' | 'medium' | 'high';
  location: string;
}

export interface NoduleStats {
  total_nodules: number;
  solid_nodules: number;
  ground_glass_nodules: number;
  high_risk_nodules: number;
  average_size: number;
}

export interface NoduleDetectionResult {
  original_image: string;
  marked_image: string;
  nodules: NoduleInfo[];
  stats: NoduleStats;
  recommendation: string;
}

/**
 * 肺结节检测
 */
export async function detectNodules(
  imageFile: File,
  segmentedMask?: File | string
): Promise<ApiResponse<NoduleDetectionResult>> {
  const formData = new FormData();
  formData.append('image', imageFile);

  if (segmentedMask instanceof File) {
    formData.append('segmented_mask', segmentedMask);
  } else if (typeof segmentedMask === 'string' && segmentedMask.trim()) {
    formData.append('segmented_mask', segmentedMask);
  }

  return apiRequest<NoduleDetectionResult>(
    API_ENDPOINTS.NODULE_DETECT,
    'POST',
    formData
  );
}

/**
 * 在 Canvas 上标记结节
 */
export function drawNoduleMarkers(
  ctx: CanvasRenderingContext2D,
  nodules: NoduleInfo[],
  canvasWidth: number,
  canvasHeight: number
): void {
  try {
    console.log('绘制结节标记:', nodules.length, '个结节');
    console.log('画布尺寸:', canvasWidth, 'x', canvasHeight);
    
    // 确保画布尺寸不为零
    if (canvasWidth === 0 || canvasHeight === 0) {
      console.error('画布尺寸为零，无法绘制结节标记');
      return;
    }
    
    // 确保结节列表存在且非空
    if (!nodules || !Array.isArray(nodules) || nodules.length === 0) {
      console.warn('结节列表为空，无法绘制结节标记');
      return;
    }
    
    // 绘制测试标记，确保函数被调用
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`测试标记: ${nodules.length}个结节`, 10, 30);
    
    // 绘制一个固定位置的测试圆圈，确保绘制功能正常
    ctx.beginPath();
    ctx.arc(50, 50, 20, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    nodules.forEach((nodule) => {
      try {
        console.log('结节信息:', nodule);
        
        // 确保结节对象存在且包含必要属性
        if (!nodule || typeof nodule !== 'object' || typeof nodule.x !== 'number' || typeof nodule.y !== 'number') {
          console.warn('无效的结节对象:', nodule);
          return;
        }
        
        // 根据风险等级选择颜色
        let color: string;
        switch (nodule.malignancy_risk) {
          case 'high':
            color = '#ef4444'; // 红色
            break;
          case 'medium':
            color = '#f97316'; // 橙色
            break;
          default:
            color = '#22c55e'; // 绿色
        }

        // 不使用缩放，直接使用原始坐标进行测试
        const x = nodule.x;
        const y = nodule.y;
        // 确保半径至少为 10 像素，以便清晰可见
        const radius = Math.max(10, (nodule.size || 0) * 2);
        
        console.log('结节坐标:', x, y, '半径:', radius);
        
        // 绘制圆圈
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // 绘制中心点
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // 绘制标签
        ctx.fillStyle = color;
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`N${nodule.id || '?' }`, x + radius + 5, y - radius - 5);
      } catch (error) {
        console.error('绘制单个结节时出错:', error);
      }
    });
  } catch (error) {
    console.error('绘制结节标记时出错:', error);
  }
}

/**
 * 评估结节风险等级
 */
export function assessNoduleRisk(nodules: NoduleInfo[]): string {
  if (nodules.length === 0) {
    return '未检测到结节';
  }

  const highRiskCount = nodules.filter(n => n.malignancy_risk === 'high').length;
  const largeNoduleCount = nodules.filter(n => n.size > 8).length;

  if (highRiskCount > 0 || largeNoduleCount > 0) {
    return '高风险';
  }

  const mediumRiskCount = nodules.filter(n => n.malignancy_risk === 'medium').length;
  if (mediumRiskCount > 0 || nodules.some(n => n.size >= 5)) {
    return '中风险';
  }

  return '低风险';
}
