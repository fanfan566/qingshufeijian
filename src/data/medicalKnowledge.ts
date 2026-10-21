export const KNOWLEDGE_CATEGORIES = ['肺部解剖', '肺结节亚型', '影像征象', '肺部病变'] as const;
export type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number];
export interface KnowledgeEntry {
  code: string;
  name: string;
  category: KnowledgeCategory;
  aliases: string[];
  brief: string;
  feature: string;
  risk: string;
  follow: string;
  differential: string;
  references: { title: string; url: string }[];
}
export const KNOWLEDGE_DISCLAIMER = '提示：本知识库内容仅为影像科普与 AI 结果辅助解读参考，不可作为临床诊断依据，诊疗方案请遵从执业医师指导。';

const glossary = { title: 'Fleischner Society：胸部影像术语表（Radiology, 2008）', url: 'https://doi.org/10.1148/radiol.2462070712' };
const noduleGuide = { title: 'Fleischner Society：偶发肺结节管理指南（Radiology, 2017）', url: 'https://doi.org/10.1148/radiol.2017161659' };
const followNodule = '由医师结合结节大小、实性成分、变化趋势、年龄及吸烟史制定复查计划。偶发结节指南不适用于所有人群，例如儿童、免疫抑制或已知肿瘤患者；请勿自行套用复查间隔。';
const noduleRisk = '结节是一种影像表现，并不等于肺癌。单次影像或 AI 风险分数不能确定良恶性，需结合既往影像与临床评估。';

