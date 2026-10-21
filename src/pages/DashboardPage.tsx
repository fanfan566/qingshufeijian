import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Calendar as CalendarIcon, 
  Settings, 
  X, 
  Save, 
  Upload, 
  Play, 
  BookOpen, 
  Activity, 
  Shield, 
  Heart,
  Droplet,
  Ruler,
  Weight,
  BadgeCheck,
  ChevronRight,
  Sparkles,
  Bell,
  Search,
  Stethoscope,
  User,
  GraduationCap,
  Users,
  FileText,
  MessageCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  Award,
  Lightbulb,
  Plus,
  Trash2
} from 'lucide-react';
import { PageType } from '../types';
import { userService } from '../services/userService';
import { recommendationService } from '../services/recommendationService';
import { patientService, PatientData, DailyData } from '../services/patientService';
import { consultationService } from '../services/consultationService';
import * as echarts from 'echarts';

// 肺部健康知识库（50 条）
const LUNG_HEALTH_KNOWLEDGE = [
  'FEV1/FVC < 70% 提示阻塞性通气障碍',
  'FVC 低于正常值 80% 提示限制性通气障碍',
  'PEF 峰值呼气流速反映大气道通畅程度',
  'FEV1 是第一秒用力呼气容积，是评估 COPD 的重要指标',
  '支气管舒张试验阳性提示气道可逆性改变',
  '弥散功能 DLCO 降低提示肺泡 - 毛细血管膜损伤',
  'COPD 患者 FEV1/FVC 比值通常小于 0.7',
  '哮喘患者支气管舒张试验后 FEV1 改善率≥12% 为阳性',
  '肺总量 TLC 降低见于限制性肺疾病',
  '残气量 RV 增加提示肺气肿或气体陷闭',
  '功能残气量 FRC 是平静呼气末肺内气体量',
  '用力呼气中期流量 FEF25-75% 反映小气道功能',
  '最大自主通气量 MVV 反映呼吸肌力量和胸廓弹性',
  '血氧饱和度 SpO2 正常值为 95%-100%',
  '动脉血氧分压 PaO2 正常范围为 80-100mmHg',
  '动脉血二氧化碳分压 PaCO2 正常值为 35-45mmHg',
  'pH 值正常范围为 7.35-7.45',
  'Ⅰ型呼吸衰竭 PaO2<60mmHg，PaCO2 正常或降低',
  'Ⅱ型呼吸衰竭 PaO2<60mmHg 且 PaCO2>50mmHg',
  '6 分钟步行试验用于评估运动耐力和康复效果',
  'Borg 评分用于评估呼吸困难程度',
  'mMRC 呼吸困难量表分为 0-4 级',
  'CAT 评分用于评估 COPD 患者症状负担',
  'GOLD 分级根据 FEV1 将 COPD 分为 1-4 级',
  '哮喘控制测试 ACT 评分≥20 分表示控制良好',
  '呼出气一氧化氮 FeNO 升高提示嗜酸性粒细胞性气道炎症',
  '肺顺应性降低见于肺纤维化、肺水肿等',
  '气道阻力 Raw 增加见于哮喘、COPD 等阻塞性疾病',
  '压力 - 容积环可用于评估呼吸肌功能',
  '流速 - 容积环是肺功能检查的基本图形',
  '阻塞性通气障碍流速 - 容积环呈凹陷状',
  '限制性通气障碍流速 - 容积环呈尖塔状',
  '混合性通气障碍兼有阻塞和限制特征',
  '支气管激发试验用于诊断不典型哮喘',
  '运动激发试验用于诊断运动诱发性支气管痉挛',
  '甘露醇激发试验特异性高于乙酰甲胆碱',
  '乙酰甲胆碱激发试验 PC20<8mg/ml 为阳性',
  '肺功能检查前需停用支气管扩张剂',
  '短效β2 受体激动剂需停用 6 小时以上',
  '长效β2 受体激动剂需停用 12-24 小时',
  '抗胆碱能药物需停用 24-48 小时',
  '茶碱类药物需停用 24 小时',
  '肺功能检查最佳时间为上午 8-10 点',
  '每次肺功能检查至少重复 3 次取最佳値',
  '两次最佳 FVC 和 FEV1 差异应小于 150ml',
  '肺功能预计值公式应考虑年龄、性别、身高',
  '中国人肺功能预计值与西方人有差异',
  '老年人肺功能随年龄增长逐渐下降',
  '吸烟者肺功能下降速度快于非吸烟者',
  '长期接触粉尘职业人群应定期监测肺功能'
];

