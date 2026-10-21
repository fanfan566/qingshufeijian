/**
 * 肺部图像分割 API 服务
 */
import { apiRequest, type ApiResponse } from './apiService';
import { API_ENDPOINTS } from '../config/api';

export interface SegmentationStats {
  lung_area: number;
  lung_percentage: number;
  left_lung_area: number;
  right_lung_area: number;
  suspicious_nodules: number;
  confidence: number;
}

export interface SegmentationResult {
  original_image: string;
  segmented_image: string;
  mask: string;
  stats: SegmentationStats;
  model_type: 'simulation' | 'unet';
}

export interface SegmentationConfig {
  enhance_contrast: boolean;
  reduce_noise: boolean;
}

/**
 * 肺部分割分析
 */
export async function analyzeSegmentation(
  imageFile: File,
  config: SegmentationConfig = {
    enhance_contrast: true,
    reduce_noise: true
  }
): Promise<ApiResponse<SegmentationResult>> {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('enhance_contrast', String(config.enhance_contrast));
  formData.append('reduce_noise', String(config.reduce_noise));

  return apiRequest<SegmentationResult>(
    API_ENDPOINTS.SEGMENT_ANALYZE,
    'POST',
    formData
  );
}

/**
 * 使用 Canvas 处理图像
 */
export function processImageToCanvas(
  imageElement: HTMLImageElement,
  maskData?: Uint8ClampedArray
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('无法获取 canvas 上下文');
  }
  
  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  
  // 绘制原始图像
  ctx.drawImage(imageElement, 0, 0);
  
  // 如果有掩码数据，叠加显示
  if (maskData) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < maskData.length; i++) {
      if (maskData[i] > 0) {
        // 绿色高亮肺部区域
        data[i * 4 + 1] = Math.min(255, data[i * 4 + 1] + 100);
        data[i * 4 + 3] = 180; // Alpha
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  return canvas;
}

/**
 * 将 Canvas 转换为 File
 */
export function canvasToFile(canvas: HTMLCanvasElement, filename: string = 'image.png'): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas 转换失败'));
        return;
      }
      resolve(new File([blob], filename, { type: 'image/png' }));
    }, 'image/png');
  });
}
