import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Image as ImageIcon, Scan, FileText,
  CheckCircle2, Loader2, Sparkles, Activity,
  FileDown, Printer, RefreshCcw, Search, AlertCircle, Layers3, Eye, EyeOff, ShieldAlert, FolderOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  analyzeSegmentationLungmask,
  isDicomFile,
  sortDicomSeriesFiles,
  type SegmentationResult as LungmaskSegmentationResult
} from '../services/segmentationApi_lungmask';
import { detectNodules, drawNoduleMarkers, type NoduleDetectionResult, type NoduleInfo } from '../services/noduleApi';
import { classifyLesion, type LesionClassificationResult, type LesionInfo } from '../services/lesionApi';
import { generateReport, downloadReport, printReport, type ReportData, type PatientInfo } from '../services/reportApi';

type LungStatus = 'normal' | 'abnormal' | 'warning';
type SegmentationLayerType = 'original' | 'overlay' | 'mask' | 'comparison';
type UploadMode = 'image' | 'dicom' | 'dicom-series';

type SegmentationDisplayStats = {
  lungArea: number;
  leftLungArea: number;
  rightLungArea: number;
  lungPercentage: number;
  leftLungPercentage: number;
  rightLungPercentage: number;
  leftRightRatio: number | null;
  noduleCount: number;
};

const SEGMENTATION_REVIEW_STEPS = [
  '请检查原始图像是否包含完整双肺，确认未出现明显裁切或视野缺失。',
  '若左肺明显被截断，请重新上传包含完整胸部范围的图像。',
  '若图像完整，请手动复核 AI 分割掩膜是否正确覆盖双肺区域。'
];

const LUNG_PERCENTAGE_REFERENCE = '40% - 70%';
const LEFT_RIGHT_RATIO_REFERENCE = '0.55 - 1.45';

const formatPercentForDisplay = (
  value: number | null | undefined,
  options?: { hideWhenUnreliable?: boolean; unreliable?: boolean }
) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  if (options?.hideWhenUnreliable && options.unreliable) return '待复核';
  if (value <= 0.05) return '<0.1%';
  if (value >= 99.95) return '>99.9%';
  return `${value.toFixed(1)}%`;
};

const formatRatioForDisplay = (
  value: number | null | undefined,
  options?: { unreliable?: boolean }
) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  if (options?.unreliable) return '待复核';
  if (value > 9.99) return '>10.0';
  if (value < 0.1) return '<0.10';
  return value.toFixed(2);
};

const getLungPercentageStatus = (value: number, side: 'left' | 'right'): LungStatus => {
  if (side === 'left') {
    return value >= 35 && value <= 50 ? 'normal' : 'abnormal';
  }

  return value >= 50 && value <= 65 ? 'normal' : 'abnormal';
};

const getStatusBadgeClass = (status: LungStatus) => {
  if (status === 'normal') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'warning') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-red-100 text-red-700';
};

const getStatusText = (status: LungStatus) => {
  if (status === 'normal') {
    return '正常';
  }

  if (status === 'warning') {
    return '需关注';
  }

  return '异常';
};

const getLesionConfidenceMeta = (confidence: number) => {
  const confidencePercent = confidence * 100;

  if (confidencePercent >= 90) {
    return {
      label: '高置信度',
      description: '识别结果较稳定，可纳入重点结论参考',
      levelClassName: 'bg-emerald-100 text-emerald-700',
      textClassName: 'text-emerald-700',
      cardClassName: 'bg-slate-50',
      emphasisClassName: 'text-night-deep',
      shouldHighlight: true
    };
  }

  if (confidencePercent >= 70) {
    return {
      label: '中等置信度',
      description: '建议结合影像表现人工复核',
      levelClassName: 'bg-amber-100 text-amber-700',
      textClassName: 'text-amber-700',
      cardClassName: 'bg-amber-50/60 border border-amber-100',
      emphasisClassName: 'text-night-deep',
      shouldHighlight: true
    };
  }

  return {
    label: '低置信度',
    description: '低置信度提示，默认不自动纳入重点结论',
    levelClassName: 'bg-slate-100 text-slate-600',
    textClassName: 'text-slate-500',
    cardClassName: 'bg-slate-50/80 border border-slate-200 opacity-75',
    emphasisClassName: 'text-slate-500',
    shouldHighlight: false
  };
};

const getNoduleTypeText = (type: NoduleInfo['type']) => {
  if (type === 'solid') return '实性';
  if (type === 'ground_glass') return '磨玻璃';
  return '混合性';
};

const toDataUrl = (image?: string | null, format = 'png') => {
  if (!image) return null;
  if (image.startsWith('data:image')) return image;
  return `data:image/${format};base64,${image}`;
};

const getRelativePath = (inputFile: File) => {
  const fileWithPath = inputFile as File & { webkitRelativePath?: string };
  return fileWithPath.webkitRelativePath || inputFile.name;
};

const normalizeSelectedFiles = (files: File[]) => {
  const imageFiles = files.filter((item) => item.type.startsWith('image/'));
  const dicomFiles = sortDicomSeriesFiles(files.filter(isDicomFile));

  if (dicomFiles.length > 1) {
    return {
      mode: 'dicom-series' as UploadMode,
      file: dicomFiles[0] ?? null,
      dicomFiles,
      preview: `dicom://${dicomFiles.length}`
    };
  }

  if (dicomFiles.length === 1) {
    return {
      mode: 'dicom' as UploadMode,
      file: dicomFiles[0],
      dicomFiles: [],
      preview: 'dicom://1'
    };
  }

  const primaryImageFile = imageFiles[0] ?? files[0] ?? null;

  return {
    mode: 'image' as UploadMode,
    file: primaryImageFile,
    dicomFiles: [],
    preview: primaryImageFile ? URL.createObjectURL(primaryImageFile) : null
  };
};

