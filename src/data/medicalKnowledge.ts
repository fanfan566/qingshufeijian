import coreEntries from './medicalKnowledgeCore.json';
export const CORE_KNOWLEDGE_CATEGORIES = ['肺部解剖', '肺结节亚型', '影像征象', '肺部病变'] as const;
export const KNOWLEDGE_CATEGORIES = [...CORE_KNOWLEDGE_CATEGORIES, '症状与体征', '疾病术语'] as const;
export type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number];
export interface KnowledgeEntry {
  code: string;
  name: string;
  category: KnowledgeCategory;
  aliases: string[];
  brief: string;
  feature?: string;
  risk?: string;
  follow?: string;
  differential?: string;
  englishName?: string;
  kind?: 'core' | 'ontology';
  respiratory?: boolean;
  definition?: string;
  definitionSources?: string;
  parents?: { code: string; name: string }[];
  xrefs?: string[];
  sourceInfo?: { name: string; version: string; url: string; license: string; licenseUrl: string; translation?: string; translationUrl?: string };
  references: { title: string; url: string }[];
}
export const KNOWLEDGE_DISCLAIMER = '提示：本知识库内容仅为影像科普与 AI 结果辅助解读参考，不可作为临床诊断依据，诊疗方案请遵从执业医师指导。';

export const medicalKnowledge: KnowledgeEntry[] = coreEntries as KnowledgeEntry[];

export function searchKnowledge(query: string, category: KnowledgeCategory | '全部' = '全部') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return medicalKnowledge.filter(entry => (category === '全部' || entry.category === category) &&
    terms.every(term => [entry.name, entry.code, entry.brief, entry.feature || '', ...entry.aliases].join(' ').toLocaleLowerCase().includes(term)));
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