// 模拟案例库（50 题）
interface QuizQuestion {
  id: number;
  category: string;
  caseText: string;
  question: string;
  options: string[];
  answer: number;
  analysis: string;
  fev1?: string;
  fvc?: string;
  fev1Fvc?: string;
  pef?: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    category: '肺炎',
    caseText: '男，28 岁，受凉后高热、咳铁锈色痰，右下肺实变影。',
    question: '最可能诊断：',
    options: ['A. 金葡菌肺炎', 'B. 肺炎链球菌肺炎', 'C. 支原体肺炎', 'D. 病毒性肺炎'],
    answer: 1,
    analysis: '铁锈色痰是**肺炎链球菌**典型表现；实变影 + 急性起病符合大叶性肺炎。金葡菌多脓血痰、空洞；支原体多干咳、斑片影。'
  },
  {
    id: 2,
    category: '肺炎',
    caseText: '女，32 岁，干咳低热 1 周，斑片影，冷凝集试验 (+)。',
    question: '诊断：',
    options: ['A. 细菌性肺炎', 'B. 支原体肺炎', 'C. 肺结核', 'D. 肺脓肿'],
    answer: 1,
    analysis: '**冷凝集试验阳性**是支原体特征；干咳 + 斑片影 + 低热典型。'
  },
  {
    id: 3,
    category: '肺炎',
    caseText: '男，55 岁，糖尿病，高热、脓血痰、多发空洞影。',
    question: '致病菌：',
    options: ['A. 肺炎链球菌', 'B. 肺炎克雷伯', 'C. 金葡菌', 'D. 军团菌'],
    answer: 2,
    analysis: '**金葡菌**易坏死、空洞、脓血痰；糖尿病、卧床是高危因素。'
  },
  {
    id: 4,
    category: '肺炎',
    caseText: '男，65 岁，砖红色胶冻样痰，叶间隙下坠。',
    question: '诊断：',
    options: ['A. 金葡菌', 'B. 克雷伯杆菌', 'C. 军团菌', 'D. 真菌'],
    answer: 1,
    analysis: '**砖红色胶冻痰 + 叶间隙下坠**是克雷伯杆菌肺炎经典三联。'
  },
  {
    id: 5,
    category: '肺炎',
    caseText: '男，40 岁，旅游后高热、肌痛、腹泻、低钠，斑片影。',
    question: '最可能：',
    options: ['A. 军团菌', 'B. 支原体', 'C. 流感', 'D. 结核'],
    answer: 0,
    analysis: '**军团菌**经典：肺外症状（腹泻、低钠、肌痛）+ 肺炎。'
  },
  {
    id: 6,
    category: '肺炎',
    caseText: '男，70 岁，卧床，误吸，右下肺阴影，厌氧菌感染。',
    question: '首选治疗：',
    options: ['A. 头孢', 'B. 青霉素 + 甲硝唑', 'C. 喹诺酮', 'D. 万古'],
    answer: 1,
    analysis: '误吸→厌氧菌为主；**青霉素 + 甲硝唑**是经典覆盖。'
  },
  {
    id: 7,
    category: '哮喘',
    caseText: '女，22 岁，反复发作喘息，夜间重，支气管舒张试验阳性。',
    question: '诊断：',
    options: ['A. COPD', 'B. 哮喘', 'C. 心衰', 'D. 支扩'],
    answer: 1,
    analysis: '**舒张试验阳性**=可逆性气流受限 = 哮喘确诊依据。'
  },
  {
    id: 8,
    category: '哮喘',
    caseText: '',
    question: '哮喘急性发作，判断严重程度最关键指标：',
    options: ['A. 咳嗽', 'B. 哮鸣音', 'C. PEF/FEV1', 'D. 体温'],
    answer: 2,
    analysis: '**呼气流速**是客观严重度指标；哮鸣音消失反可能危重。'
  },
  {
    id: 9,
    category: '哮喘',
    caseText: '',
    question: '哮喘长期控制首选：',
    options: ['A. 短效β2 激动剂', 'B. 吸入激素 ICS', 'C. 茶碱', 'D. 抗组胺'],
    answer: 1,
    analysis: '**ICS 是控制气道炎症一线基石**。'
  },
  {
    id: 10,
    category: '哮喘',
    caseText: '',
    question: '哮喘发作急救首选：',
    options: ['A. 沙丁胺醇', 'B. 布地奈德', 'C. 孟鲁司特', 'D. 氨茶碱'],
    answer: 0,
    analysis: '**SABA（沙丁胺醇）**是急救首选快速缓解。'
  },
  {
    id: 11,
    category: '哮喘',
    caseText: '咳嗽唯一症状，无喘息，激发试验阳性。',
    question: '诊断：',
    options: ['A. 慢阻肺', 'B. 咳嗽变异性哮喘', 'C. 鼻后滴漏', 'D. GERD'],
    answer: 1,
    analysis: '**激发试验阳性**+ 仅咳嗽 = 咳嗽变异性哮喘。'
  },
  {
    id: 12,
    category: '哮喘',
    caseText: '重症哮喘，呼酸、意识模糊。',
    question: '处理：',
    options: ['A. 加大雾化', 'B. 机械通气', 'C. 口服激素', 'D. 补液'],
    answer: 1,
    analysis: '**酸中毒 + 意识改变 = 危及生命→立即通气**。'
  },
  {
    id: 13,
    category: 'COPD',
    caseText: '男，65 岁，吸烟 40 年，慢咳、气短，FEV1/FVC=60%。',
    question: '诊断：',
    options: ['A. 哮喘', 'B. COPD', 'C. 间质肺', 'D. 心衰'],
    answer: 1,
    analysis: '**FEV1/FVC＜70%**+ 吸烟 + 慢性症状=COPD。',
    fev1: '60%',
    fvc: '75%',
    fev1Fvc: '60%'
  },
  {
    id: 14,
    category: 'COPD',
    caseText: '',
    question: 'COPD 诊断金标准：',
    options: ['A. 胸片', 'B. 肺功能', 'C. CT', 'D. 血气'],
    answer: 1,
    analysis: '肺功能检查是 COPD 诊断的金标准。'
  },
  {
    id: 15,
    category: 'COPD',
    caseText: '',
    question: 'COPD 急性加重最常见诱因：',
    options: ['A. 冷空气', 'B. 感染', 'C. 吸烟', 'D. 缺氧'],
    answer: 1,
    analysis: '感染是 COPD 急性加重最常见的诱因。'
  },
  {
    id: 16,
    category: 'COPD',
    caseText: '',
    question: 'COPD 稳定期核心治疗：',
    options: ['A. 口服激素', 'B. 支扩剂（LAMA/LABA）', 'C. 抗生素', 'D. 吸氧'],
    answer: 1,
    analysis: '支扩剂是 COPD 稳定期核心治疗。'
  },
  {
    id: 17,
    category: 'COPD',
    caseText: '',
    question: 'COPD 慢性呼衰吸氧目标：',
    options: ['A. 100%', 'B. 90-93%', 'C. 95-98%', 'D. 85-88%'],
    answer: 1,
    analysis: '防 CO2 潴留，**不追求过高血氧**。'
  },
  {
    id: 18,
    category: 'COPD',
    caseText: 'COPD 出现双下肢水肿、颈静脉怒张。',
    question: '诊断：',
    options: ['A. 左心衰', 'B. 肺心病', 'C. 肝硬化', 'D. 肾病'],
    answer: 1,
    analysis: '肺部疾病致右心衰竭 =**肺源性心脏病**。'
  },
  {
    id: 19,
    category: '肺结核',
    caseText: '25 岁，低热盗汗乏力咯血，上叶尖后段阴影。',
    question: '诊断：',
    options: ['A. 肺炎', 'B. 结核', 'C. 肺癌', 'D. 支扩'],
    answer: 1,
    analysis: '**上叶尖后段/下叶背段**是结核好发部位。'
  },
  {
    id: 20,
    category: '肺结核',
    caseText: '',
    question: '结核确诊金标准：',
    options: ['A. 胸片', 'B. CT', 'C. 痰抗酸杆菌/培养', 'D. PPD'],
    answer: 2,
    analysis: '痰抗酸杆菌涂片或培养是确诊金标准。'
  },
  {
    id: 21,
    category: '肺结核',
    caseText: '',
    question: '初治结核标准方案：',
    options: ['A. 异烟肼 + 利福平 + 乙胺丁醇 + 吡嗪酰胺', 'B. 异烟肼单药', 'C. 头孢 + 喹诺酮', 'D. 激素 + 抗生素'],
    answer: 0,
    analysis: '**四联标准短程化疗**。'
  },
  {
    id: 22,
    category: '肺结核',
    caseText: '',
    question: '结核药致周围神经炎：',
    options: ['A. 利福平', 'B. 异烟肼', 'C. 吡嗪酰胺', 'D. 乙胺丁醇'],
    answer: 0,
    analysis: '异烟肼→B6 缺乏→神经炎，可补 B6。'
  },
  {
    id: 23,
    category: '肺结核',
    caseText: '',
    question: '乙胺丁醇主要不良反应：',
    options: ['A. 肝损', 'B. 视神经炎', 'C. 痛风', 'D. 皮疹'],
    answer: 1,
    analysis: '**红绿色盲、视力下降**，需监测视觉。'
  },
  {
    id: 24,
    category: '肺癌',
    caseText: '55 岁，吸烟，刺激性咳嗽、血痰、体重下降。',
    question: '最需排除：',
    options: ['A. 结核', 'B. 肺癌', 'C. 肺炎', 'D. 支扩'],
    answer: 1,
    analysis: '中老年吸烟 + 刺激性咳嗽 + 血痰 + 消瘦=高度怀疑肺癌。'
  },
  {
    id: 25,
    category: '肺癌',
    caseText: '',
    question: '肺癌筛查首选：',
    options: ['A. 胸片', 'B. 低剂量螺旋 CT', 'C. MRI', 'D. PET'],
    answer: 1,
    analysis: '低剂量螺旋 CT 是肺癌筛查首选。'
  },
  {
    id: 26,
    category: '肺癌',
    caseText: '',
    question: '最常见肺癌类型：',
    options: ['A. 鳞癌', 'B. 腺癌', 'C. 小细胞', 'D. 大细胞'],
    answer: 1,
    analysis: '腺癌是最常见的肺癌类型。'
  },
  {
    id: 27,
    category: '肺癌',
    caseText: '',
    question: '吸烟最相关、中央型、易咯血：',
    options: ['A. 鳞癌', 'B. 腺癌', 'C. 小细胞', 'D. 类癌'],
    answer: 0,
    analysis: '**中央型、吸烟强相关**是鳞癌特点。'
  },
  {
    id: 28,
    category: '肺癌',
    caseText: '杵状指、关节痛，肺占位。',
    question: '副癌综合征多见于：',
    options: ['A. 鳞癌', 'B. 小细胞', 'C. 腺癌', 'D. 大细胞'],
    answer: 1,
    analysis: '**小细胞肺癌**最易出现内分泌副癌综合征。'
  },
  {
    id: 29,
    category: '支气管扩张',
    caseText: '反复咳脓痰、咯血，固定湿啰音，CT 双轨征。',
    question: '诊断：',
    options: ['A. 肺炎', 'B. 支扩', 'C. 哮喘', 'D. COPD'],
    answer: 1,
    analysis: '**双轨征/印戒征**= 支扩典型 HRCT 表现。'
  },
  {
    id: 30,
    category: '支气管扩张',
    caseText: '',
    question: '支扩确诊检查：',
    options: ['A. 胸片', 'B. 高分辨 CT', 'C. 肺功能', 'D. 纤支镜'],
    answer: 1,
    analysis: '高分辨 CT 是支气管扩张确诊检查。'
  },
  {
    id: 31,
    category: '支气管扩张',
    caseText: '',
    question: '支扩急性加重抗生素需覆盖：',
    options: ['A. 革兰阳性', 'B. 革兰阴性 + 厌氧菌', 'C. 病毒', 'D. 真菌'],
    answer: 1,
    analysis: '铜绿、流感嗜血、厌氧菌常见。'
  },
  {
    id: 32,
    category: '支气管扩张',
    caseText: '',
    question: '支扩大咯血首选止血药：',
    options: ['A. 氨甲环酸', 'B. 垂体后叶素', 'C. 硝酸甘油', 'D. 肝素'],
    answer: 1,
    analysis: '**垂体后叶素**是大咯血一线强效药。'
  },
  {
    id: 33,
    category: '气胸',
    caseText: '20 岁瘦高，突发胸痛呼吸困难，叩诊鼓音。',
    question: '诊断：',
    options: ['A. 心梗', 'B. 气胸', 'C. 肺炎', 'D. 肺栓塞'],
    answer: 1,
    analysis: '年轻瘦高体型 + 突发胸痛 + 叩诊鼓音 = 典型自发性气胸。'
  },
  {
    id: 34,
    category: '气胸',
    caseText: '',
    question: '气胸首选检查：',
    options: ['A. ECG', 'B. 胸片/CT', 'C. 超声', 'D. 血气'],
    answer: 1,
    analysis: '胸片或 CT 是气胸首选检查。'
  },
  {
    id: 35,
    category: '气胸',
    caseText: '',
    question: '大量气胸、呼吸困难，处理：',
    options: ['A. 吸氧观察', 'B. 穿刺/闭式引流', 'C. 激素', 'D. 抗生素'],
    answer: 1,
    analysis: '大量气胸需穿刺排气或闭式引流。'
  },
  {
    id: 36,
    category: '肺栓塞',
    caseText: '术后卧床，突发呼吸困难、胸痛、咯血、低氧。',
    question: '最可能：',
    options: ['A. 心梗', 'B. 肺栓塞', 'C. 气胸', 'D. 肺炎'],
    answer: 1,
    analysis: '术后卧床 + 突发呼吸困难 + 胸痛咯血 = 肺栓塞三联征。'
  },
  {
    id: 37,
    category: '肺栓塞',
    caseText: '',
    question: '肺栓塞首选筛查：',
    options: ['A. D-二聚体', 'B. 胸片', 'C. ECG', 'D. 心肌酶'],
    answer: 0,
    analysis: 'D-二聚体阴性可排除肺栓塞。'
  },
  {
    id: 38,
    category: '肺栓塞',
    caseText: '',
    question: '肺栓塞确诊：',
    options: ['A. CTPA', 'B. 超声', 'C. 胸片', 'D. 血气'],
    answer: 0,
    analysis: 'CTPA（CT 肺动脉造影）是确诊金标准。'
  },
  {
    id: 39,
    category: '间质性肺病',
    caseText: '进行性气短、Velcro 啰音、杵状指，CT 网格影。',
    question: '诊断：',
    options: ['A. 肺炎', 'B. 间质纤维化', 'C. 哮喘', 'D. COPD'],
    answer: 1,
    analysis: 'Velcro 啰音 + 杵状指 + 网格影 = 间质纤维化典型。'
  },
  {
    id: 40,
    category: '间质性肺病',
    caseText: '',
    question: '特发性肺纤维化典型影像：',
    options: ['A. 实变', 'B. 胸腔积液', 'C. 蜂窝肺', 'D. 空洞'],
    answer: 2,
    analysis: '蜂窝肺是 IPF 典型 HRCT 表现。'
  },
  {
    id: 41,
    category: '间质性肺病',
    caseText: '',
    question: '限制性通气障碍见于：',
    options: ['A. 哮喘', 'B. 支扩', 'C. 间质病', 'D. 慢阻肺'],
    answer: 2,
    analysis: '肺扩张受限→**FVC 下降**，流速正常或偏高。'
  },
  {
    id: 42,
    category: '胸腔积液',
    caseText: '低热盗汗，单侧积液，淋巴细胞为主，ADA 高。',
    question: '诊断：',
    options: ['A. 心衰', 'B. 结核性胸膜炎', 'C. 癌性胸水', 'D. 肺炎旁积液'],
    answer: 1,
    analysis: '**ADA＞40**高度提示结核。'
  },
  {
    id: 43,
    category: '胸腔积液',
    caseText: '双侧积液，漏出液，下肢水肿。',
    question: '诊断：',
    options: ['A. 结核', 'B. 心衰', 'C. 癌', 'D. 肺炎'],
    answer: 1,
    analysis: '双侧漏出液 + 水肿 = 心衰典型。'
  },
  {
    id: 44,
    category: '胸腔积液',
    caseText: '胸水血性、增长快、肿瘤标志物高。',
    question: '诊断：',
    options: ['A. 结核', 'B. 癌性胸水', 'C. 心衰', 'D. 肝硬化'],
    answer: 1,
    analysis: '血性胸水 + 肿瘤标志物高 = 癌性胸水。'
  },
  {
    id: 45,
    category: '呼吸衰竭',
    caseText: '重症肺炎，顽固性低氧，双肺弥漫浸润。',
    question: '诊断：',
    options: ['A. 心衰', 'B. ARDS', 'C. 哮喘', 'D. 慢阻肺'],
    answer: 1,
    analysis: '顽固性低氧 + 双肺弥漫浸润=ARDS。'
  },
  {
    id: 46,
    category: '呼吸衰竭',
    caseText: '',
    question: 'Ⅱ型呼吸衰竭定义：',
    options: ['A. PaO2<60，PaCO2 正常', 'B. PaO2<60，PaCO2>50', 'C. PaO2<70，PaCO2>45', 'D. PaO2<50，PaCO2>60'],
    answer: 1,
    analysis: 'Ⅱ型呼衰 = 低氧血症 + 高碳酸血症。'
  },
  {
    id: 47,
    category: '咳嗽鉴别',
    caseText: '慢性咳嗽、清喉、鼻后滴流。',
    question: '诊断：',
    options: ['A. 哮喘', 'B. 鼻后滴漏综合征', 'C. GERD', 'D. 支扩'],
    answer: 1,
    analysis: '鼻后滴流是慢性咳嗽常见原因。'
  },
  {
    id: 48,
    category: '咳嗽鉴别',
    caseText: '反酸、烧心、夜间咳嗽。',
    question: '诊断：',
    options: ['A. 哮喘', 'B. 结核', 'C. GERD', 'D. 支扩'],
    answer: 2,
    analysis: '反酸烧心 + 夜间咳嗽=胃食管反流。'
  },
  {
    id: 49,
    category: '咳嗽鉴别',
    caseText: '异物吸入，突发呛咳、一侧呼吸音低。',
    question: '首选：',
    options: ['A. 胸片', 'B. 纤支镜', 'C. CT', 'D. 雾化'],
    answer: 1,
    analysis: '**纤支镜**既是诊断也是治疗。'
  },
  {
    id: 50,
    category: '咳嗽鉴别',
    caseText: '',
    question: '社区获得性肺炎（CAP）门诊首选：',
    options: ['A. 青霉素', 'B. 阿莫西林/克拉维酸或多西/左氧', 'C. 万古霉素', 'D. 抗真菌'],
    answer: 1,
    analysis: '覆盖典型 + 非典型病原体，指南一线。'
  }
];