export const medicalKnowledge: KnowledgeEntry[] = [
  {
    code: 'LUNG_ANATOMY', name: '肺叶与双肺解剖', category: '肺部解剖', aliases: ['左肺', '右肺', '肺叶', '肺部结构', 'lung'],
    brief: '右肺通常分为三叶，左肺分为两叶；CT 上的左右方向需按影像方位标识识别。',
    feature: '肺叶之间由叶间裂分隔。肺窗观察肺实质和支气管，纵隔窗帮助观察心脏、血管及纵隔结构。',
    risk: '单层切片中的左右肺面积受层面、体位、心脏及分割误差影响，面积比例不能单独判定肺部疾病。',
    follow: '复核原始序列与方位标识，确认双肺完整覆盖；分割掩膜仅用于辅助定位。',
    differential: '应区分真实容积改变、切片层面差异及掩膜漏分割。', references: [glossary],
  },
  {
    code: 'AIRWAY', name: '支气管与肺血管', category: '肺部解剖', aliases: ['气道', '支气管', '血管', 'bronchus'],
    brief: '支气管输送空气，肺血管参与气体交换；它们在 CT 中常呈分支状。',
    feature: '充气支气管腔表现为低密度，血管通常表现为软组织密度。横断血管有时呈圆形，需要多层连续追踪。',
    risk: '单张截图中的圆形影可能是血管横断面，不能仅凭形状确定为结节。',
    follow: '通过连续薄层、多平面重建判断结构走行，由影像科医师复核。',
    differential: '血管横断面、支气管壁与真正肺结节。', references: [glossary],
  },
  {
    code: 'NODULE_SOLID', name: '实性肺结节', category: '肺结节亚型', aliases: ['实性结节', '实性', 'solid'],
    brief: '密度较高，可遮蔽其内部原有的血管和支气管结构。',
    feature: '在薄层肺窗中呈相对实性的局灶性影，需记录大小、边缘、钙化及与周围结构的关系。',
    risk: noduleRisk, follow: followNodule, differential: '炎性结节、肉芽肿、良性肿瘤及恶性肿瘤等。', references: [glossary, noduleGuide],
  },
  {
    code: 'NODULE_GGO', name: '纯磨玻璃结节', category: '肺结节亚型', aliases: ['磨玻璃结节', '纯磨玻璃', 'ground_glass', 'ggo', 'pggn'],
    brief: '局部肺密度轻度增高，但仍可看清内部血管和支气管结构，未见明确实性成分。',
    feature: '薄层 CT 上呈局灶性磨玻璃密度，应确认是否持续存在，并与既往影像比较大小及密度变化。',
    risk: '可见于暂时性炎症等多种情况；持续存在的结节也可能与腺癌谱系病变相关，不能仅凭“磨玻璃”判定。',
    follow: followNodule, differential: '局灶炎症、出血、局灶纤维化及腺癌谱系病变等。', references: [glossary, noduleGuide],
  },
  {
    code: 'NODULE_MIX', name: '部分实性结节', category: '肺结节亚型', aliases: ['混合磨玻璃结节', '混合性结节', '混合性', 'part-solid', 'part_solid', 'mixed'],
    brief: '同一结节中同时存在磨玻璃成分和实性成分，也称混合磨玻璃结节。',
    feature: '需分别观察整个结节及实性部分，并使用可比较的薄层 CT 技术记录变化。',
    risk: '持续存在或实性成分增加时应重视，但感染等良性情况也可出现类似表现。',
    follow: followNodule, differential: '炎症性结节、机化性改变及腺癌谱系病变。', references: [glossary, noduleGuide],
  },
  {
    code: 'NODULE_SUBSOLID', name: '亚实性结节', category: '肺结节亚型', aliases: ['亚实性', 'subsolid', 'sub-solid'],
    brief: '包含纯磨玻璃结节和部分实性结节的上位类别，不能直接等同于混合结节。',
    feature: '部分或全部呈磨玻璃密度。是否存在实性成分需在薄层 CT 上进一步判断。',
    risk: noduleRisk, follow: followNodule, differential: '暂时性炎症与持续存在的亚实性病变。', references: [glossary, noduleGuide],
  },
  {
    code: 'SPICULATION', name: '毛刺征', category: '影像征象', aliases: ['毛刺', 'spiculation'],
    brief: '病灶边缘向周围肺组织伸出细线状影，是需要结合其他信息判断的影像征象。',
    feature: '结节或肿块边缘可见细条状放射影，应与正常血管、纤维条索区分。',
    risk: '可增加对恶性病变的关注，但炎症及纤维化也可呈类似表现；并非确诊依据。',
    follow: '由医师综合大小、增长、其他征象及临床危险因素评估，必要时进一步检查。',
    differential: '肿瘤相关间质改变、炎症及瘢痕纤维化。', references: [glossary],
  },
  {
    code: 'PLEURAL_TRACTION', name: '胸膜牵拉', category: '影像征象', aliases: ['胸膜凹陷', '胸膜牵拉征', 'pleural retraction'],
    brief: '病灶与胸膜之间可见条索或胸膜局部凹陷，需结合周围结构综合判断。',
    feature: '胸膜局部形态改变或由病灶延伸至胸膜的线状影。',
    risk: '可见于纤维化和肿瘤相关改变，不能据此单独判断是否恶性。',
    follow: '复核多平面重建及既往影像，结合病灶整体特征评估。',
    differential: '瘢痕、炎症后纤维化、邻近肿瘤等。', references: [glossary],
  },
  {
    code: 'GROUND_GLASS_OPACITY', name: '磨玻璃影', category: '影像征象', aliases: ['磨玻璃密度影', '磨玻璃影', 'ground glass opacity'],
    brief: '肺密度增高但尚未完全遮蔽内部结构，是一种描述性征象，并不一定形成结节。',
    feature: '可局灶、多灶或弥漫分布；需要结合分布、伴随征象与检查技术判断。',
    risk: '感染、肺水肿、出血、间质性病变等均可能出现，不能直接等同于肿瘤。',
    follow: '结合症状、病程及临床检查确定原因，按医师建议复查。',
    differential: '感染、肺水肿、出血、间质性肺病及局灶性肿瘤相关改变。', references: [glossary],
  },
  {
    code: 'CONSOLIDATION', name: '肺实变', category: '影像征象', aliases: ['实变', 'consolidation'],
    brief: '肺泡内气体被液体、细胞等替代，影像上密度增高，血管轮廓可被遮蔽。',
    feature: '可呈片状或肺叶分布，内部有时可见空气支气管征。',
    risk: '常见于感染，也可见于出血、机化性肺炎等，需结合病史。',
    follow: '有发热、咳嗽或呼吸困难时及时就医；后续检查由临床医师决定。',
    differential: '感染、机化性肺炎、肺水肿、出血等。', references: [glossary],
  },
  {
    code: 'EMPHYSEMA', name: '肺气肿', category: '肺部病变', aliases: ['肺气肿', 'emphysema'],
    brief: '与肺泡远端气腔扩大及肺泡壁破坏有关，CT 可见局部低密度改变。',
    feature: '肺内低密度区，可伴血管纹理减少；具体分型和范围需完整 CT 评估。',
    risk: '影像表现不能单独诊断慢阻肺或确定肺功能受损程度。',
    follow: '结合吸烟史、症状及肺功能检查，由呼吸专科制定评估与管理方案。',
    differential: '肺囊肿、肺大疱、马赛克灌注及其他低密度改变。', references: [glossary, { title: '美国 NHLBI：慢性阻塞性肺疾病（COPD）', url: 'https://www.nhlbi.nih.gov/health/copd' }],
  },
  {
    code: 'FIBROSIS', name: '肺纤维化', category: '肺部病变', aliases: ['肺纤维化', '纤维化', 'fibrosis'],
    brief: '肺组织瘢痕性改变，可伴网格影、牵拉性支气管扩张和结构扭曲。',
    feature: '可出现网状密度增高、肺结构变形及肺容积缩小；蜂窝改变是部分疾病中的表现。',
    risk: '纤维化是一类改变，不等同于特发性肺纤维化；病因及分型需要专科判断。',
    follow: '结合高分辨率 CT、肺功能、暴露史与必要的实验室检查，由专科综合评估。',
    differential: '间质性肺病、感染后瘢痕、药物或放射相关损伤等。', references: [glossary, { title: '美国 NHLBI：特发性肺纤维化', url: 'https://www.nhlbi.nih.gov/health/idiopathic-pulmonary-fibrosis' }],
  },
  {
    code: 'PNEUMONIA', name: '肺炎', category: '肺部病变', aliases: ['肺炎', 'pneumonia'],
    brief: '肺部感染可造成肺组织炎症，影像表现需与症状和实验室检查共同解读。',
    feature: '可表现为实变、磨玻璃影或小叶中心结节等，分布与病因各异。',
    risk: 'CT 或 AI 标签不能单独确定感染病原体，也不能据此自行选择抗感染药物。',
    follow: '出现发热、咳嗽、气促应就医；明显呼吸困难等急性症状需及时急诊评估。',
    differential: '肺水肿、出血、机化性肺炎及其他非感染性病变。', references: [glossary, { title: '美国 NHLBI：肺炎', url: 'https://www.nhlbi.nih.gov/health/pneumonia' }],
  },
  {
    code: 'COPD', name: '慢性阻塞性肺疾病', category: '肺部病变', aliases: ['慢阻肺', 'COPD'],
    brief: '以持续气流受限等为特征的慢性呼吸系统疾病，诊断需要结合肺功能等临床证据。',
    feature: 'CT 可见肺气肿、气道壁增厚或气体潴留，但影像正常也不能完全排除。',
    risk: '吸烟及其他有害颗粒、气体暴露是相关危险因素，影像标签不等于临床确诊。',
    follow: '有持续咳嗽、咳痰、活动后气促者，可就诊呼吸专科，按医师建议行肺功能检查。',
    differential: '哮喘、支气管扩张及其他导致慢性呼吸症状的疾病。', references: [{ title: '美国 NHLBI：慢性阻塞性肺疾病（COPD）', url: 'https://www.nhlbi.nih.gov/health/copd' }],
  },
];

