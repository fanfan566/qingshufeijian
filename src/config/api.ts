/**
 * API 配置
 */
// Vite 环境变量访问方式
const getEnvVar = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as Record<string, string | undefined>)[key];
  }
  return undefined;
};

// 使用相对路径，让 Vite dev server 的 proxy 转发请求
// 这样避免跨域问题，同时兼容开发环境和生产环境
const API_BASE = '/api';

export const API_ENDPOINTS = {
  // 肺部分割
  SEGMENT_ANALYZE: `${API_BASE}/segment/analyze`,
  // SegMoTE 分割（推荐，D:\SegMoTE-main 真实模型推理）
  SEGMOTE_SEGMENT_IMAGE: `${API_BASE}/segmote/image`,
  SEGMOTE_SEGMENT_DICOM: `${API_BASE}/segmote/dicom`,
  SEGMOTE_SEGMENT_DICOM_SERIES: `${API_BASE}/segmote/dicom-series`,
  SEGMOTE_HEALTH: `${API_BASE}/segmote/health`,
  // lungmask 专业版分割
  LUNGMASK_SEGMENT_IMAGE: `${API_BASE}/lungmask/full/image`,
  LUNGMASK_SEGMENT_DICOM: `${API_BASE}/lungmask/full/dicom`,
  LUNGMASK_SEGMENT_DICOM_SERIES: `${API_BASE}/lungmask/full/dicom-series`,
  
  // 结节检测
  NODULE_DETECT: `${API_BASE}/nodule/detect`,
  
  // 病变识别
  LESION_CLASSIFY: `${API_BASE}/lesion/classify`,
  
  // 报告生成
  REPORT_GENERATE: `${API_BASE}/report/generate`,
  
  // 健康检查
  HEALTH_CHECK: `/health`
} as const;

export type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];