type UserRole = 'doctor' | 'patient' | 'student';

interface DashboardPageProps {
  onNavigate: (page: PageType) => void;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  nickname?: string;
  bloodType?: string;
  height?: number;
  weight?: number;
  avatar?: string;
  membershipLevel?: 'free' | 'premium' | 'vip';
  age?: number;
  gender?: 'male' | 'female';
  hasBasicDisease?: boolean;
  basicDiseases?: string[];
  role?: UserRole;
  createdAt: string;
}

interface StudyTask {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
}

interface WeeklyStudyRecord {
  date: string;
  minutes: number;
}

const DEFAULT_STUDY_TASKS: StudyTask[] = [
  { id: '1', title: '肺功能报告解读基础', duration: '15 分钟', completed: true },
  { id: '2', title: '阻塞性通气障碍判断', duration: '20 分钟', completed: true },
  { id: '3', title: '限制性通气障碍分析', duration: '25 分钟', completed: false },
  { id: '4', title: '混合性通气障碍案例', duration: '30 分钟', completed: false },
  { id: '5', title: '支气管舒张试验解读', duration: '20 分钟', completed: false }
];

const parseDurationMinutes = (duration: string) => {
  const matched = duration.match(/\d+/);
  return matched ? parseInt(matched[0], 10) : 20;
};

