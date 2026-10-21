/**
 * 诊断报告生成 API 服务
 */
import { apiRequest, type ApiResponse } from './apiService';
import { API_ENDPOINTS } from '../config/api';
import type { SegmentationResult } from './segmentationApi';
import type { SegmentationResult as LungmaskSegmentationResult } from './segmentationApi_lungmask';
import type { NoduleDetectionResult } from './noduleApi';
import type { LesionClassificationResult } from './lesionApi';

export interface PatientInfo {
  patient_id: string;
  patient_name: string;
  patient_age: number;
  patient_gender: string;
  examination_id?: string;
}

export interface ReportData {
  report_id: string;
  examination_date: string;
  patient_info: PatientInfo;
  examination_findings: {
    lung_segmentation: {
      total_lung_area: number;
      lung_percentage: number;
      left_right_ratio: number;
    };
    pulmonary_nodules: {
      detected: number;
      details: any[];
      risk_assessment: string;
    };
    lung_lesions: {
      detected: number;
      primary_diagnosis: string;
      severity: string;
    };
  };
  impression: string;
  recommendations: string[];
  radiologist: string;
  review_status: string;
  birads_category: string;
}

export interface GenerateReportRequest {
  patient_info: PatientInfo;
  segmentation: SegmentationResult | LungmaskSegmentationResult;
  nodules: NoduleDetectionResult;
  lesions: LesionClassificationResult;
}

/**
 * 生成诊断报告
 */
export async function generateReport(
  requestData: GenerateReportRequest
): Promise<ApiResponse<{ report: ReportData; report_json: string }>> {
  const payload = {
    patient_info: requestData.patient_info,
    segmentation: requestData.segmentation,
    nodules: requestData.nodules,
    lesions: requestData.lesions
  };

  return apiRequest<{ report: ReportData; report_json: string }>(
    API_ENDPOINTS.REPORT_GENERATE,
    'POST',
    payload
  );
}

/**
 * 下载报告 PDF
 */
export function downloadReport(report: ReportData, format: 'json' | 'txt' = 'json'): void {
  let content: string;
  let mimeType: string;
  let extension: string;

  if (format === 'json') {
    content = JSON.stringify(report, null, 2);
    mimeType = 'application/json';
    extension = 'json';
  } else {
    // 文本格式
    content = formatReportAsText(report);
    mimeType = 'text/plain';
    extension = 'txt';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `report_${report.report_id}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 将报告格式化为文本
 */
function formatReportAsText(report: ReportData): string {
  const lines = [
    '='.repeat(60),
    '肺部 CT 影像分析报告',
    '='.repeat(60),
    '',
    `报告编号：${report.report_id}`,
    `检查日期：${report.examination_date}`,
    '',
    '患者信息:',
    `  姓名：${report.patient_info.patient_name}`,
    `  年龄：${report.patient_info.patient_age}`,
    `  性别：${report.patient_info.patient_gender}`,
    `  ID: ${report.patient_info.patient_id}`,
    '',
    '-'.repeat(60),
    '影像学表现:',
    '-'.repeat(60),
    '',
    '【肺部分割】',
    `  肺部总面积：${report.examination_findings.lung_segmentation.total_lung_area} px²`,
    `  肺部占比：${report.examination_findings.lung_segmentation.lung_percentage}%`,
    `  左右肺比例：${report.examination_findings.lung_segmentation.left_right_ratio}`,
    '',
    '【肺结节】',
    `  检出数量：${report.examination_findings.pulmonary_nodules.detected}`,
    `  风险评估：${report.examination_findings.pulmonary_nodules.risk_assessment}`,
    '',
    '【肺部病变】',
    `  主要诊断：${report.examination_findings.lung_lesions.primary_diagnosis}`,
    `  严重程度：${report.examination_findings.lung_lesions.severity}`,
    '',
    '-'.repeat(60),
    '诊断意见:',
    '-'.repeat(60),
    report.impression,
    '',
    '-'.repeat(60),
    '建议:',
    '-'.repeat(60),
    ...report.recommendations.map(r => `  • ${r}`),
    '',
    '-'.repeat(60),
    `BI-RADS 分级：${report.birads_category}`,
    '',
    '='.repeat(60),
    '报告医师：AI Assistant',
    '报告状态：Preliminary',
    '='.repeat(60)
  ];

  return lines.join('\n');
}

/**
 * 打印报告
 */
export function printReport(report: ReportData): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('请允许弹出窗口以打印报告');
    return;
  }

  const content = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>诊断报告 - ${report.report_id}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        h1 { color: #1e293b; }
        .section { margin: 20px 0; }
        .label { font-weight: bold; color: #64748b; }
        .value { color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        .footer { margin-top: 40px; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <h1>肺部 CT 影像分析报告</h1>
      <div class="section">
        <span class="label">报告编号:</span> ${report.report_id}<br>
        <span class="label">检查日期:</span> ${report.examination_date}
      </div>
      
      <div class="section">
        <h2>患者信息</h2>
        <table>
          <tr><td class="label">姓名</td><td class="value">${report.patient_info.patient_name}</td></tr>
          <tr><td class="label">年龄</td><td class="value">${report.patient_info.patient_age}</td></tr>
          <tr><td class="label">性别</td><td class="value">${report.patient_info.patient_gender}</td></tr>
          <tr><td class="label">患者 ID</td><td class="value">${report.patient_info.patient_id}</td></tr>
        </table>
      </div>
      
      <div class="section">
        <h2>影像学表现</h2>
        <p><span class="label">肺部总面积:</span> ${report.examination_findings.lung_segmentation.total_lung_area} px²</p>
        <p><span class="label">肺部占比:</span> ${report.examination_findings.lung_segmentation.lung_percentage}%</p>
        <p><span class="label">结节数量:</span> ${report.examination_findings.pulmonary_nodules.detected}</p>
        <p><span class="label">主要诊断:</span> ${report.examination_findings.lung_lesions.primary_diagnosis}</p>
      </div>
      
      <div class="section">
        <h2>诊断意见</h2>
        <p>${report.impression}</p>
      </div>
      
      <div class="section">
        <h2>建议</h2>
        <ul>
          ${report.recommendations.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
      
      <div class="footer">
        <p>报告医师：AI Assistant | 报告状态：Preliminary</p>
        <p>BI-RADS 分级：${report.birads_category}</p>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}
