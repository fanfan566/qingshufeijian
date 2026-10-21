/**
 * 肺部分割 API 服务 - SegMoTE（SAM ViT-B + Token-level MoE）
 * 返回结构与 lungmask 专业版保持一致，并额外附带 model_info 推理反馈
 */
import { apiRequest, type ApiResponse } from './apiService';
import { API_ENDPOINTS } from '../config/api';

export interface SegmentationValidation {
  passed: boolean;
  reason: string;
  warnings: string[];
}

export interface SegmentationStats {
  lung_area: number;                 // 肺部总面积估计值 (mm²)
  lung_percentage: number;           // 肺野占有效区域比例 (%)
  left_lung_area: number;            // 左肺面积估计值 (mm²)
  right_lung_area: number;           // 右肺面积估计值 (mm²)
  left_lung_percentage?: number;     // 左肺占肺野比例 (%)
  right_lung_percentage?: number;    // 右肺占肺野比例 (%)
  effective_area_pixels?: number;    // 有效CT区域像素数
  pixel_spacing_mm: number;          // 像素间距 (mm)
  confidence: number;                // 置信度
  validation?: SegmentationValidation; // 解剖学校验结果
  left_right_ratio?: number;
  left_lung_status?: 'normal' | 'abnormal' | 'warning';
  right_lung_status?: 'normal' | 'abnormal' | 'warning';
  ratio_reliable?: boolean;
  crop_warnings?: string[];
}

export interface CandidateSliceInfo {
  slice_index: number;
  kind: 'best' | 'previous' | 'next' | 'middle' | 'max_area' | 'manual';
  label: string;
  area?: number;
  is_selected?: boolean;
  score?: number | null;
  distance_to_mid?: number;
}

export interface SelectionMeta {
  method: string;
  bounding_box?: {
    z?: [number, number];
    y?: [number, number];
    x?: [number, number];
  } | null;
  z_mid?: number;
  z_range?: [number, number];
  search_radius?: number;
  candidate_debug?: Array<{
    slice_index: number;
    score: number;
    total_area: number;
    left_area: number;
    right_area: number;
    ratio: number;
    components_ok: boolean;
    distance_to_mid: number;
  }>;
}

export interface OrientationInfo {
  original_direction?: number[];
  original_size?: number[];
  normalized?: boolean;
  orientation_code_before?: string | null;
  orientation_code_after?: string | null;
  normalization_error?: string | null;
}

export interface SegmentationModelInfo {
  name: string;
  backbone: string;
  device: string;
  image_size: number;
  prompt_mode: string;
  loaded: boolean;
  load_error?: string | null;
  mean_foreground_probability: number; // 前景区域平均概率
  iou_pred: number;                    // SegMoTE IoU 预测头输出
  model_confidence: number;            // 模型置信度
  inference_time: number;              // 模型推理耗时 (s)
  foreground_pixels: number;
  inferred_slices?: number;
  total_slices?: number;
}

export interface SegmentationResult {
  result_image: string;
  original_image?: string;
  overlay_image?: string;
  mask_image?: string;
  comparison_image?: string;
  suspected_issue_regions?: string[];
  image_format: string;
  stats: SegmentationStats;
  model_type: string;
  processing_time: number;
  slice_index?: number;
  total_slices?: number;
  selected_by?: string;
  candidate_slices?: CandidateSliceInfo[];
  selection_meta?: SelectionMeta;
  orientation_info?: OrientationInfo;
  model_info?: SegmentationModelInfo;
}

export interface SegmentationConfig {
  enhance_contrast?: boolean;
  slice_index?: number;
}

export type SegmentationUploadKind = 'image' | 'dicom' | 'dicom-series';

const getRelativePath = (file: File): string => {
  const extendedFile = file as File & { webkitRelativePath?: string };
  return extendedFile.webkitRelativePath || file.name;
};

export const isDicomFile = (file: File) => {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.dcm') || fileName.endsWith('.dicom');
};

export const sortDicomSeriesFiles = (files: File[]) => {
  return [...files].sort((a, b) => {
    const pathA = getRelativePath(a).toLowerCase();
    const pathB = getRelativePath(b).toLowerCase();

    if (pathA !== pathB) {
      return pathA.localeCompare(pathB, undefined, { numeric: true, sensitivity: 'base' });
    }

    return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
};

/**
 * 普通图片分割（PNG/JPG）
 */
export async function analyzeSegmentationLungmaskImage(
  imageFile: File,
  config: SegmentationConfig = {
    enhance_contrast: true
  }
): Promise<ApiResponse<SegmentationResult>> {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('enhance_contrast', String(config.enhance_contrast ?? true));

  return apiRequest<SegmentationResult>(
    API_ENDPOINTS.SEGMOTE_SEGMENT_IMAGE,
    'POST',
    formData
  );
}

/**
 * 单个 DICOM 文件分割
 */
export async function analyzeSegmentationLungmaskDicom(
  dicomFile: File,
  config: SegmentationConfig = {}
): Promise<ApiResponse<SegmentationResult>> {
  const formData = new FormData();
  formData.append('file', dicomFile);

  if (typeof config.slice_index === 'number') {
    formData.append('slice_index', String(config.slice_index));
  }

  return apiRequest<SegmentationResult>(
    API_ENDPOINTS.SEGMOTE_SEGMENT_DICOM,
    'POST',
    formData
  );
}

/**
 * DICOM 序列（多文件 / 文件夹）分割
 */
export async function analyzeSegmentationLungmaskDicomSeries(
  dicomFiles: File[],
  config: SegmentationConfig = {}
): Promise<ApiResponse<SegmentationResult>> {
  const formData = new FormData();
  const sortedFiles = sortDicomSeriesFiles(dicomFiles).filter(isDicomFile);

  sortedFiles.forEach((file) => {
    formData.append('files', file, getRelativePath(file));
  });

  if (typeof config.slice_index === 'number') {
    formData.append('slice_index', String(config.slice_index));
  }

  return apiRequest<SegmentationResult>(
    API_ENDPOINTS.SEGMOTE_SEGMENT_DICOM_SERIES,
    'POST',
    formData
  );
}

/**
 * 向后兼容：根据文件类型自动选择上传链路
 */
export async function analyzeSegmentationLungmask(
  input: File | File[],
  config: SegmentationConfig = {
    enhance_contrast: true
  }
): Promise<ApiResponse<SegmentationResult>> {
  if (Array.isArray(input)) {
    return analyzeSegmentationLungmaskDicomSeries(input, config);
  }

  const isDicom = isDicomFile(input);

  if (isDicom) {
    return analyzeSegmentationLungmaskDicom(input, config);
  }

  return analyzeSegmentationLungmaskImage(input, config);
}
