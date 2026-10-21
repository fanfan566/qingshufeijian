import React, { useMemo, useState } from 'react';
import { categoryStyles } from '../data/knowledgeCategories';
import { cn } from '../lib/utils';
import { BookOpen } from 'lucide-react';
import { matchKnowledge, type KnowledgeEntry, type KnowledgeFinding } from '../data/medicalKnowledge';
import { KnowledgeDetail, KnowledgeDisclaimer } from './KnowledgeDetail';

export function RelatedKnowledge({ findings }: { findings: KnowledgeFinding[] }) {
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null);
  const matches = useMemo(() => matchKnowledge(findings), [findings]);
  return <section className="soft-card p-6" aria-label="关联医学解读">
    <details open>
      <summary className="cursor-pointer text-base font-black text-night-deep"><BookOpen className="mr-2 inline text-night-royal" size={18} />关联医学解读</summary>
      <p className="mb-4 mt-3 text-xs leading-6 text-slate-500">按本次分析标签关联术语说明，仅解释已有结果，不改变 AI 结论；关联词条不代表已确诊。</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {matches.map(({ finding, entries }) => entries.length ? entries.map(entry =>
          <button key={`${finding.id}-${entry.code}`} title={entry.brief} onClick={() => setSelected(entry)} className="rounded-2xl border border-purple-100 bg-white/80 p-4 text-left transition hover:border-night-lavender">
            <span className="text-[11px] font-bold text-night-lavender">{finding.id}</span>
            <span className={cn('ml-2 rounded-full border px-2 py-1 text-[10px] font-bold', categoryStyles[entry.category].badge)}>{entry.category}</span>
            <h4 className="my-2 text-sm font-black text-night-deep">{entry.name}</h4>
            <p className="text-xs leading-6 text-slate-500">{entry.brief}</p>
            <span className="mt-3 block text-xs font-bold text-night-royal">查看详情 →</span>
          </button>) : <div key={finding.id} className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs leading-6 text-slate-500">{finding.id}：{finding.name || finding.label_code || finding.type || '未提供标签'}，暂无对应词条，建议咨询影像科医师。</div>)}
      </div>
      {!findings.length && <p className="mb-4 text-sm text-slate-500">本次分析暂无可关联的病灶标签。</p>}
    </details>
    <KnowledgeDisclaimer />
    {selected && <KnowledgeDetail entry={selected} onClose={() => setSelected(null)} />}
  </section>;
}
