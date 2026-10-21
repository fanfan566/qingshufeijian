/**
 * 病变识别 API 服务
 */
import { apiRequest, type ApiResponse } from './apiService';
import { API_ENDPOINTS } from '../config/api';

export interface LesionInfo {
  name: string;
  confidence: number;
  severity: '轻度' | '中度' | '重度';
  description: string;
  location: string;
}

export interface LesionClassificationResult {
  original_image: string;
  marked_image: string;
  lesions: LesionInfo[];
  primary_diagnosis: string;
  severity: string;
  recommendation: string;
}

/**
 * 病变识别与分类
 */
export async function classifyLesion(
  imageFile: File,
  regionOfInterest?: { x: number; y: number; width: number; height: number } | string
): Promise<ApiResponse<LesionClassificationResult>> {
  const formData = new FormData();
  formData.append('image', imageFile);

  if (typeof regionOfInterest === 'string' && regionOfInterest.trim()) {
    formData.append('region_of_interest', regionOfInterest);
  } else if (regionOfInterest) {
    formData.append('region_of_interest', JSON.stringify(regionOfInterest));
  }

  return apiRequest<LesionClassificationResult>(
    API_ENDPOINTS.LESION_CLASSIFY,
    'POST',
    formData
  );
}

/**
 * 在图像上标注病变区域
 */
export function drawLesionLabels(
  ctx: CanvasRenderingContext2D,
  lesions: LesionInfo[],
  canvasWidth: number,
  canvasHeight: number
): void {
  // 在图像下方添加文本框显示病变信息
  const startY = canvasHeight - (lesions.length * 30) - 20;
  
  lesions.slice(0, 3).forEach((lesion, index) => {
    const y = startY + (index * 30);
    
    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(20, y, canvasWidth - 40, 25);
    
    // 文本
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    const text = `${lesion.name}: ${(lesion.confidence * 100).toFixed(1)}% (${lesion.severity})`;
    ctx.fillText(text, 30, y + 17);
  });
}

/**
 * 获取病变严重程度评分
 */
export function getSeverityScore(severity: string): number {
  const scores: Record<string, number> = {
    '无': 0,
    '正常': 0,
    '轻度': 1,
    '中度': 2,
    '重度': 3
  };
  return scores[severity] || 0;
}

/**
 * 生成病变颜色标识
 */
export function getLesionColor(severity: string): string {
  switch (severity) {
    case '重度':
      return '#ef4444'; // 红色
    case '中度':
      return '#f59e0b'; // 橙色
    case '轻度':
      return '#22c55e'; // 绿色
    default:
      return '#94a3b8'; // 灰色
  }
}