const getWeekStart = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const isSameWeek = (dateString: string, weekStart: Date) => {
  const currentDate = new Date(dateString);
  const currentWeekStart = getWeekStart(currentDate);
  return currentWeekStart.getTime() === weekStart.getTime();
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartInstance, setChartInstance] = useState<echarts.ECharts | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>('patient');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [patientStatusFilter, setPatientStatusFilter] = useState<'all' | 'stable' | 'attention' | 'critical'>('all');
  const [doctorAdvice, setDoctorAdvice] = useState('');
  const [doctorAdviceHistory, setDoctorAdviceHistory] = useState<string[]>([]);
  const [trendRange, setTrendRange] = useState<7 | 30 | 90>(7);
  const [profileValidationErrors, setProfileValidationErrors] = useState<{
    nickname?: string;
    bloodType?: string;
    height?: string;
    weight?: string;
  }>({});

  useEffect(() => {
    const user = userService.getCurrentUser();
    console.log('当前登录用户:', user);
    if (user) {
      const userProfile: UserProfile = {
        ...user,
        nickname: (user as any).nickname || user.username,
        bloodType: (user as any).bloodType || '-',
        height: (user as any).height || 170,
        weight: (user as any).weight || 65,
        avatar: (user as any).avatar || '',
        role: user.role || 'patient',
        id: user.id || '',
      };
      setCurrentUser(userProfile);
      setProfileData(userProfile);
      console.log('用户角色:', user.role, '用户 ID:', user.id);
      if (user.role) {
        setCurrentRole(user.role);
      }
    }
  }, []);

  const handleSaveProfile = () => {
    if (!profileData) return;

    const nextErrors: {
      nickname?: string;
      bloodType?: string;
      height?: string;
      weight?: string;
    } = {};

    const nickname = (profileData.nickname || '').trim();
    const height = Number(profileData.height);
    const weight = Number(profileData.weight);
    const bloodType = profileData.bloodType || '';

    if (!nickname) {
      nextErrors.nickname = '昵称不能为空';
    } else if (nickname.length < 2 || nickname.length > 12) {
      nextErrors.nickname = '昵称长度需为 2-12 个字符';
    }

    if (bloodType && !['A', 'B', 'O', 'AB'].includes(bloodType)) {
      nextErrors.bloodType = '血型只能为 A、B、O、AB 或留空';
    }

    if (!Number.isFinite(height)) {
      nextErrors.height = '请输入身高';
    } else if (height < 100 || height > 230) {
      nextErrors.height = '身高请填写 100-230 cm 之间';
    }

    if (!Number.isFinite(weight)) {
      nextErrors.weight = '请输入体重';
    } else if (weight < 20 || weight > 250) {
      nextErrors.weight = '体重请填写 20-250 kg 之间';
    }

    setProfileValidationErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      alert('请先按提示修正个人信息后再保存');
      return;
    }

    const normalizedProfile = {
      ...profileData,
      nickname,
      height,
      weight,
      bloodType
    };

    userService.updateProfile(normalizedProfile);
    setCurrentUser({ ...currentUser, ...normalizedProfile } as any);
    setProfileData(normalizedProfile);
    setShowProfileModal(false);
  };

  const generatePatientHistory = (baseFev1: number, baseFvc: number, days: number = 90) => {
    const data: DailyData[] = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const fev1Variation = (Math.random() - 0.5) * 10;
      const fvcVariation = (Math.random() - 0.5) * 8;
      
      const fev1 = Math.max(40, Math.min(100, baseFev1 + fev1Variation));
      const fvc = Math.max(50, Math.min(110, baseFvc + fvcVariation));
      const fev1Fvc = Math.round((fev1 / fvc) * 1000) / 10;
      const pef = Math.round(fev1 * 2 + (Math.random() - 0.5) * 10);
      
      data.push({
        date: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        fev1: Math.round(fev1 * 10) / 10,
        fvc: Math.round(fvc * 10) / 10,
        fev1Fvc,
        pef: Math.round(pef * 10) / 10
      });
    }
    
    return data;
  };

  const roleConfig = {
    doctor: {
      label: '医生',
      icon: Stethoscope,
      gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
      bgGradient: 'from-emerald-50 to-teal-50',
      accentColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    },
    patient: {
      label: '患者',
      icon: User,
      gradient: 'from-indigo-500 via-purple-500 to-pink-500',
      bgGradient: 'from-indigo-50 to-purple-50',
      accentColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    },
    student: {
      label: '学生',
      icon: GraduationCap,
      gradient: 'from-amber-500 via-orange-500 to-red-500',
      bgGradient: 'from-amber-50 to-orange-50',
      accentColor: 'text-amber-600',
      bgColor: 'bg-amber-50'
    }
  };

  const studentStoragePrefix = currentUser?.id ? `student_${currentUser.id}` : null;
  const getStudentStorageKey = (suffix: string) => studentStoragePrefix ? `${studentStoragePrefix}_${suffix}` : null;

  const [studyTasks, setStudyTasks] = useState<StudyTask[]>([]);

  const [patients, setPatients] = useState<PatientData[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
  const [showPatientDetail, setShowPatientDetail] = useState(false);
  const [showEditData, setShowEditData] = useState(false);

  const loadDoctorPatients = () => {
    const patientDataList = patientService.getAllPatients();
    setPatients(patientDataList);
    if (selectedPatient) {
      const refreshedSelectedPatient = patientDataList.find(
        patient => patient.userId === selectedPatient.userId || patient.id === selectedPatient.id
      );
      if (refreshedSelectedPatient) {
        setSelectedPatient(refreshedSelectedPatient);
      }
    }
  };

  useEffect(() => {
    console.log('🔍 检查角色:', currentRole);
    if (currentRole === 'doctor') {
      console.log('👨‍⚕️ 加载患者数据...');
      loadDoctorPatients();
    }
  }, [currentRole]);

  useEffect(() => {
    if (currentRole === 'patient' && currentUser) {
      console.log('📈 加载患者健康数据...');
      const patientHealthData = localStorage.getItem(`patient_health_${currentUser.id}`);
      if (patientHealthData) {
        const patient = JSON.parse(patientHealthData);
        console.log('✅ 患者健康数据已加载:', patient.name, '历史数据:', patient.history?.length || 0, '天');
      } else {
        console.log('⚠️ 未找到患者健康数据，将使用默认数据');
      }
    }
  }, [currentRole, currentUser]);

  useEffect(() => {
    const isDoctorViewingPatient = selectedPatient && selectedPatient.history;
    const isPatientViewingOwn = currentRole === 'patient' && currentUser;

    if (!chartRef.current) return;
    if (!isDoctorViewingPatient && !isPatientViewingOwn) return;

    let historyData: DailyData[] = [];

    if (selectedPatient && selectedPatient.history) {
      historyData = [...selectedPatient.history];
    } else if (currentRole === 'patient' && currentUser) {
      const patientHealthData = localStorage.getItem(`patient_health_${currentUser.id}`);
      if (patientHealthData) {
        const patient = JSON.parse(patientHealthData);
        if (patient.history && patient.history.length > 0) {
          historyData = [...patient.history];
          console.log('📊 使用患者历史数据:', historyData.length, '天');
        }
      }
      if (historyData.length === 0) {
        console.log('⚠️ 无历史数据，生成默认数据');
        const baseFev1 = 85.0;
        const baseFvc = 92.0;
        historyData = generatePatientHistory(baseFev1, baseFvc, 90);
      }
    }

    const normalizedHistoryData = historyData
      .map((item, index) => ({ ...item, originalIndex: index }))
      .sort((a, b) => a.originalIndex - b.originalIndex);

    const filteredHistoryData = normalizedHistoryData.slice(-trendRange);
    
    if (filteredHistoryData.length === 0) {
      console.log('❌ 无数据可显示');
      return;
    }
    
    if (chartInstance) {
      chartInstance.dispose();
    }
    
    const chart = echarts.init(chartRef.current);
    const dates = filteredHistoryData.map(h => h.date);
    const fev1Data = filteredHistoryData.map(h => h.fev1);
    const fvcData = filteredHistoryData.map(h => h.fvc);
    const pefData = filteredHistoryData.map(h => h.pef);
    
    console.log('📈 渲染图表，数据点:', dates.length, '范围:', trendRange, '天');
    
    const option = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#1e293b' },
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: ['FEV1', 'FVC', 'PEF'],
        top: 0,
        textStyle: { color: '#64748b' }
      },
      grid: { 
        left: '3%', 
        right: '4%', 
        bottom: '3%', 
        top: '15%', 
        containLabel: true 
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { 
          color: '#64748b',
          rotate: 45,
          interval: Math.floor(dates.length / 10)
        }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { color: '#64748b' }
      },
      series: [
        {
          name: 'FEV1',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: fev1Data,
          itemStyle: {
            color: '#10b981',
            borderColor: '#fff',
            borderWidth: 2
          },
          lineStyle: {
            color: '#10b981',
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
            ])
          }
        },
        {
          name: 'FVC',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: fvcData,
          itemStyle: {
            color: '#6366f1',
            borderColor: '#fff',
            borderWidth: 2
          },
          lineStyle: {
            color: '#6366f1',
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0.05)' }
            ])
          }
        },
        {
          name: 'PEF',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: pefData,
          itemStyle: {
            color: '#f59e0b',
            borderColor: '#fff',
            borderWidth: 2
          },
          lineStyle: {
            color: '#f59e0b',
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.05)' }
            ])
          }
        }
      ]
    };
    chart.setOption(option);
    setChartInstance(chart);

    return () => {
      chart.dispose();
      setChartInstance(null);
    };
  }, [selectedPatient, currentRole, currentUser, trendRange]);

  const [dailyKnowledgeIndex, setDailyKnowledgeIndex] = useState<number>(Math.floor(Math.random() * LUNG_HEALTH_KNOWLEDGE.length));

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState('');

  const [testsCompleted, setTestsCompleted] = useState<number>(0);
  const [weeklyStudyRecords, setWeeklyStudyRecords] = useState<WeeklyStudyRecord[]>([]);

  useEffect(() => {
    if (!studentStoragePrefix || currentRole !== 'student') return;

    const studyTasksKey = getStudentStorageKey('study_tasks');
    const knowledgeKey = getStudentStorageKey('knowledge_index');
    const quizCurrentIndexKey = getStudentStorageKey('quiz_current_index');
    const quizRoundNumberKey = getStudentStorageKey('quiz_round_number');
    const quizAnswersKey = getStudentStorageKey('quiz_answers');
    const notesKey = getStudentStorageKey('notes');
    const testsCompletedKey = getStudentStorageKey('tests_completed');
    const weeklyStudyRecordsKey = getStudentStorageKey('weekly_study_records');

    const savedStudyTasks = studyTasksKey ? localStorage.getItem(studyTasksKey) : null;
    setStudyTasks(savedStudyTasks ? JSON.parse(savedStudyTasks) : DEFAULT_STUDY_TASKS);

    const savedKnowledgeIndex = knowledgeKey ? localStorage.getItem(knowledgeKey) : null;
    setDailyKnowledgeIndex(
      savedKnowledgeIndex ? parseInt(savedKnowledgeIndex, 10) : Math.floor(Math.random() * LUNG_HEALTH_KNOWLEDGE.length)
    );

    const savedQuizCurrentIndex = quizCurrentIndexKey ? localStorage.getItem(quizCurrentIndexKey) : null;
    const parsedQuizCurrentIndex = savedQuizCurrentIndex ? parseInt(savedQuizCurrentIndex, 10) : 0;
    setQuizCurrentIndex(parsedQuizCurrentIndex);

    const savedQuizRoundNumber = quizRoundNumberKey ? localStorage.getItem(quizRoundNumberKey) : null;
    if (savedQuizRoundNumber) {
      setQuizRoundNumber(Math.max(1, parseInt(savedQuizRoundNumber, 10) || 1));
    } else {
      setQuizRoundNumber(Math.floor(parsedQuizCurrentIndex / 10) + 1);
    }

    const savedQuizAnswers = quizAnswersKey ? localStorage.getItem(quizAnswersKey) : null;
    setQuizAnswers(savedQuizAnswers ? JSON.parse(savedQuizAnswers) : []);

    const savedNotes = notesKey ? localStorage.getItem(notesKey) : null;
    setNotes(savedNotes || '');
    setCurrentNote('');

    const savedTestsCompleted = testsCompletedKey ? localStorage.getItem(testsCompletedKey) : null;
    setTestsCompleted(savedTestsCompleted ? parseInt(savedTestsCompleted, 10) || 0 : 0);

    const savedWeeklyRecords = weeklyStudyRecordsKey ? localStorage.getItem(weeklyStudyRecordsKey) : null;
    setWeeklyStudyRecords(savedWeeklyRecords ? JSON.parse(savedWeeklyRecords) : []);

    setQuizShowAnalysis(false);
    setQuizRoundComplete(false);
  }, [studentStoragePrefix, currentRole]);

  useEffect(() => {
    if (!studentStoragePrefix || currentRole !== 'student') return;
    const studyTasksKey = getStudentStorageKey('study_tasks');
    if (studyTasksKey) {
      localStorage.setItem(studyTasksKey, JSON.stringify(studyTasks));
    }
  }, [studyTasks, studentStoragePrefix, currentRole]);

  useEffect(() => {
    if (!studentStoragePrefix || currentRole !== 'student') return;
    const knowledgeKey = getStudentStorageKey('knowledge_index');
    if (knowledgeKey) {
      localStorage.setItem(knowledgeKey, dailyKnowledgeIndex.toString());
    }
  }, [dailyKnowledgeIndex, studentStoragePrefix, currentRole]);

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    const newTask: StudyTask = {
      id: Date.now().toString(),
      title: newTaskTitle,
      duration: newTaskDuration || '20 分钟',
      completed: false
    };
    
    setStudyTasks([...studyTasks, newTask]);
    setNewTaskTitle('');
    setNewTaskDuration('');
    setShowAddTaskModal(false);
  };

  const toggleTaskCompletion = (taskId: string) => {
    let addedMinutes = 0;

    setStudyTasks(studyTasks.map(task => {
      if (task.id !== taskId) return task;

      const nextCompleted = !task.completed;
      if (nextCompleted && !task.completed) {
        addedMinutes = parseDurationMinutes(task.duration);
      }

      return { ...task, completed: nextCompleted };
    }));

    if (addedMinutes > 0) {
      const today = new Date().toISOString().slice(0, 10);
      setWeeklyStudyRecords(prev => [...prev, { date: today, minutes: addedMinutes }]);
    }
  };

  const deleteTask = (taskId: string) => {
    setStudyTasks(studyTasks.filter(task => task.id !== taskId));
  };

  const refreshKnowledge = () => {
    const randomIndex = Math.floor(Math.random() * LUNG_HEALTH_KNOWLEDGE.length);
    setDailyKnowledgeIndex(randomIndex);
  };

  const [quizCurrentIndex, setQuizCurrentIndex] = useState<number>(0);
  const [quizRoundNumber, setQuizRoundNumber] = useState<number>(1);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizShowAnalysis, setQuizShowAnalysis] = useState(false);
  const [quizRoundComplete, setQuizRoundComplete] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [currentNote, setCurrentNote] = useState('');

  const completedTasksCount = studyTasks.filter(t => t.completed).length;
  const totalTasksCount = studyTasks.length;
  const progressPercentage = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  useEffect(() => {
    if (!studentStoragePrefix || currentRole !== 'student') return;
    const notesKey = getStudentStorageKey('notes');
    if (notesKey) {
      localStorage.setItem(notesKey, notes);
    }
  }, [notes, studentStoragePrefix, currentRole]);

  useEffect(() => {
    if (!studentStoragePrefix || currentRole !== 'student') return;

    const quizCurrentIndexKey = getStudentStorageKey('quiz_current_index');
    const quizRoundNumberKey = getStudentStorageKey('quiz_round_number');
    const quizAnswersKey = getStudentStorageKey('quiz_answers');
    const testsCompletedKey = getStudentStorageKey('tests_completed');
    const weeklyStudyRecordsKey = getStudentStorageKey('weekly_study_records');

    if (quizCurrentIndexKey) {
      localStorage.setItem(quizCurrentIndexKey, quizCurrentIndex.toString());
    }
    if (quizRoundNumberKey) {
      localStorage.setItem(quizRoundNumberKey, quizRoundNumber.toString());
    }
    if (quizAnswersKey) {
      localStorage.setItem(quizAnswersKey, JSON.stringify(quizAnswers));
    }
    if (testsCompletedKey) {
      localStorage.setItem(testsCompletedKey, testsCompleted.toString());
    }
    if (weeklyStudyRecordsKey) {
      localStorage.setItem(weeklyStudyRecordsKey, JSON.stringify(weeklyStudyRecords));
    }
  }, [quizCurrentIndex, quizRoundNumber, quizAnswers, testsCompleted, weeklyStudyRecords, studentStoragePrefix, currentRole]);

  useEffect(() => {
    if (!studentStoragePrefix || currentRole !== 'student') return;
    if (!quizRoundComplete) return;

    setTestsCompleted(prev => prev + 1);
  }, [quizRoundComplete, studentStoragePrefix, currentRole]);

  const currentQuizQuestion = QUIZ_QUESTIONS[quizCurrentIndex % QUIZ_QUESTIONS.length];
  const currentRoundIndex = quizCurrentIndex % 10;
  const displayedRoundNumber = Math.max(1, quizRoundNumber);
  const currentWeekStart = getWeekStart(new Date());
  const studyTimeMinutes = weeklyStudyRecords
    .filter(record => isSameWeek(record.date, currentWeekStart))
    .reduce((sum, record) => sum + record.minutes, 0);

  const selectAnswer = (optionIndex: number) => {
    const newAnswers = [...quizAnswers];
    newAnswers[currentRoundIndex] = optionIndex;
    setQuizAnswers(newAnswers);
  };

  const handleShowAnalysis = () => {
    setQuizShowAnalysis(true);
  };

  const handleNextQuestion = () => {
    if (currentRoundIndex < 9) {
      setQuizCurrentIndex(prev => prev + 1);
      setQuizShowAnalysis(false);
    } else if (!quizRoundComplete) {
      setQuizRoundComplete(true);
    }
  };

  const handleContinueQuiz = () => {
    setQuizCurrentIndex(prev => prev + 1);
    setQuizRoundNumber(prev => prev + 1);
    setQuizAnswers([]);
    setQuizShowAnalysis(false);
    setQuizRoundComplete(false);
  };

  const handleTakeBreak = () => {
    setShowQuizModal(false);
    setQuizRoundComplete(false);
  };

  const handleSaveNote = () => {
    setNotes(currentNote || notes);
    setShowNoteModal(false);
    setCurrentNote('');
  };

  const handleViewPatientDetail = (patient: PatientData) => {
    setSelectedPatient(patient);
    setShowPatientDetail(true);
  };

  const handleEditPatientData = (patient: PatientData) => {
    setSelectedPatient(patient);
    setDoctorAdvice(patient.advice || '');

    const conversation = consultationService.ensureConversationForPatient(patient.userId || patient.id);
    const adviceHistory = (conversation.messages || [])
      .filter((message) => message.type === 'doctor_advice')
      .map((message) => message.content)
      .filter((content, index, list) => content.trim() && list.indexOf(content) === index)
      .reverse();

    setDoctorAdviceHistory(adviceHistory);
    setShowEditData(true);
  };

  const handleSavePatientData = () => {
    if (!selectedPatient) return;

    const trimmedAdvice = doctorAdvice.trim();
    const targetPatientId = selectedPatient.userId || selectedPatient.id;
    const success = patientService.updateAdvice(targetPatientId, trimmedAdvice);
    if (!success) {
      alert('保存建议失败，请稍后重试');
      return;
    }

    consultationService.pushDoctorAdvice(targetPatientId, trimmedAdvice);
    loadDoctorPatients();
    setShowEditData(false);
    setShowPatientDetail(false);
    setDoctorAdvice('');
    setDoctorAdviceHistory([]);
    alert(trimmedAdvice ? '建议已保存，并已同步到患者咨询反馈窗口' : '建议内容已清空');
  };

  const getStatusLabel = (status: 'stable' | 'attention' | 'critical') => {
    const labels = {
      stable: '稳定',
      attention: '需关注',
      critical: '异常'
    };
    return labels[status];
  };

  const getStatusColor = (status: 'stable' | 'attention' | 'critical') => {
    const colors = {
      stable: 'bg-emerald-100 text-emerald-700',
      attention: 'bg-amber-100 text-amber-700',
      critical: 'bg-red-100 text-red-700'
    };
    return colors[status];
  };

  const studentData = {
    tasks: { completed: completedTasksCount, total: totalTasksCount },
    studyTime: studyTimeMinutes,
    testsCompleted: testsCompleted,
    dailyKnowledge: LUNG_HEALTH_KNOWLEDGE[dailyKnowledgeIndex]
  };

  const healthTips = [
    { icon: Activity, title: '肺功能稳定', desc: '您的肺功能指标保持稳定', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { icon: Shield, title: '免疫力良好', desc: '免疫系统状态优秀', color: 'text-blue-500', bg: 'bg-blue-50' },
    { icon: Heart, title: '心肺健康', desc: '心血管功能正常', color: 'text-pink-500', bg: 'bg-pink-50' }
  ];

  const [recommendations, setRecommendations] = useState<Array<{
    type: 'knowledge' | 'training' | 'article';
    title: string;
    desc: string;
    image: string;
    tag: string;
    url: string;
    duration?: string;
  }>>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      setLoadingRecommendations(true);
      const crawlerRes = await fetch('/api/crawler/recommendations');
      const crawlerData = await crawlerRes.json();
      const formatted: any[] = [];
      
      if (crawlerData.articles && crawlerData.articles.length > 0) {
        crawlerData.articles.forEach((article: any) => {
          formatted.push({
            type: 'article' as const,
            title: article.title,
            desc: article.summary || article.title,
            image: article.imageUrl || `https://picsum.photos/seed/article/400/300`,
            tag: article.source === '知乎' ? '知乎精选' : article.source === '丁香医生' ? '丁香医生' : '健康科普',
            url: article.url,
            source: article.source,
            author: article.author,
          });
        });
      }
      
      if (crawlerData.videos && crawlerData.videos.length > 0) {
        crawlerData.videos.forEach((video: any) => {
          formatted.push({
            type: 'training' as const,
            title: video.title,
            desc: video.summary || video.title,
            image: video.imageUrl || `https://picsum.photos/seed/video/400/300`,
            tag: '康复训练',
            url: video.url,
            source: video.source,
            author: video.author,
            duration: video.duration,
          });
        });
      }
      
      if (formatted.length === 0) {
        const fallback = recommendationService.getFallbackRecommendations();
        fallback.forEach(rec => {
          formatted.push({
            type: rec.type === 'paper' ? 'knowledge' : rec.type,
            title: rec.title,
            desc: rec.summary,
            image: rec.imageUrl || `https://picsum.photos/seed/fallback/400/300`,
            tag: rec.tags[0],
            url: rec.url,
          });
        });
      }
      
      setRecommendations(formatted.slice(0, 6));
    } catch (error) {
      console.error('加载推荐失败:', error);
      const fallback = recommendationService.getFallbackRecommendations();
      setRecommendations(fallback.map(rec => ({
        type: rec.type === 'paper' ? 'knowledge' : rec.type as any,
        title: rec.title,
        desc: rec.summary,
        image: rec.imageUrl || `https://picsum.photos/seed/fallback/400/300`,
        tag: rec.tags[0],
        url: rec.url,
      })));
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const filteredPatients = patients.filter((patient) => {
    const keyword = patientSearchTerm.trim().toLowerCase();
    const matchesKeyword = !keyword ||
      patient.name.toLowerCase().includes(keyword) ||
      patient.userId.toLowerCase().includes(keyword) ||
      patient.id.toLowerCase().includes(keyword);
    const matchesStatus = patientStatusFilter === 'all' || patient.status === patientStatusFilter;
    return matchesKeyword && matchesStatus;
  });

  const priorityPatients = [...patients]
    .sort((a, b) => {
      const statusRank = { critical: 0, attention: 1, stable: 2 };
      return statusRank[a.status] - statusRank[b.status];
    })
    .slice(0, 3);

  const doctorFollowUpToday = patients.filter(patient => patient.status !== 'stable').length;
  const doctorPendingAdvice = patients.filter(patient => !patient.advice || !patient.advice.trim()).length;

  const renderRoleContent = () => {
    switch (currentRole) {
      case 'doctor':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-8 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 mb-2">今日重点关注患者</h2>
                      <p className="text-slate-500 font-medium">基于真实患者账号与最新肺功能状态</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                        稳定 {patients.filter(p => p.status === 'stable').length}人
                      </span>
                      <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
                        需关注 {patients.filter(p => p.status === 'attention').length}人
                      </span>
                      <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
                        异常 {patients.filter(p => p.status === 'critical').length}人
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {priorityPatients.length > 0 ? (
                      priorityPatients.map((patient, index) => (
                        <motion.div
                          key={patient.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          onClick={() => setSelectedPatient(patient)}
                          className={`group bg-white rounded-2xl p-6 border transition-all cursor-pointer ${
                            selectedPatient?.userId === patient.userId ? 'border-emerald-300 shadow-lg' : 'border-slate-100 hover:border-emerald-200 hover:shadow-lg'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black text-lg">
                                {patient.name[0]}
                              </div>
                              <div>
                                <h3 className="text-lg font-black text-slate-800">{patient.name}</h3>
                                <div className="flex flex-wrap items-center gap-3 mt-1">
                                  <span className="text-sm font-bold text-slate-500">UID: {patient.userId}</span>
                                  <span className="text-sm font-bold text-slate-500">FEV1: {patient.fev1}%</span>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusColor(patient.status)}`}>
                                    {getStatusLabel(patient.status)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {patient.fev1 < 70 && (
                                <TrendingUp className="text-red-500 rotate-180" size={20} />
                              )}
                              <div className="flex gap-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewPatientDetail(patient);
                                  }}
                                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-all"
                                >
                                  查看详情
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditPatientData(patient);
                                  }}
                                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all flex items-center gap-1"
                                >
                                  <MessageCircle size={14} />
                                  写建议
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="bg-white rounded-2xl p-6 border border-dashed border-slate-200 text-center text-slate-500 font-medium">
                        暂无患者数据
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">患者管理</h2>
                    <p className="text-slate-500 font-medium">按 UID、姓名或状态筛选真实患者账号</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPatientStatusFilter('all')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        patientStatusFilter === 'all'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      全部患者
                    </button>
                    <button
                      onClick={() => setPatientStatusFilter('attention')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        patientStatusFilter === 'attention'
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      需关注
                    </button>
                    <button
                      onClick={() => setPatientStatusFilter('critical')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        patientStatusFilter === 'critical'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      异常
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      value={patientSearchTerm}
                      onChange={(e) => setPatientSearchTerm(e.target.value)}
                      placeholder="搜索患者 UID 或姓名..."
                      className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-12 pr-6 font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                  <select
                    value={patientStatusFilter}
                    onChange={(e) => setPatientStatusFilter(e.target.value as 'all' | 'stable' | 'attention' | 'critical')}
                    className="bg-slate-50 border-none rounded-2xl px-6 py-3 text-sm font-bold focus:ring-0"
                  >
                    <option value="all">所有状态</option>
                    <option value="stable">稳定</option>
                    <option value="attention">需关注</option>
                    <option value="critical">异常</option>
                  </select>
                </div>

                <div className="space-y-3">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((patient, index) => (
                      <motion.div
                        key={`${patient.userId}-${index}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => setSelectedPatient(patient)}
                        className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${
                          selectedPatient?.userId === patient.userId
                            ? 'border-emerald-300 bg-emerald-50/60'
                            : 'border-slate-100 hover:border-emerald-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black">
                            {patient.name[0]}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-black text-slate-800">{patient.name}</h3>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusColor(patient.status)}`}>
                                {getStatusLabel(patient.status)}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-slate-500 font-medium">
                              UID: {patient.userId} · FEV1/FVC: {patient.fev1Fvc}% · PEF: {patient.pef}%
                            </div>
                            {patient.advice && (
                              <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 inline-flex px-2.5 py-1 rounded-full font-bold">
                                已有医生建议
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewPatientDetail(patient);
                            }}
                            className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-all"
                          >
                            查看详情
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPatientData(patient);
                            }}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all flex items-center gap-1"
                          >
                            <MessageCircle size={14} />
                            写建议
                          </button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                      <p className="text-slate-500 font-medium">未找到匹配的患者，请尝试输入 UID 或姓名。</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 shadow-lg shadow-emerald-500/30 text-white"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Clock size={24} className="text-white/90" />
                  <h3 className="text-lg font-black">今日随访</h3>
                </div>
                <div className="text-5xl font-black mb-2">{doctorFollowUpToday}</div>
                <p className="text-white/80 text-sm font-medium mb-6">人需要优先随访</p>
                <button
                  onClick={() => onNavigate('consultation')}
                  className="w-full bg-white text-emerald-600 rounded-xl py-3 font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} />
                  进入咨询反馈
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
              >
                <h3 className="text-lg font-black text-slate-800 mb-4">快捷操作</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      if (selectedPatient) {
                        handleEditPatientData(selectedPatient);
                      } else if (filteredPatients[0]) {
                        handleEditPatientData(filteredPatients[0]);
                      }
                    }}
                    className="p-4 bg-indigo-50 rounded-2xl hover:bg-indigo-100 transition-all text-center"
                  >
                    <FileText size={24} className="mx-auto mb-2 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">写建议</span>
                  </button>
                  <button
                    onClick={() => onNavigate('consultation')}
                    className="p-4 bg-emerald-50 rounded-2xl hover:bg-emerald-100 transition-all text-center"
                  >
                    <MessageCircle size={24} className="mx-auto mb-2 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-700">咨询反馈</span>
                  </button>
                  <button
                    onClick={() => {
                      if (selectedPatient) {
                        handleViewPatientDetail(selectedPatient);
                      }
                    }}
                    className="p-4 bg-purple-50 rounded-2xl hover:bg-purple-100 transition-all text-center"
                  >
                    <BarChart3 size={24} className="mx-auto mb-2 text-purple-600" />
                    <span className="text-xs font-bold text-slate-700">查看趋势</span>
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
              >
                <h3 className="text-lg font-black text-slate-800 mb-4">管理概览</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">总患者数</span>
                    <span className="text-2xl font-black text-slate-800">{patients.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">需重点关注</span>
                    <span className="text-2xl font-black text-slate-800">{doctorFollowUpToday}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">待补充建议</span>
                    <span className="text-2xl font-black text-amber-600">{doctorPendingAdvice}</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        );

      case 'student':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-8 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 mb-2">今日学习任务</h2>
                      <p className="text-slate-500 font-medium">系统学习肺功能知识</p>
                    </div>
                    <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-full">
                      <CheckCircle2 size={18} className="text-amber-600" />
                      <span className="text-sm font-bold text-amber-600">
                        已完成 {completedTasksCount}/{totalTasksCount} 项
                      </span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-600">总体进度</span>
                      <span className="text-lg font-black text-amber-600">{progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercentage}%` }}
                        transition={{ duration: 1 }}
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowAddTaskModal(true)}
                    className="w-full mb-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl py-3 font-bold hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30"
                  >
                    <Plus size={18} />
                    添加学习任务
                  </button>

                  <div className="space-y-3">
                    {studyTasks.map((task, index) => (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`group flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                          task.completed
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-md'
                        }`}
                        onClick={() => toggleTaskCompletion(task.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                            task.completed ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}>
                            {task.completed ? (
                              <CheckCircle2 size={16} className="text-white" />
                            ) : (
                              <span className="text-white text-xs font-bold">{index + 1}</span>
                            )}
                          </div>
                          <div>
                            <h4 className={`font-bold transition-colors ${
                              task.completed ? 'text-emerald-700 line-through' : 'text-slate-800'
                            }`}>{task.title}</h4>
                            <span className="text-xs text-slate-500">{task.duration}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.completed && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                              已完成
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(task.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 transition-all"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">模拟案例库</h2>
                    <p className="text-slate-500 font-medium">实践案例分析</p>
                  </div>
                  <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-full">
                    <Award size={18} className="text-amber-600" />
                    <span className="text-sm font-bold text-amber-600">
                      第 {displayedRoundNumber} 轮 - 第 {currentRoundIndex + 1}/10 题
                    </span>
                  </div>
                </div>

                {quizRoundComplete && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
                  >
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setQuizRoundComplete(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 pointer-events-auto overflow-hidden relative z-10"
                    >
                      <div className="h-2 bg-gradient-to-r from-amber-500 to-orange-500" />
                      <div className="p-8 text-center">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                          <Award size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mb-2">本轮测试完成！</h3>
                        <p className="text-slate-500 font-medium mb-6">您已经完成了 10 道题目，休息一下还是继续挑战？</p>
                        <div className="space-y-3">
                          <button
                            onClick={handleContinueQuiz}
                            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl py-3 font-bold hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
                          >
                            <BookOpen size={18} />
                            继续测试
                          </button>
                          <button
                            onClick={handleTakeBreak}
                            className="w-full bg-slate-100 text-slate-700 rounded-xl py-3 font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                          >
                            <Clock size={18} />
                            休息一会儿
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}

                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-200">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-2xl flex-shrink-0">
                      {currentQuizQuestion.category[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                          {currentQuizQuestion.category}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          案例 #{String(currentQuizQuestion.id).padStart(3, '0')}
                        </span>
                      </div>
                      <p className="text-slate-700 font-bold mb-4">{currentQuizQuestion.caseText}</p>
                      
                      {currentQuizQuestion.fev1 && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {currentQuizQuestion.fev1 && (
                            <div className="bg-white rounded-xl p-3">
                              <div className="text-xs text-slate-500 mb-1">FEV1</div>
                              <div className="text-lg font-black text-slate-800">{currentQuizQuestion.fev1}</div>
                            </div>
                          )}
                          {currentQuizQuestion.fvc && (
                            <div className="bg-white rounded-xl p-3">
                              <div className="text-xs text-slate-500 mb-1">FVC</div>
                              <div className="text-lg font-black text-slate-800">{currentQuizQuestion.fvc}</div>
                            </div>
                          )}
                          {currentQuizQuestion.fev1Fvc && (
                            <div className="bg-white rounded-xl p-3">
                              <div className="text-xs text-slate-500 mb-1">FEV1/FVC</div>
                              <div className="text-lg font-black text-red-600">{currentQuizQuestion.fev1Fvc}</div>
                            </div>
                          )}
                          {currentQuizQuestion.pef && (
                            <div className="bg-white rounded-xl p-3">
                              <div className="text-xs text-slate-500 mb-1">PEF</div>
                              <div className="text-lg font-black text-slate-800">{currentQuizQuestion.pef}</div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="bg-white rounded-xl p-4 mb-4">
                        <p className="text-sm font-bold text-slate-700 mb-3">{currentQuizQuestion.question}</p>
                        <div className="space-y-2">
                          {currentQuizQuestion.options.map((option, idx) => (
                            <label
                              key={idx}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${
                                quizAnswers[currentRoundIndex] === idx
                                  ? 'bg-amber-50 border-amber-300'
                                  : 'bg-slate-50 border-transparent hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="radio"
                                name="answer"
                                className="text-amber-500"
                                checked={quizAnswers[currentRoundIndex] === idx}
                                onChange={() => selectAnswer(idx)}
                              />
                              <span className="text-sm font-bold text-slate-700">{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {quizShowAnalysis && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 mb-4"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 size={20} className="text-emerald-600" />
                            <span className="text-lg font-black text-emerald-700">答案解析</span>
                          </div>
                          <p className="text-sm font-medium text-slate-700 leading-relaxed">
                            {currentQuizQuestion.analysis}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                              正确答案：{currentQuizQuestion.options[currentQuizQuestion.answer]}
                            </span>
                            {quizAnswers[currentRoundIndex] !== undefined && (
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                quizAnswers[currentRoundIndex] === currentQuizQuestion.answer
                                  ? 'bg-emerald-100 text-emerald-600'
                                  : 'bg-red-100 text-red-600'
                              }`}>
                                你的答案：{currentQuizQuestion.options[quizAnswers[currentRoundIndex]]}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      )}

                      <div className="flex gap-3">
                        {!quizShowAnalysis ? (
                          <button
                            onClick={handleShowAnalysis}
                            disabled={quizAnswers[currentRoundIndex] === undefined}
                            className={`flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl py-3 font-bold hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2 ${
                              quizAnswers[currentRoundIndex] === undefined
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            <Lightbulb size={18} />
                            查看解析
                          </button>
                        ) : (
                          <button
                            onClick={handleNextQuestion}
                            className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl py-3 font-bold hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
                          >
                            <ChevronRight size={18} />
                            下一题
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-6 shadow-lg shadow-amber-500/30 text-white"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Lightbulb size={24} className="text-white/90" />
                  <h3 className="text-lg font-black">每日知识</h3>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 mb-4 min-h-[80px]">
                  <p className="text-white font-bold text-sm leading-relaxed">
                    {studentData.dailyKnowledge}
                  </p>
                </div>
                <button 
                  onClick={refreshKnowledge}
                  className="w-full bg-white text-amber-600 rounded-xl py-3 font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                >
                  <BookOpen size={18} />
                  刷新知识
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
              >
                <h3 className="text-lg font-black text-slate-800 mb-4">学习统计</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Clock size={20} className="text-amber-600" />
                      <span className="text-sm font-bold text-slate-700">本周学习</span>
                    </div>
                    <span className="text-xl font-black text-amber-600">{studyTimeMinutes}分钟</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Award size={20} className="text-emerald-600" />
                      <span className="text-sm font-bold text-slate-700">已完成测试</span>
                    </div>
                    <span className="text-xl font-black text-emerald-600">{testsCompleted}次</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
              >
                <h3 className="text-lg font-black text-slate-800 mb-4">快捷入口</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      const element = document.getElementById('study-tasks');
                      if (element) {
                        const offset = element.offsetHeight / 2;
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl py-3 font-bold hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
                  >
                    <BookOpen size={18} />
                    继续学习
                  </button>
                  <button
                    onClick={() => {
                      const element = document.getElementById('quiz-section');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="w-full bg-slate-100 text-slate-700 rounded-xl py-3 font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={18} />
                    做测试
                  </button>
                  <button
                    onClick={() => setShowNoteModal(true)}
                    className="w-full bg-slate-50 text-slate-600 rounded-xl py-3 font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={18} />
                    我的笔记
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.72)_0%,rgba(245,247,255,0.52)_100%)] p-8 shadow-[0_30px_80px_rgba(56,28,140,0.18)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(191,140,225,0.2),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(55,133,216,0.15),transparent_30%)]" />
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-night-pink/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-night-sky/20 blur-3xl" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <motion.h1 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-black text-slate-800"
                  >
                    你好，{currentUser?.username || '访客'}！👋
                  </motion.h1>
                  <motion.p 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-slate-500 font-medium"
                  >
                    今天是 {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                  </motion.p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="搜索报告、知识或计划..." 
                      className="bg-white border-none rounded-2xl py-3 pl-12 pr-6 w-80 shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>
                  <button className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-500 shadow-sm transition-all">
                    <Bell size={20} />
                  </button>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-3 bg-white rounded-2xl p-2 pr-4 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {currentUser?.username ? currentUser.username[0].toUpperCase() : 'U'}
                    </div>
                    <div className="text-left hidden lg:block">
                      <div className="text-sm font-bold text-slate-700">{currentUser?.username || '访客'}</div>
                      <div className="text-xs text-slate-400 font-mono">{currentUser?.id || 'ID 未加载'}</div>
                    </div>
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </header>

      <AnimatePresence mode="wait">
        {currentRole === 'patient' ? (
          <motion.div
            key="patient-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-8 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800 mb-2">健康趋势分析</h2>
                      <p className="text-slate-500 font-medium">肺部功能指标变化趋势</p>
                    </div>
                    <select
                      value={trendRange}
                      onChange={(e) => setTrendRange(Number(e.target.value) as 7 | 30 | 90)}
                      className="bg-slate-50 border-none rounded-xl text-sm font-bold px-4 py-2 focus:ring-0"
                    >
                      <option value={7}>最近 7 天</option>
                      <option value={30}>最近 30 天</option>
                      <option value={90}>最近 90 天</option>
                    </select>
                  </div>

                  <div ref={chartRef} className="w-full h-80 mb-6" />

                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                        <Sparkles size={24} className="text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 mb-1">AI 健康建议</h3>
                        <p className="text-slate-600 text-sm leading-relaxed">
                          您的肺功能稳定，建议春季增加呼吸训练，预防过敏。近期空气质量良好，适合进行户外运动。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-800">为你推荐</h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">精选健康内容与康复训练，横向适配主视图区</p>
                  </div>
                  <BookOpen size={20} className="text-slate-400" />
                </div>

                {loadingRecommendations ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex gap-4 p-4 rounded-2xl border border-slate-100 animate-pulse">
                        <div className="w-32 h-24 rounded-2xl bg-slate-200 flex-shrink-0" />
                        <div className="flex-1 space-y-3 py-1">
                          <div className="h-3 bg-slate-200 rounded w-1/4" />
                          <div className="h-4 bg-slate-200 rounded w-4/5" />
                          <div className="h-3 bg-slate-200 rounded w-full" />
                          <div className="h-3 bg-slate-200 rounded w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {recommendations.slice(0, 6).map((rec, index) => (
                      <motion.a
                        key={index}
                        href={rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + index * 0.06 }}
                        className="group block"
                      >
                        <div className="h-full rounded-[24px] border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4 hover:shadow-lg hover:border-indigo-100 transition-all">
                          <div className="flex gap-4">
                            <div className="w-32 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-slate-100">
                              <img
                                src={rec.image}
                                alt={rec.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-100 text-indigo-600 rounded-full">
                                  {rec.tag}
                                </span>
                                {rec.duration && (
                                  <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full">
                                    {rec.duration}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                  外链 <ChevronRight size={10} />
                                </span>
                              </div>
                              <h4 className="text-base font-black text-slate-800 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                                {rec.title}
                              </h4>
                              <p className="text-sm text-slate-500 line-clamp-2 mt-2 leading-relaxed">
                                {rec.desc}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.a>
                    ))}
                  </div>
                )}
              </motion.div>

            </div>

            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative overflow-hidden rounded-[32px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.72)_0%,rgba(243,246,255,0.52)_100%)] p-6 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
              >
                <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <div>
                      <h3 className="text-lg font-black text-slate-800 mb-1">健康状态</h3>
                      <p className="text-sm text-slate-500 font-medium">概览已精简，保留核心指标与建议</p>
                    </div>
                    <button 
                      onClick={() => onNavigate('segmentation')}
                      className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-all"
                    >
                      <Upload size={18} />
                      上传新报告
                    </button>
                  </div>

                  <div className="space-y-3">
                    {healthTips.map((tip, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`p-4 rounded-2xl ${tip.bg} border border-white/80`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center ${tip.color}`}>
                            <tip.icon size={20} />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-700">{tip.title}</div>
                            <div className="text-xs text-slate-500">{tip.desc}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-indigo-50 p-4 border border-indigo-100">
                      <div className="text-xs font-bold text-slate-500 mb-2">指标达标率</div>
                      <div className="text-3xl font-black text-indigo-500">85%</div>
                      <p className="text-xs text-slate-400 mt-2">比上周提升 12.3%</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
                      <div className="text-xs font-bold text-slate-500 mb-2">近期建议</div>
                      <p className="text-sm font-bold text-emerald-700 leading-relaxed">
                        保持当前监测频率，空气质量良好时可适度户外活动。
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 shadow-lg shadow-indigo-500/30 text-white"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles size={24} className="text-white/90" />
                  <h3 className="text-lg font-black">AI 健康建议</h3>
                </div>
                <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 mb-4">
                  <p className="text-sm font-medium leading-relaxed text-white/90">
                    您的肺功能稳定，建议继续规律监测与呼吸训练；若出现胸闷、持续咳嗽或运动耐量下降，请及时上传最新检查报告。
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('plans')}
                  className="w-full bg-white text-indigo-600 rounded-xl py-3 font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                  <CalendarIcon size={18} />
                  查看康复计划
                </button>
              </motion.div>

            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`${currentRole}-content`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {renderRoleContent()}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddTaskModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddTaskModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />

            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 pointer-events-auto overflow-hidden"
                style={{
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)"
                }}
              >
                <div className="h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                
                <div className="p-6">
                  <div className="flex justify-end mb-4">
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowAddTaskModal(false)}
                      className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <X size={18} className="text-slate-500" />
                    </motion.button>
                  </div>

                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                      <BookOpen size={32} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-2">添加学习任务</h3>
                    <p className="text-sm text-slate-500 font-medium">完善您的学习计划，系统管理学习进度</p>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <FileText size={16} className="text-amber-500" />
                        任务名称 *
                      </label>
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-amber-500 focus:outline-none transition-all"
                        placeholder="如：肺功能报告解读基础"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <Clock size={16} className="text-amber-500" />
                        预计时长
                      </label>
                      <input
                        type="text"
                        value={newTaskDuration}
                        onChange={(e) => setNewTaskDuration(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-amber-500 focus:outline-none transition-all"
                        placeholder="如：20 分钟"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowAddTaskModal(false)}
                      className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
                    >
                      取消
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleAddTask}
                      disabled={!newTaskTitle.trim()}
                      className={`flex-1 px-4 py-3 font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                        !newTaskTitle.trim()
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-amber-500/30'
                      }`}
                    >
                      <Plus size={18} />
                      添加任务
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNoteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoteModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />

            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 pointer-events-auto overflow-hidden flex flex-col max-h-[80vh]"
                style={{
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)"
                }}
              >
                <div className="h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                
                <div className="p-6 flex flex-col h-full">
                  <div className="flex justify-end mb-4">
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowNoteModal(false)}
                      className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <X size={18} className="text-slate-500" />
                    </motion.button>
                  </div>

                  <div className="text-center mb-4">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                      <FileText size={32} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-2">我的笔记</h3>
                    <p className="text-sm text-slate-500 font-medium">记录学习心得和重要知识点</p>
                  </div>

                  <div className="flex-1 mb-4">
                    <textarea
                      value={currentNote || notes}
                      onChange={(e) => setCurrentNote(e.target.value)}
                      className="w-full h-64 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-medium focus:border-amber-500 focus:outline-none transition-all resize-none"
                      placeholder="在这里记录您的学习笔记..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setCurrentNote('');
                        setNotes('');
                        setShowNoteModal(false);
                      }}
                      className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
                    >
                      清空笔记
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSaveNote}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      保存笔记
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPatientDetail && selectedPatient && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPatientDetail(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 pointer-events-auto overflow-hidden"
              >
                <div className="h-2 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div className="p-6">
                  <div className="flex justify-end mb-4">
                    <button onClick={() => setShowPatientDetail(false)} className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center">
                      <X size={18} className="text-slate-500" />
                    </button>
                  </div>
                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-3xl font-black">
                      {selectedPatient.name[0]}
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">{selectedPatient.name}</h3>
                    <p className="text-sm text-slate-500">UID: {selectedPatient.userId}</p>
                    <p className="text-sm text-slate-400 mt-1">患者档案标识: {selectedPatient.id}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-emerald-50 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 mb-1">FEV1</div>
                      <div className="text-2xl font-black text-emerald-600">{selectedPatient.fev1}%</div>
                    </div>
                    <div className="bg-indigo-50 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 mb-1">FVC</div>
                      <div className="text-2xl font-black text-indigo-600">{selectedPatient.fvc}%</div>
                    </div>
                    <div className="bg-purple-50 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 mb-1">FEV1/FVC</div>
                      <div className="text-2xl font-black text-purple-600">{selectedPatient.fev1Fvc}%</div>
                    </div>
                    <div className="bg-amber-50 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 mb-1">PEF</div>
                      <div className="text-2xl font-black text-amber-600">{selectedPatient.pef}%</div>
                    </div>
                  </div>
                  <div className="mb-6 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="text-sm font-bold text-slate-700 mb-2">医生建议</div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {selectedPatient.advice?.trim() || '暂无医生建议'}
                    </p>
                  </div>
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <TrendingUp size={20} className="text-emerald-500" />
                      最近 {trendRange} 天趋势图
                    </h4>
                    <div ref={chartRef} className="w-full h-64 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border-2 border-slate-200" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setShowPatientDetail(false); handleEditPatientData(selectedPatient); }} className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl py-3 font-bold hover:from-emerald-600 hover:to-teal-600 transition-all">
                      写医生建议
                    </button>
                    <button onClick={() => setShowPatientDetail(false)} className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-3 font-bold hover:bg-slate-200 transition-all">
                      关闭
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditData && selectedPatient && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditData(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 pointer-events-auto overflow-hidden"
              >
                <div className="h-2 bg-gradient-to-r from-amber-500 to-orange-500" />
                <div className="p-6">
                  <div className="flex justify-end mb-4">
                    <button onClick={() => setShowEditData(false)} className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center">
                      <X size={18} className="text-slate-500" />
                    </button>
                  </div>
                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-amber-500/25">
                      肺
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">写医生建议</h3>
                    <p className="text-sm text-slate-500">{selectedPatient.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">UID: {selectedPatient.userId}</p>
                  </div>
                  <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="text-xs font-bold text-slate-500 mb-1">已有建议</div>
                    <div className="text-sm text-slate-700 leading-relaxed">
                      {selectedPatient.advice?.trim() || '暂无建议，可填写新的随访与康复建议。'}
                    </div>
                  </div>

                  {doctorAdviceHistory.length > 0 && (
                    <div className="mb-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-xs font-bold text-indigo-500 uppercase tracking-[0.24em]">历史建议</div>
                        <button
                          type="button"
                          onClick={() => setDoctorAdvice(doctorAdviceHistory[0] || '')}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          一键带入最近一条
                        </button>
                      </div>
                      <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
                        {doctorAdviceHistory.map((historyItem, index) => (
                          <button
                            key={`${index}-${historyItem.slice(0, 12)}`}
                            type="button"
                            onClick={() => setDoctorAdvice(historyItem)}
                            className="w-full rounded-2xl bg-white/80 px-3 py-2 text-left text-xs font-medium leading-5 text-slate-600 transition-all hover:bg-white hover:shadow-sm"
                          >
                            {historyItem}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">医生建议内容</label>
                      <textarea
                        value={doctorAdvice}
                        onChange={(e) => setDoctorAdvice(e.target.value)}
                        rows={6}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-medium focus:border-amber-500 focus:outline-none transition-all resize-none"
                        placeholder="请输入针对该患者的复诊、用药、训练或生活方式建议..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowEditData(false)} className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-3 font-bold hover:bg-slate-200 transition-all">取消</button>
                    <button onClick={handleSavePatientData} className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl py-3 font-bold hover:from-amber-600 hover:to-orange-600 transition-all">保存建议</button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfileModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />

            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 pointer-events-auto overflow-hidden"
                style={{
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)"
                }}
              >
                <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                
                <div className="p-6">
                  <div className="flex justify-end mb-4">
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowProfileModal(false)}
                      className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <X size={18} className="text-slate-500" />
                    </motion.button>
                  </div>

                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                      {profileData?.username ? profileData.username[0].toUpperCase() : 'U'}
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-2">个人信息设置</h3>
                    <p className="text-sm text-slate-500 font-medium">完善您的健康档案，获取更精准的建议</p>
                    
                    {profileData?.id && (
                      <div className="mt-4 inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <BadgeCheck size={16} className="text-white" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">USER ID</div>
                          <div className="text-sm font-black text-slate-800 font-mono">{profileData.id}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <BadgeCheck size={16} className="text-indigo-500" />
                        我的身份
                      </label>
                      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
                        {profileData?.role === 'doctor' && (
                          <>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white">
                              <Stethoscope size={20} />
                            </div>
                            <div>
                              <div className="text-sm font-black text-slate-800">医生</div>
                              <div className="text-xs text-slate-500">管理患者健康数据</div>
                            </div>
                          </>
                        )}
                        {profileData?.role === 'patient' && (
                          <>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white">
                              <User size={20} />
                            </div>
                            <div>
                              <div className="text-sm font-black text-slate-800">患者</div>
                              <div className="text-xs text-slate-500">个人健康管理</div>
                            </div>
                          </>
                        )}
                        {profileData?.role === 'student' && (
                          <>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                              <GraduationCap size={20} />
                            </div>
                            <div>
                              <div className="text-sm font-black text-slate-800">学生</div>
                              <div className="text-xs text-slate-500">学习肺功能知识</div>
                            </div>
                          </>
                        )}
                        {!profileData?.role && (
                          <span className="text-sm text-slate-500">未设置</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">* 身份已在注册时设定，暂不支持修改</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">昵称</label>
                      <input
                        type="text"
                        value={profileData?.nickname || ''}
                        maxLength={12}
                        onChange={(e) => {
                          setProfileData({ ...profileData, nickname: e.target.value } as any);
                          setProfileValidationErrors(prev => ({ ...prev, nickname: undefined }));
                        }}
                        className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none transition-all ${profileValidationErrors.nickname ? 'border-red-300' : 'border-slate-200'}`}
                        placeholder="请输入昵称"
                      />
                      <p className="text-xs text-slate-400 mt-2">建议填写 2-12 个字符，避免使用纯符号或无意义内容</p>
                      {profileValidationErrors.nickname && (
                        <p className="text-xs text-red-500 mt-1 font-medium">{profileValidationErrors.nickname}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Droplet size={16} className="text-red-500" />
                          血型
                        </label>
                        <select
                          value={profileData?.bloodType || ''}
                          onChange={(e) => {
                            setProfileData({ ...profileData, bloodType: e.target.value } as any);
                            setProfileValidationErrors(prev => ({ ...prev, bloodType: undefined }));
                          }}
                          className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none transition-all ${profileValidationErrors.bloodType ? 'border-red-300' : 'border-slate-200'}`}
                        >
                          <option value="">未知</option>
                          <option value="A">A 型</option>
                          <option value="B">B 型</option>
                          <option value="O">O 型</option>
                          <option value="AB">AB 型</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-2">仅支持标准血型：A / B / O / AB，不确定可选“未知”</p>
                        {profileValidationErrors.bloodType && (
                          <p className="text-xs text-red-500 mt-1 font-medium">{profileValidationErrors.bloodType}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Ruler size={16} className="text-blue-500" />
                          身高 (cm)
                        </label>
                        <input
                          type="number"
                          min={100}
                          max={230}
                          value={profileData?.height || ''}
                          onChange={(e) => {
                            setProfileData({ ...profileData, height: parseInt(e.target.value) } as any);
                            setProfileValidationErrors(prev => ({ ...prev, height: undefined }));
                          }}
                          className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none transition-all ${profileValidationErrors.height ? 'border-red-300' : 'border-slate-200'}`}
                          placeholder="170"
                        />
                        <p className="text-xs text-slate-400 mt-2">建议范围 100-230 cm，超出范围将无法保存</p>
                        {profileValidationErrors.height && (
                          <p className="text-xs text-red-500 mt-1 font-medium">{profileValidationErrors.height}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <Weight size={16} className="text-green-500" />
                        体重 (kg)
                      </label>
                      <input
                        type="number"
                        min={20}
                        max={250}
                        step="0.1"
                        value={profileData?.weight || ''}
                        onChange={(e) => {
                          setProfileData({ ...profileData, weight: parseFloat(e.target.value) } as any);
                          setProfileValidationErrors(prev => ({ ...prev, weight: undefined }));
                        }}
                        className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none transition-all ${profileValidationErrors.weight ? 'border-red-300' : 'border-slate-200'}`}
                        placeholder="65"
                      />
                      <p className="text-xs text-slate-400 mt-2">建议范围 20-250 kg，支持 1 位小数</p>
                      {profileValidationErrors.weight && (
                        <p className="text-xs text-red-500 mt-1 font-medium">{profileValidationErrors.weight}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowProfileModal(false)}
                      className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
                    >
                      取消
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSaveProfile}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      保存修改
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};
