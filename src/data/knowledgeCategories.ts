import type { KnowledgeCategory } from './medicalKnowledge';

// Literal classes ensure every category color is included in Tailwind's build.
export const categoryStyles: Record<KnowledgeCategory, { badge: string; active: string; top: string; dot: string }> = {
  '肺部解剖': { badge: 'border-sky-200 bg-sky-50 text-sky-700', active: 'border-sky-600 bg-sky-600 text-white', top: 'border-t-sky-400', dot: 'bg-sky-500' },
  '肺结节亚型': { badge: 'border-violet-200 bg-violet-50 text-violet-700', active: 'border-violet-600 bg-violet-600 text-white', top: 'border-t-violet-400', dot: 'bg-violet-500' },
  '影像征象': { badge: 'border-cyan-200 bg-cyan-50 text-cyan-700', active: 'border-cyan-600 bg-cyan-600 text-white', top: 'border-t-cyan-400', dot: 'bg-cyan-500' },
  '肺部病变': { badge: 'border-amber-200 bg-amber-50 text-amber-800', active: 'border-amber-600 bg-amber-600 text-white', top: 'border-t-amber-400', dot: 'bg-amber-500' },
  '症状与体征': { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', active: 'border-emerald-600 bg-emerald-600 text-white', top: 'border-t-emerald-400', dot: 'bg-emerald-500' },
  '疾病术语': { badge: 'border-rose-200 bg-rose-50 text-rose-700', active: 'border-rose-600 bg-rose-600 text-white', top: 'border-t-rose-400', dot: 'bg-rose-500' },
};
