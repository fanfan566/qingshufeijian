import type { KnowledgeCategory, KnowledgeEntry } from '../data/medicalKnowledge';

export interface KnowledgeSummary {
  code: string; name: string; englishName?: string; category: KnowledgeCategory;
  brief: string; kind: 'core' | 'ontology'; respiratory: boolean; source?: 'hpo' | 'mondo';
}
export interface KnowledgeMetadata {
  total: number; coreTotal: number; respiratoryTotal: number; chineseTotal: number;
  categories: { name: KnowledgeCategory; count: number; respiratoryCount: number }[];
  sources: Record<string, NonNullable<KnowledgeEntry['sourceInfo']>>;
}
export interface KnowledgeResults {
  items: KnowledgeSummary[]; total: number; page: number; pageSize: number; pages: number;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/knowledge' + path, { signal });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('知识库 API 未连接，请确认 Node 服务已启动。');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '知识数据加载失败，请稍后重试。');
  return data as T;
}
export const getKnowledgeMetadata = (signal?: AbortSignal) => get<KnowledgeMetadata>('/metadata', signal);
export const getKnowledgeEntry = (code: string, signal?: AbortSignal) => get<KnowledgeEntry>('/' + encodeURIComponent(code), signal);
export const findKnowledge = (params: { q: string; category: string; scope: string; sort: string; page: number; pageSize: number }, signal?: AbortSignal) =>
  get<KnowledgeResults>('?' + new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])), signal);
