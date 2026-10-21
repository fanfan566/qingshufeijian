/**
 * API 服务工具函数
 */
import { API_ENDPOINTS } from '../config/api';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  processing_time?: number;
}

export interface ApiError {
  detail: string;
  status: number;
}

/**
 * 通用 API 请求函数
 */
export async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
  data?: FormData | object
): Promise<ApiResponse<T>> {
  const options: RequestInit = {
    method,
    headers: {}
  };

  if (data instanceof FormData) {
    options.body = data;
    // FormData 不需要设置 Content-Type，浏览器会自动设置
  } else if (data) {
    options.headers = {
      'Content-Type': 'application/json'
    };
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(endpoint, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new ApiErrorImpl({
        detail: errorData.detail || `HTTP ${response.status}`,
        status: response.status
      });
    }

    const result = await response.json();
    return result as ApiResponse<T>;
  } catch (error) {
    if (error instanceof ApiErrorImpl) {
      throw error;
    }
    throw new ApiErrorImpl({
      detail: error instanceof Error ? error.message : '网络请求失败',
      status: 0
    });
  }
}

class ApiErrorImpl extends Error implements ApiError {
  detail: string;
  status: number;

  constructor({ detail, status }: { detail: string; status: number }) {
    super(detail);
    this.name = 'ApiError';
    this.detail = detail;
    this.status = status;
  }
}

/**
 * 检查后端服务是否可用
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(API_ENDPOINTS.HEALTH_CHECK);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 将 base64 图像转换为 Blob
 */
export function base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * 将 Blob 转换为 base64
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 下载图像文件
 */
export function downloadImage(base64Data: string, filename: string = 'result.png'): void {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64Data}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