const getAnatomySummary = (
  leftStatus: LungStatus,
  rightStatus: LungStatus,
  ratioReliable?: boolean,
  validationPassed?: boolean,
  leftRightRatio?: number | null
) => {
  const bothSidesNormal = leftStatus === 'normal' && rightStatus === 'normal';
  const ratioInRange =
    leftRightRatio !== null &&
    leftRightRatio !== undefined &&
    leftRightRatio >= 0.55 &&
    leftRightRatio <= 1.45;
  const ratioSeverelyAbnormal =
    leftRightRatio !== null &&
    leftRightRatio !== undefined &&
    (leftRightRatio < 0.55 || leftRightRatio > 1.45);

  if (ratioSeverelyAbnormal && (ratioReliable === false || validationPassed === false)) {
    const sideDescription =
      leftRightRatio < 0.55
        ? '左肺面积显著小于右肺'
        : '左肺面积显著大于右肺';

    return {
      status: 'abnormal' as const,
      text: `解剖学判断：面积比 ${leftRightRatio.toFixed(2)} 明显偏离参考范围 ${LEFT_RIGHT_RATIO_REFERENCE}，且当前分割可靠性不足，${sideDescription}。建议优先人工复核原始图像与掩膜，不采纳当前面积相关结论。`
    };
  }

  if (ratioSeverelyAbnormal) {
    const sideDescription =
      leftRightRatio < 0.55
        ? '左肺面积显著小于右肺'
        : '左肺面积显著大于右肺';

    return {
      status: 'warning' as const,
      text: `解剖学判断：面积比 ${leftRightRatio.toFixed(2)} 超出参考范围 ${LEFT_RIGHT_RATIO_REFERENCE}，${sideDescription}。这可能与个体差异、心脏阴影、体位或轻度分割偏差有关，建议结合原始图像人工复核。`
    };
  }

  if (ratioInRange && bothSidesNormal) {
    return {
      status: 'normal' as const,
      text: '解剖学判断：左右肺占比及面积比例均在参考范围内，当前分割结果可作为正常结构参考。'
    };
  }

  if (ratioInRange && !bothSidesNormal) {
    return {
      status: 'warning' as const,
      text: '解剖学判断：左右肺面积比处于参考范围，但单侧占比偏离典型范围，可能与心脏阴影、体位或边界识别有关，建议复核原始图像。'
    };
  }

  if (ratioReliable === false || validationPassed === false) {
    return {
      status: 'warning' as const,
      text: '解剖学判断：面积比可作为参考，但分割边界可能受裁切、边缘接触或识别不稳定影响，建议结合原始图像人工复核。'
    };
  }

  return {
    status: 'abnormal' as const,
    text: '解剖学判断：左右肺占比未同时满足正常范围，请结合原始影像复核。'
  };
};