export function searchKnowledge(query: string, category: KnowledgeCategory | '全部' = '全部') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return medicalKnowledge.filter(entry => (category === '全部' || entry.category === category) &&
    terms.every(term => [entry.name, entry.code, entry.brief, entry.feature, ...entry.aliases].join(' ').toLocaleLowerCase().includes(term)));
}

export type KnowledgeFinding = { id: string; name?: string; type?: string; label_code?: string; signs?: string[] };
const typeCodes: Record<string, string> = { solid: 'NODULE_SOLID', ground_glass: 'NODULE_GGO', subsolid: 'NODULE_SUBSOLID', mixed: 'NODULE_MIX', part_solid: 'NODULE_MIX' };
export function matchKnowledge(findings: KnowledgeFinding[]) {
  return findings.map(finding => {
    const labels = [finding.label_code, ...(finding.signs || [])].filter((value): value is string => !!value).map(value => value.toUpperCase());
    // Explicit label codes take precedence over the legacy type adapter.
    if (!finding.label_code && finding.type && typeCodes[finding.type]) labels.push(typeCodes[finding.type]);
    const entries = medicalKnowledge.filter(entry => labels.includes(entry.code) ||
      (!finding.label_code && !!finding.name && [entry.name, ...entry.aliases].some(alias => alias.toLowerCase() === finding.name!.trim().toLowerCase())) ||
      (finding.signs || []).some(sign => [entry.name, ...entry.aliases].includes(sign)));
    return { finding, entries };
  });
}