export const SegmentationPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dicomFiles, setDicomFiles] = useState<File[]>([]);
  const [uploadMode, setUploadMode] = useState<UploadMode>('image');
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<'upload' | 'segment' | 'nodule' | 'lesion' | 'report'>('upload');

  const [segmentedImage, setSegmentedImage] = useState<string | null>(null);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<SegmentationLayerType>('original');
  const [showBoundary, setShowBoundary] = useState(true);

  const [nodules, setNodules] = useState<NoduleInfo[]>([]);
  const [lesions, setLesions] = useState<LesionInfo[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);

  const [segmentationResult, setSegmentationResult] = useState<LungmaskSegmentationResult | null>(null);
  const [noduleResult, setNoduleResult] = useState<NoduleDetectionResult | null>(null);
  const [lesionResult, setLesionResult] = useState<LesionClassificationResult | null>(null);

  const [stats, setStats] = useState<SegmentationDisplayStats | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resetAnalysisStates = () => {
    setSegmentedImage(null);
    setOverlayImage(null);
    setMaskImage(null);
    setSelectedLayer('original');
    setShowBoundary(true);
    setNodules([]);
    setLesions([]);
    setReport(null);
    setSegmentationResult(null);
    setNoduleResult(null);
    setLesionResult(null);
    setStats(null);
    setProcessingStage('upload');
  };

  const applySelectedFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }

    const normalized = normalizeSelectedFiles(selectedFiles);

    if (!normalized.file) {
      return;
    }

    setFile(normalized.file);
    setDicomFiles(normalized.dicomFiles);
    setUploadMode(normalized.mode);
    setPreview(normalized.preview);
    resetAnalysisStates();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter((item) => isDicomFile(item) || item.type.startsWith('image/'));
    applySelectedFiles(selectedFiles);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files || []).filter((item) => isDicomFile(item) || item.type.startsWith('image/'));
    applySelectedFiles(droppedFiles);
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = sortDicomSeriesFiles(Array.from(e.target.files || []).filter(isDicomFile));
    applySelectedFiles(selectedFiles);
    e.target.value = '';
  };

  const processImage = async () => {
    if (!file) return;

    setIsProcessing(true);

    try {
      setProcessingStage('segment');
      console.log('🔬 步骤 1/4: 肺部图像分割 (SegMoTE)...');

      const segmentationInput = uploadMode === 'dicom-series' ? dicomFiles : file;
      const segResponse = await analyzeSegmentationLungmask(segmentationInput, {
        enhance_contrast: uploadMode === 'image'
      });

      console.log('分割响应:', segResponse);

      if (!segResponse.success || !segResponse.data) {
        throw new Error(segResponse.message || '分割失败');
      }

      const segData = segResponse.data;
      console.log('分割数据:', segData);
      console.log('统计信息:', segData.stats);

      setSegmentationResult(segData);

      const imageFormat = segData.image_format || 'png';
      const originalImageUrl = toDataUrl(segData.original_image ?? segData.result_image, imageFormat);
      const resultImageUrl = toDataUrl(segData.result_image, imageFormat);
      const overlayImageUrl = toDataUrl(segData.overlay_image ?? segData.result_image, imageFormat);
      const maskImageUrl = toDataUrl(segData.mask_image ?? segData.result_image, imageFormat);

      setSegmentedImage(originalImageUrl);
      setOverlayImage(overlayImageUrl);
      setMaskImage(maskImageUrl);

      const lungArea = segData.stats.lung_area || 0;
      const leftLungArea = segData.stats.left_lung_area || 0;
      const rightLungArea = segData.stats.right_lung_area || 0;
      const lungPercentage = segData.stats.lung_percentage || 0;
      const leftLungPercentage =
        segData.stats.left_lung_percentage ??
        (lungArea > 0 ? (leftLungArea / lungArea) * 100 : 0);
      const rightLungPercentage =
        segData.stats.right_lung_percentage ??
        (lungArea > 0 ? (rightLungArea / lungArea) * 100 : 0);
      const leftRightRatio =
        segData.stats.left_right_ratio ??
        (rightLungArea > 0 ? leftLungArea / rightLungArea : null);

      const ratioReliable = segData.stats.ratio_reliable;
      const validationPassed = segData.stats.validation?.passed;
      const shouldHideSplitStats =
        ratioReliable === false ||
        leftLungPercentage >= 99.5 ||
        rightLungPercentage >= 99.5 ||
        leftLungPercentage <= 0.5 ||
        rightLungPercentage <= 0.5;
      const safeLeftLungPercentage = shouldHideSplitStats ? null : leftLungPercentage;
      const safeRightLungPercentage = shouldHideSplitStats ? null : rightLungPercentage;
      const safeLeftRightRatio = shouldHideSplitStats ? null : leftRightRatio;
      const hasAbnormalRatio =
        safeLeftRightRatio !== null && (safeLeftRightRatio < 0.55 || safeLeftRightRatio > 1.45);
      const shouldPrioritizeOverlay = ratioReliable === false || validationPassed === false || hasAbnormalRatio;

      setSelectedLayer(shouldPrioritizeOverlay ? 'overlay' : 'original');

      setStats({
        lungArea,
        leftLungArea,
        rightLungArea,
        lungPercentage,
        leftLungPercentage: safeLeftLungPercentage ?? 0,
        rightLungPercentage: safeRightLungPercentage ?? 0,
        leftRightRatio: safeLeftRightRatio,
        noduleCount: 0
      });

      console.log('✅ 肺部分割完成:', segData.stats);

      let noduleData: NoduleDetectionResult | null = null;
      let lesionData: LesionClassificationResult | null = null;
      const supportsImageOnlyAnalysis = uploadMode === 'image';

      if (supportsImageOnlyAnalysis) {
        setProcessingStage('nodule');
        console.log('🔍 步骤 2/4: 肺结节检测...');

        const noduleResponse = await detectNodules(file, segData.mask_image);

        if (noduleResponse.success && noduleResponse.data) {
          noduleData = noduleResponse.data;
          setNoduleResult(noduleData);
          console.log('结节数据:', noduleData);
          
          // 确保结节列表存在且格式正确
          if (noduleData.nodules && Array.isArray(noduleData.nodules)) {
            console.log('结节列表:', noduleData.nodules);
            setNodules(noduleData.nodules);
            const detectedNoduleCount = noduleData.nodules.length;
            setStats(prev => prev ? {
              ...prev,
              noduleCount: detectedNoduleCount
            } : null);
            console.log('✅ 结节检测完成:', detectedNoduleCount, '个结节');
          } else {
            console.error('结节数据格式错误:', noduleData.nodules);
            setNodules([]);
          }
        }

        setProcessingStage('lesion');
        console.log('🩺 步骤 3/4: 病变分类识别...');

        const lesionResponse = await classifyLesion(file, segData.mask_image);

        if (lesionResponse.success && lesionResponse.data) {
          lesionData = lesionResponse.data;
          setLesionResult(lesionData);
          setLesions(lesionData.lesions);
          console.log('✅ 病变识别完成:', lesionData.lesions);
        }
      } else {
        console.log('⏭️ DICOM / DICOM 序列模式下，暂跳过基于普通图像接口的结节检测与病变识别，避免格式不兼容导致误报。');
      }

      setProcessingStage('report');
      console.log('📄 步骤 4/4: 生成诊断报告...');

      const patientInfo: PatientInfo = {
        patient_id: 'PATIENT-001',
        patient_name: '张三',
        patient_age: 45,
        patient_gender: '男',
        examination_id: `EXAM-${Date.now()}`
      };

      if (segData && noduleData && lesionData) {
        const reportResponse = await generateReport({
          patient_info: patientInfo,
          segmentation: segData,
          nodules: noduleData,
          lesions: lesionData
        });

        if (reportResponse.success && reportResponse.data) {
          setReport(reportResponse.data.report);
          console.log('✅ 报告生成完成:', reportResponse.data.report.report_id);
        }
      } else {
        console.log('ℹ️ 当前仅完成肺部分割；因未获得完整结节/病变结果，已跳过自动报告生成。');
      }

      console.log('🎉 全部分析完成！');
    } catch (error) {
      console.error('❌ 分析失败:', error);
      alert('图像分析失败：' + (error as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingStage('upload');
    }
  };

  const handleDownloadReport = () => {
    if (!report) return;
    downloadReport(report, 'json');
  };

  const handlePrintReport = () => {
    if (!report) return;
    printReport(report);
  };

  const handleReset = () => {
    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }

    setFile(null);
    setDicomFiles([]);
    setUploadMode('image');
    setPreview(null);
    resetAnalysisStates();
  };

  const validation = segmentationResult?.stats?.validation;
  const modelInfo = segmentationResult?.model_info;
  const cropWarnings = segmentationResult?.stats?.crop_warnings || [];
  const ratioReliable = segmentationResult?.stats?.ratio_reliable;
  const suspectedIssueRegions = segmentationResult?.suspected_issue_regions || [];
  const splitStatsUnavailable =
    ratioReliable === false ||
    suspectedIssueRegions.includes('left_right_split_unreliable') ||
    suspectedIssueRegions.includes('single_component_split_by_midline') ||
    suspectedIssueRegions.includes('left_lung_missing') ||
    suspectedIssueRegions.includes('right_lung_missing');

  const leftStatus = splitStatsUnavailable
    ? 'warning'
    : segmentationResult?.stats?.left_lung_status || (stats ? getLungPercentageStatus(stats.leftLungPercentage, 'left') : 'warning');
  const rightStatus = splitStatsUnavailable
    ? 'warning'
    : segmentationResult?.stats?.right_lung_status || (stats ? getLungPercentageStatus(stats.rightLungPercentage, 'right') : 'warning');

  const segmentationAbnormal = useMemo(() => {
    const ratio = stats?.leftRightRatio;
    const ratioSeverelyOutOfRange = ratio !== null && ratio !== undefined && (ratio < 0.5 || ratio > 1.55);
    return ratioReliable === false || validation?.passed === false || ratioSeverelyOutOfRange;
  }, [ratioReliable, stats?.leftRightRatio, validation?.passed]);

  const anatomySummary = useMemo(
    () => getAnatomySummary(leftStatus, rightStatus, ratioReliable, validation?.passed, stats?.leftRightRatio),
    [leftStatus, ratioReliable, rightStatus, stats?.leftRightRatio, validation?.passed]
  );

  const noduleSummary = useMemo(() => {
    if (nodules.length === 0) {
      return {
        countText: '0 个（未检出明确结节）',
        largestSizeText: '不适用',
        densityTypeText: '不适用',
        locationText: '不适用',
        headline: '未检出明确结节'
      };
    }

    const sortedBySize = [...nodules].sort((a, b) => b.size - a.size);
    const largest = sortedBySize[0];
    const uniqueLocations = Array.from(new Set(nodules.map((nodule) => nodule.location).filter(Boolean)));
    const locationText = uniqueLocations.slice(0, 3).join('、');

    return {
      countText: `${nodules.length} 个`,
      largestSizeText: `${largest.size.toFixed(1)} mm`,
      densityTypeText: getNoduleTypeText(largest.type),
      locationText: locationText || largest.location || '--',
      headline: `共检出 ${nodules.length} 个结节，最大结节 ${largest.size.toFixed(1)} mm`
    };
  }, [nodules]);

  const reportSummary = useMemo(() => {
    const ratio = stats?.leftRightRatio;
    const lesionLines = lesions.map((lesion) => {
      const confidencePercent = Math.round(lesion.confidence * 100);
      return `${lesion.name}（${lesion.severity}，置信度${confidencePercent}%）`;
    });

    const impressionLines = [
      '诊断结论：',
      ...lesionLines.map((line) => `- ${line}`),
      nodules.length === 0 ? '- 未检出明确肺结节' : `- 检出 ${nodules.length} 个肺结节`
    ];

    const recommendationLines: string[] = [];

    if (ratio !== null && ratio !== undefined && (ratio < 0.55 || ratio > 1.45)) {
      recommendationLines.push(
        `因面积比严重异常（${ratio.toFixed(2)}），建议优先确认图像完整性或人工复核分割结果`,
        '若确认图像完整且双肺区域正确，建议临床评估是否存在单侧肺容积显著改变'
      );
    }

    lesions.forEach((lesion) => {
      if (lesion.name.includes('肺气肿')) {
        recommendationLines.push(`${lesion.severity}肺气肿：建议结合肺功能检查评估通气受限程度`);
      }

      if (lesion.name.includes('纤维')) {
        recommendationLines.push(`${lesion.severity}肺纤维化：建议结合临床症状与既往影像，必要时专科随诊`);
      }
    });

    if (recommendationLines.length === 0) {
      recommendationLines.push('建议结合临床表现与影像科医师意见综合判断。');
    }

    recommendationLines.push('建议 6-12 个月复查 CT，动态观察影像学变化。');

    return {
      impression: impressionLines.join('\n'),
      recommendations: Array.from(new Set(recommendationLines))
    };
  }, [lesions, nodules.length, stats?.leftRightRatio]);

  const activeSegmentationImage = useMemo(() => {
    if (selectedLayer === 'overlay') {
      return overlayImage || segmentedImage || (uploadMode === 'image' ? preview : null);
    }

    if (selectedLayer === 'mask') {
      return maskImage || segmentedImage || (uploadMode === 'image' ? preview : null);
    }

    if (selectedLayer === 'comparison') {
      return toDataUrl(segmentationResult?.comparison_image, segmentationResult?.image_format) || overlayImage || segmentedImage;
    }

    if (uploadMode !== 'image') {
      return segmentedImage || overlayImage || maskImage;
    }

    // 对于原图，使用 preview（如果有），否则使用 segmentedImage
    return preview || segmentedImage;
  }, [maskImage, overlayImage, preview, segmentedImage, selectedLayer, segmentationResult, uploadMode]);

  const selectionSummary = useMemo(() => {
    if (!file) return '';

    if (uploadMode === 'dicom-series') {
      const firstPath = dicomFiles[0] ? getRelativePath(dicomFiles[0]) : file.name;
      const folderName = firstPath.split('/')[0] || firstPath.split('\\')[0] || '已选文件夹';
      return `${folderName}（${dicomFiles.length} 个 DICOM 文件）`;
    }

    return file.name;
  }, [dicomFiles, file, uploadMode]);

  useEffect(() => {
    const folderInput = folderInputRef.current;
    if (!folderInput) return;

    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
    folderInput.setAttribute('multiple', '');
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!canvasRef.current || !activeSegmentationImage) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawLungLabel = (
      context: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      color: string,
      align: CanvasTextAlign = 'left'
    ) => {
      context.save();
      context.font = 'bold 20px sans-serif';
      context.textAlign = align;
      context.textBaseline = 'top';
      const metrics = context.measureText(text);
      const paddingX = 10;
      const paddingY = 6;
      const width = metrics.width + paddingX * 2;
      const height = 34;
      const startX = align === 'right' ? x - width : x;
      context.fillStyle = 'rgba(15, 23, 42, 0.65)';
      context.fillRect(startX, y, width, height);
      context.fillStyle = color;
      context.fillText(text, align === 'right' ? x - paddingX : x + paddingX, y + paddingY);
      context.restore();
    };

    const img = new Image();
    img.src = activeSegmentationImage;
    img.onload = () => {
      try {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        if (selectedLayer === 'overlay' || selectedLayer === 'mask') {
          if (splitStatsUnavailable) {
            drawLungLabel(ctx, '肺区A', 20, 20, '#ef4444', 'left');
            drawLungLabel(ctx, '肺区B', canvas.width - 20, 20, '#10b981', 'right');
          } else {
            drawLungLabel(ctx, '左肺', 20, 20, '#ef4444', 'left');
            drawLungLabel(ctx, '右肺', canvas.width - 20, 20, '#10b981', 'right');
          }
        }

        // 始终绘制结节标记，无论选择哪个图层
        if (showBoundary && nodules.length > 0) {
          console.log('准备绘制结节标记:', nodules.length, '个结节');
          console.log('结节数据:', nodules);
          console.log('图像尺寸:', img.width, 'x', img.height);
          
          // 使用前端绘制，避免后端图像导致的问题
          console.log('使用前端绘制结节标记');
          drawNoduleMarkers(ctx, nodules, img.width, img.height);
          console.log('前端结节标记绘制完成');
        } else {
          console.log('未绘制结节标记:', { showBoundary, nodulesLength: nodules.length });
        }
      } catch (error) {
        console.error('绘制过程中出错:', error);
      }
    };
  }, [activeSegmentationImage, nodules, selectedLayer, showBoundary, splitStatsUnavailable]);

  return (
    <div className="min-h-screen bg-brand-bg p-10 relative">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-end justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-night-sky/10 text-night-sky px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">
              <Activity size={14} />
              <span>AI 影像分析中心</span>
            </div>
            <h2 className="text-4xl font-black text-night-deep">智能医学图像分析</h2>
            <p className="text-slate-400 font-medium">上传 CT 扫描图像，AI 自动完成肺部分割、结节检测、病变识别并生成诊断报告。</p>
          </div>

          <div className="flex gap-3">
            {report && (
              <>
                <button
                  onClick={handleDownloadReport}
                  className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-night-royal hover:bg-night-royal/10 shadow-sm transition-all"
                  title="下载报告"
                >
                  <FileDown size={20} />
                </button>
                <button
                  onClick={handlePrintReport}
                  className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-night-royal hover:bg-night-royal/10 shadow-sm transition-all"
                  title="打印报告"
                >
                  <Printer size={20} />
                </button>
                <button
                  onClick={handleReset}
                  className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-sm transition-all"
                  title="重新分析"
                >
                  <RefreshCcw size={20} />
                </button>
              </>
            )}
          </div>
        </header>

        {isProcessing && (
          <div className="soft-card p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-night-deep">AI 分析进行中...</span>
              <span className="text-xs font-medium text-slate-400">
                {processingStage === 'segment' && '肺部图像分割'}
                {processingStage === 'nodule' && '肺结节检测'}
                {processingStage === 'lesion' && '病变分类识别'}
                {processingStage === 'report' && '生成诊断报告'}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-night-royal to-night-pink"
                initial={{ width: '0%' }}
                animate={{
                  width: processingStage === 'segment' ? '25%' :
                    processingStage === 'nodule' ? '50%' :
                      processingStage === 'lesion' ? '75%' : '100%'
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={cn(
                'soft-card p-8 flex flex-col items-center justify-center transition-all cursor-pointer group relative overflow-hidden',
                file ? 'border-night-royal/20 bg-night-royal/[0.02]' : 'border-dashed border-slate-200 hover:border-night-royal/30'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,.dcm,.dicom"
                multiple
                className="hidden"
              />
              <input
                type="file"
                ref={folderInputRef}
                onChange={handleFolderChange}
                accept=".dcm,.dicom"
                multiple
                className="hidden"
              />

              <div className={cn(
                'w-20 h-20 rounded-[28px] flex items-center justify-center mb-4 transition-all group-hover:scale-110',
                file ? 'bg-night-royal text-white shadow-xl shadow-night-royal/20' : 'bg-slate-50 text-slate-400'
              )}>
                <Upload size={32} />
              </div>

              <div className="text-center">
                <p className="text-base font-black text-night-deep mb-1">
                  {file ? selectionSummary : '点击或拖拽上传'}
                </p>
                <p className="text-xs text-slate-400 font-medium">
                  支持 PNG/JPG、单个 DICOM、DICOM 文件夹 / 序列
                </p>
              </div>
            </div>

            <div className="soft-card p-6 space-y-4">
              <h3 className="text-base font-black text-night-deep flex items-center gap-2">
                <Sparkles size={18} className="text-night-pink" />
                分析项目
              </h3>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="w-full py-3 rounded-2xl font-black transition-all border border-night-royal/20 text-night-royal bg-night-royal/5 hover:bg-night-royal/10 inline-flex items-center justify-center gap-2"
                >
                  <FolderOpen size={18} />
                  选择 DICOM 文件夹 / 序列
                </button>

                {[
                  { name: '肺部图像分割', icon: '🫁' },
                  { name: '肺结节检测', icon: '🔍' },
                  { name: '病变分类识别', icon: '🩺' },
                  { name: '自动生成报告', icon: '📄' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-sm font-bold text-slate-600">{item.name}</span>
                    <CheckCircle2 size={16} className="ml-auto text-emerald-500" />
                  </div>
                ))}
              </div>

              <button
                disabled={!file || isProcessing}
                onClick={processImage}
                className={cn(
                  'w-full py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-3',
                  !file || isProcessing
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-night-royal to-night-pink text-white shadow-xl shadow-night-royal/20 hover:scale-[1.02] hover:shadow-2xl'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    正在分析...
                  </>
                ) : (
                  <>
                    <Scan size={20} />
                    开始 AI 分析
                  </>
                )}
              </button>
            </div>

            {stats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="soft-card p-6 space-y-4"
              >
                <h3 className="text-base font-black text-night-deep">定量分析结果</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">肺野占有效区域比例</span>
                      <span className="text-sm font-black text-night-deep">{formatPercentForDisplay(stats.lungPercentage)}</span>
                  </div>

                  <div className="text-[11px] leading-5 text-slate-400 bg-slate-50 rounded-xl px-3 py-2 space-y-1">
                    <div>正常参考：{LUNG_PERCENTAGE_REFERENCE}。</div>
                    <div>本次结果为 {stats.lungPercentage.toFixed(1)}%，若明显偏低，通常提示背景区域过大、胸部未居中，或肺区域在图中占比偏小。</div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">左肺占比</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-night-deep">
                        {formatPercentForDisplay(splitStatsUnavailable ? null : stats.leftLungPercentage, { hideWhenUnreliable: true, unreliable: splitStatsUnavailable })}
                      </span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', getStatusBadgeClass(leftStatus))}>
                        {getStatusText(leftStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">右肺占比</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-night-deep">
                        {formatPercentForDisplay(splitStatsUnavailable ? null : stats.rightLungPercentage, { hideWhenUnreliable: true, unreliable: splitStatsUnavailable })}
                      </span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', getStatusBadgeClass(rightStatus))}>
                        {getStatusText(rightStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">左 / 右肺面积比</span>
                    <span className={cn(
                      'text-sm font-black',
                      segmentationAbnormal ? 'text-red-600' : 'text-night-deep'
                    )}>
                      {formatRatioForDisplay(splitStatsUnavailable ? null : stats.leftRightRatio, { unreliable: splitStatsUnavailable })}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 space-y-1">
                    <div>左右肺面积比参考范围：{LEFT_RIGHT_RATIO_REFERENCE}（优先参考面积比，避免截图缩放影响）</div>
                  </div>

                  <div className={cn(
                    'p-3 rounded-xl text-xs font-bold border',
                    anatomySummary.status === 'normal'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : anatomySummary.status === 'warning'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  )}>
                    {anatomySummary.text}
                  </div>

                  {validation && (
                    <div className={cn(
                      'mt-3 p-3 rounded-xl text-xs font-bold border',
                      anatomySummary.status === 'abnormal'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : anatomySummary.status === 'warning'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    )}>
                      <div className="flex items-center gap-1 mb-1">
                        {anatomySummary.status === 'abnormal' ? '⚠️' : anatomySummary.status === 'warning' ? '🔎' : '✅'}
                        <span>
                          {anatomySummary.status === 'abnormal'
                            ? '解剖学判断：异常或需复核'
                            : anatomySummary.status === 'warning'
                              ? '解剖学判断：比例正常，建议复核'
                              : '解剖学判断：正常'}
                        </span>
                      </div>
                      {((!validation.passed && validation.reason) || (stats?.leftRightRatio !== null && stats?.leftRightRatio !== undefined && (stats.leftRightRatio < 0.55 || stats.leftRightRatio > 1.45))) && (
                        <div className="mt-2 text-[11px] font-medium space-y-1">
                          {!validation.passed && validation.reason && (
                            <div>{validation.reason}</div>
                          )}
                          {!splitStatsUnavailable && stats?.leftRightRatio !== null && stats?.leftRightRatio !== undefined && (stats.leftRightRatio < 0.55 || stats.leftRightRatio > 1.45) && (
                            <div>左右肺面积比 {formatRatioForDisplay(stats.leftRightRatio)} 明显偏离参考范围（{LEFT_RIGHT_RATIO_REFERENCE}），不能判定为正常。</div>
                          )}
                        </div>
                      )}
                      {anatomySummary.status === 'abnormal' && (
                        <div className="mt-3 space-y-1 text-[11px] font-medium">
                          {(validation.warnings || []).map((warning: string, i: number) => (
                            <div key={i} className="pl-2 border-l-2 border-red-300">
                              • {warning}
                            </div>
                          ))}
                          <div className="pt-1 text-red-800">建议操作：</div>
                          {SEGMENTATION_REVIEW_STEPS.map((step, index) => (
                            <div key={step} className="pl-2 border-l-2 border-red-300">
                              {index + 1}. {step}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {modelInfo && (
                    <div className="mt-3 p-3 rounded-xl text-[11px] bg-indigo-50 text-indigo-800 border border-indigo-200 space-y-1">
                      <div className="text-xs font-bold mb-1">🧠 模型推理反馈：{modelInfo.name}</div>
                      <div className="text-slate-600">{modelInfo.backbone}</div>
                      <div className="flex justify-between"><span>模型置信度</span><span className="font-bold">{(modelInfo.model_confidence * 100).toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span>前景平均概率</span><span className="font-bold">{(modelInfo.mean_foreground_probability * 100).toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span>IoU 预测</span><span className="font-bold">{modelInfo.iou_pred.toFixed(3)}</span></div>
                      <div className="flex justify-between"><span>推理耗时</span><span className="font-bold">{modelInfo.inference_time.toFixed(2)}s（{modelInfo.device}）</span></div>
                      {typeof modelInfo.inferred_slices === 'number' && (
                        <div className="flex justify-between"><span>推理层数</span><span className="font-bold">{modelInfo.inferred_slices} / {modelInfo.total_slices}</span></div>
                      )}
                    </div>
                  )}

                  {uploadMode === 'image' && ratioReliable === false && anatomySummary.status !== 'normal' && (
                    <div className="p-3 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <div className="flex items-center gap-1">
                        <AlertCircle size={14} />
                        <span>左右肺占比关系可能受图像裁切影响，当前结果不宜作为稳定比例判断依据。</span>
                      </div>
                    </div>
                  )}

                  {uploadMode === 'image' && cropWarnings.length > 0 && anatomySummary.status !== 'normal' && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-2">
                      <div className="font-bold flex items-center gap-1">
                        <ShieldAlert size={14} />
                        裁切/边缘接触高优先级提示
                      </div>
                      <div className="text-[11px] font-medium">
                        当前肺野面积及左右肺比例可能被低估或不可靠，请优先结合原始影像人工复核。
                      </div>
                      {cropWarnings.map((warning, index) => (
                        <div key={index}>• {warning}</div>
                      ))}
                    </div>
                  )}

                  {uploadMode === 'image' && suspectedIssueRegions.length > 0 && anatomySummary.status !== 'normal' && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 space-y-2">
                      <div className="font-bold flex items-center gap-1">
                        <AlertCircle size={14} />
                        疑似分割异常区域
                      </div>
                      <div className="text-[11px] font-medium">
                        以下区域可能存在分割不稳定或结构异常，请重点复核：
                      </div>
                      {suspectedIssueRegions.map((issue, index) => (
                        <div key={index}>• {issue}</div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium text-slate-500">结节检测结果</span>
                    <span className={cn(
                      'text-sm font-black px-2 py-1 rounded-full',
                      stats.noduleCount === 0 ? 'bg-emerald-100 text-emerald-600' :
                        stats.noduleCount <= 2 ? 'bg-amber-100 text-amber-600' :
                          'bg-red-100 text-red-600'
                    )}>
                      {stats.noduleCount === 0 ? '0 个（未检出明确结节）' : `${stats.noduleCount} 个`}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="soft-card p-4 min-h-[600px] relative bg-slate-50/50">
              <AnimatePresence mode="wait">
                {!file ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center space-y-4 py-32"
                  >
                    <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center text-slate-200 mx-auto shadow-sm">
                      <ImageIcon size={48} />
                    </div>
                    <p className="text-slate-400 font-bold">等待影像上传...</p>
                  </motion.div>
                ) : isProcessing && uploadMode === 'image' && preview ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-6 w-full max-w-md absolute inset-0 m-auto"
                  >
                    <div className="relative w-full aspect-square rounded-[40px] overflow-hidden shadow-2xl">
                      <img src={preview} alt="Processing" className="w-full h-full object-cover blur-sm" />
                      <div className="absolute inset-0 bg-night-royal/20 flex items-center justify-center">
                        <div className="w-full h-1 bg-white/30 relative overflow-hidden">
                          <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: '100%' }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                            className="absolute inset-0 bg-white shadow-[0_0_20px_rgba(255,255,255,1)]"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-xl font-black text-night-deep">正在识别肺部结构</p>
                      <p className="text-sm text-slate-400 font-medium">AI 正在逐层扫描并标注潜在异常区域</p>
                    </div>
                  </motion.div>
                ) : segmentedImage ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full h-full p-4"
                  >
                    <div className="space-y-3">
                      <div className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">
                        {uploadMode === 'image' ? '原始影像' : '输入信息'}
                      </div>
                      <div className="rounded-[24px] overflow-hidden shadow-xl border-2 border-white h-[500px] bg-black/5">
                        {uploadMode === 'image' && preview ? (
                          <img src={preview} alt="Original" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-8">
                            <div className="w-20 h-20 rounded-[24px] bg-night-royal/10 text-night-royal flex items-center justify-center">
                              <Scan size={34} />
                            </div>
                            <div className="space-y-2">
                              <p className="text-xl font-black text-night-deep">
                                {uploadMode === 'dicom-series' ? 'DICOM 文件夹 / 序列已加载' : 'DICOM 文件已加载'}
                              </p>
                              <p className="text-sm text-slate-500 font-medium">
                                {uploadMode === 'dicom-series'
                                  ? `当前共选择 ${dicomFiles.length} 个序列文件，将按排序后的序列执行肺部分割。`
                                  : `当前文件：${file?.name || '--'}，将按 2D 切片执行肺部分割。`}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-2">
                        <div className="text-xs font-black text-night-royal uppercase tracking-widest">分割可视化结果</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {[
                            { key: 'original', label: '原图' },
                            { key: 'overlay', label: 'AI叠加图' },
                            { key: 'mask', label: '纯掩膜图' },
                            { key: 'comparison', label: '三联对比图' }
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setSelectedLayer(item.key as SegmentationLayerType)}
                              className={cn(
                                'px-3 py-1.5 rounded-full text-[11px] font-bold transition-all',
                                selectedLayer === item.key
                                  ? 'bg-night-royal text-white shadow-lg shadow-night-royal/20'
                                  : 'bg-white text-slate-500 hover:text-night-royal'
                              )}
                            >
                              {item.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setShowBoundary(prev => !prev)}
                            className={cn(
                              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all',
                              showBoundary
                                ? 'bg-night-pink text-white shadow-lg shadow-night-pink/20'
                                : 'bg-white text-slate-500 hover:text-night-pink'
                            )}
                          >
                            {showBoundary ? <EyeOff size={12} /> : <Eye size={12} />}
                            {showBoundary ? '隐藏分割边界/标记' : '显示分割边界/标记'}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 px-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-700 border border-red-200">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                          {splitStatsUnavailable ? '肺区掩膜 A：红色（分侧待复核）' : '左肺区域：红色'}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          {splitStatsUnavailable ? '肺区掩膜 B：绿色（分侧待复核）' : '右肺区域：绿色'}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 border border-slate-200">
                          <Layers3 size={12} />
                          可切换原图 / AI叠加图 / 掩膜图
                        </div>
                      </div>

                      <div className="rounded-[24px] overflow-hidden shadow-xl border-2 border-night-royal/20 h-[500px] relative bg-black/5">
                        <canvas ref={canvasRef} className="w-full h-full object-cover" />

                        <div className="absolute top-4 left-4 flex flex-col gap-2 max-w-[88%]">
                          <div className="glass-card px-3 py-2 rounded-xl text-[10px] font-bold text-night-deep flex items-center gap-1">
                            <Layers3 size={12} />
                            <span>
                              当前视图：
                              {selectedLayer === 'original'
                                ? '原图'
                                : selectedLayer === 'overlay'
                                  ? 'AI叠加图'
                                  : selectedLayer === 'mask'
                                    ? '纯掩膜图'
                                    : '三联对比图'}
                            </span>
                          </div>

                          {uploadMode === 'image' && anatomySummary.status !== 'normal' && (
                            <div className="glass-card px-3 py-2 rounded-xl border border-red-200/70 bg-red-50/90 text-[10px] font-bold text-red-700">
                              <div className="flex items-start gap-1">
                                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                                <span>分割异常警告：1.检查原图是否包含完整双肺；2.若左肺明显被截断请重新上传完整图像；3.若图像完整请手动复核 AI 分割掩膜。</span>
                              </div>
                            </div>
                          )}

                          {cropWarnings.length > 0 && anatomySummary.status !== 'normal' && (
                            <div className="glass-card px-3 py-2 rounded-xl border border-amber-200/70 bg-amber-50/90 text-[10px] font-bold text-amber-800">
                              裁切提示：面积可能被低估，左右肺比例可能不可靠
                            </div>
                          )}

                          {uploadMode === 'image' && suspectedIssueRegions.length > 0 && anatomySummary.status !== 'normal' && (
                            <div className="glass-card px-3 py-2 rounded-xl border border-red-200/70 bg-red-50/90 text-[10px] font-bold text-red-700">
                              疑似异常区域：{suspectedIssueRegions.slice(0, 2).join('；')}
                              {suspectedIssueRegions.length > 2 ? ' 等' : ''}
                            </div>
                          )}
                        </div>

                        <div className="absolute bottom-4 left-4 right-4 space-y-2">
                          <div className="glass-card p-3 rounded-xl">
                            <div className="text-xs font-bold text-night-deep">
                              {nodules.length === 0 ? '当前未检出明确结节，可继续结合其他病灶识别与报告结论综合判断。' : noduleSummary.headline}
                            </div>
                          </div>

                          <div className="glass-card p-3 rounded-xl">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-bold text-night-deep">
                                左 / 右肺面积比：{formatRatioForDisplay(stats?.leftRightRatio, { unreliable: ratioReliable === false })}
                              </span>
                              <span className={cn(
                                'text-[10px] font-bold',
                                anatomySummary.status === 'abnormal'
                                  ? 'text-red-600'
                                  : anatomySummary.status === 'warning'
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                              )}>
                                {anatomySummary.status === 'abnormal'
                                  ? '异常/待复核'
                                  : anatomySummary.status === 'warning'
                                    ? '比例正常，建议复核'
                                    : '比例可参考'}
                              </span>
                            </div>
                          </div>

                          {ratioReliable === false && anatomySummary.status !== 'normal' && (
                            <div className="glass-card p-3 rounded-xl border border-amber-200/60">
                              <div className="text-[10px] font-bold text-amber-700">
                                图像边缘接触提示：左右肺占比关系可能不可靠
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full h-full p-8 flex items-center justify-center"
                  >
                    {uploadMode === 'image' && preview ? (
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-w-full max-h-[600px] rounded-[40px] shadow-2xl border-4 border-white"
                      />
                    ) : (
                      <div className="max-w-xl w-full rounded-[40px] shadow-2xl border-4 border-white bg-white p-10 text-center space-y-4">
                        <div className="w-20 h-20 rounded-[24px] bg-night-royal/10 text-night-royal flex items-center justify-center mx-auto">
                          <Scan size={34} />
                        </div>
                        <p className="text-2xl font-black text-night-deep">
                          {uploadMode === 'dicom-series' ? 'DICOM 文件夹 / 序列待分析' : 'DICOM 待分析'}
                        </p>
                        <p className="text-sm text-slate-500 font-medium">
                          {uploadMode === 'dicom-series'
                            ? `已选择 ${dicomFiles.length} 个 DICOM 文件。点击“开始 AI 分析”后，系统会读取完整序列并返回分割结果。`
                            : '已选择单个 DICOM 文件。点击“开始 AI 分析”后，系统会读取切片并返回 2D 分割结果。'}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 xl:grid-cols-2 gap-6"
            >
              <div className="soft-card p-6">
                <h3 className="text-base font-black text-night-deep mb-4 flex items-center gap-2">
                  <Search size={18} className="text-night-royal" />
                  结节检测摘要
                </h3>
                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
                    <div className="text-[10px] font-medium text-slate-400">结节检测结果</div>
                    <div className="text-sm font-black text-night-deep">{noduleSummary.countText}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">最大结节大小</div>
                    <div className="text-sm font-black text-night-deep">{noduleSummary.largestSizeText}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-medium text-slate-400">主要密度类型</div>
                    <div className="text-sm font-black text-night-deep">{noduleSummary.densityTypeText}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
                    <div className="text-[10px] font-medium text-slate-400">位置概览</div>
                    <div className="text-sm font-black text-night-deep">{noduleSummary.locationText}</div>
                  </div>
                </div>
                {nodules.length > 0 ? (
                  <div className="space-y-3 max-h-[240px] overflow-y-auto">
                    {nodules.map((nodule, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-night-deep">结节 #{i + 1}</span>
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            nodule.malignancy_risk === 'low' ? 'bg-emerald-100 text-emerald-600' :
                              nodule.malignancy_risk === 'medium' ? 'bg-amber-100 text-amber-600' :
                                'bg-red-100 text-red-600'
                          )}>
                            {nodule.malignancy_risk === 'low' ? '低风险' :
                              nodule.malignancy_risk === 'medium' ? '中低风险' : '高风险'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 space-y-1">
                          <div>类型：{getNoduleTypeText(nodule.type)}</div>
                          <div>大小：{nodule.size.toFixed(1)} mm</div>
                          <div>位置：{nodule.location}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold">
                    结节检测结果：0 个（未检出明确结节）
                  </div>
                )}
              </div>

              <div className="soft-card p-6">
                <h3 className="text-base font-black text-night-deep mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-night-pink" />
                  其他病变识别
                </h3>
                {lesions.length > 0 ? (
                  <div className="space-y-3 max-h-[240px] overflow-y-auto">
                    {lesions.map((lesion, i) => {
                      const confidenceMeta = getLesionConfidenceMeta(lesion.confidence);

                      return (
                        <div key={i} className={cn('p-3 rounded-xl', confidenceMeta.cardClassName)}>
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <span className={cn('text-xs font-bold', confidenceMeta.emphasisClassName)}>{lesion.name}</span>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                lesion.severity === '轻度' ? 'bg-emerald-100 text-emerald-600' :
                                  lesion.severity === '中度' ? 'bg-amber-100 text-amber-600' :
                                    'bg-red-100 text-red-600'
                              )}>
                                {lesion.severity}
                              </span>
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', confidenceMeta.levelClassName)}>
                                {confidenceMeta.label}
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 space-y-1">
                            <div>置信度：{(lesion.confidence * 100).toFixed(1)}%</div>
                            <div className={cn('font-medium', confidenceMeta.textClassName)}>
                              {confidenceMeta.description}
                            </div>
                            {lesion.confidence >= 0.7 && lesion.confidence < 0.9 && (
                              <div className="text-amber-700 font-medium">
                                该结果处于复核区间，建议由影像科医师结合原图进一步确认。
                              </div>
                            )}
                            {!confidenceMeta.shouldHighlight && (
                              <div className="text-slate-400">
                                该结果已视觉弱化展示，不作为默认重点报告结论，请结合临床与原始影像综合判断。
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 text-slate-500 text-sm font-bold">
                    暂无明确病变识别结果
                  </div>
                )}
              </div>
            </motion.div>

            {report && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="soft-card p-6 bg-gradient-to-br from-night-royal/5 to-night-pink/5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-night-deep flex items-center gap-2">
                    <FileText size={20} className="text-night-royal" />
                    诊断报告摘要
                  </h3>
                  <span className="text-xs font-bold text-slate-400">{report.report_id}</span>
                </div>

                <div className="prose prose-sm max-w-none">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-2">定量分析</div>
                      <div className="space-y-2 text-sm text-slate-700">
                        <div className="flex justify-between gap-4">
                          <span>肺野占比</span>
                          <span className="font-bold text-night-deep">{formatPercentForDisplay(stats?.lungPercentage)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>左肺占比</span>
                          <span className="font-bold text-night-deep">
                            {formatPercentForDisplay(splitStatsUnavailable ? null : stats?.leftLungPercentage, { hideWhenUnreliable: true, unreliable: splitStatsUnavailable })}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>右肺占比</span>
                          <span className="font-bold text-night-deep">
                            {formatPercentForDisplay(splitStatsUnavailable ? null : stats?.rightLungPercentage, { hideWhenUnreliable: true, unreliable: splitStatsUnavailable })}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>左/右肺面积比</span>
                          <span className={cn('font-bold', segmentationAbnormal ? 'text-red-600' : 'text-night-deep')}>
                            {formatRatioForDisplay(splitStatsUnavailable ? null : stats?.leftRightRatio, { unreliable: splitStatsUnavailable })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-2">结节检测</div>
                      <div className="space-y-2 text-sm text-slate-700">
                        <div className="flex justify-between gap-4">
                          <span>结节数量</span>
                          <span className="font-bold text-night-deep">{noduleSummary.countText}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>最大结节</span>
                          <span className="font-bold text-night-deep">{noduleSummary.largestSizeText}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>主要密度</span>
                          <span className="font-bold text-night-deep">{noduleSummary.densityTypeText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-2">病变识别</div>
                      <div className="space-y-2 text-sm text-slate-700">
                        {lesions.length > 0 ? lesions.map((lesion) => (
                          <div key={`${lesion.name}-${lesion.severity}`} className="flex justify-between gap-4">
                            <span>{lesion.name}</span>
                            <span className="font-bold text-night-deep">
                              {lesion.severity} / {(lesion.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        )) : (
                          <div className="text-slate-500">暂无明确病变识别结果</div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-2">解剖学判断</div>
                      <div className={cn(
                        'text-sm leading-6 font-medium',
                        anatomySummary.status === 'normal'
                          ? 'text-emerald-700'
                          : anatomySummary.status === 'warning'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      )}>
                        {anatomySummary.text}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-4">
                    <div className="p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-1">Lung-RADS 分类</div>
                      <div className="text-2xl font-black text-night-royal">{report.birads_category}</div>
                    </div>

                    <div className="p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-2">总体建议</div>
                      <ul className="text-sm font-medium text-night-deep space-y-1 list-disc pl-5">
                        {reportSummary.recommendations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="xl:col-span-2 p-4 bg-white rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-2">诊断结论</div>
                      <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans m-0">
                        {reportSummary.impression}
                      </pre>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
