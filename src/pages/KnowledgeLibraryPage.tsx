import React, { useMemo, useState } from 'react';
import { BookOpen, Search, ArrowUpRight, X, LibraryBig } from 'lucide-react';
import { KNOWLEDGE_CATEGORIES, medicalKnowledge, searchKnowledge, type KnowledgeCategory, type KnowledgeEntry } from '../data/medicalKnowledge';
import { KnowledgeDetail, KnowledgeDisclaimer } from '../components/KnowledgeDetail';
import { cn } from '../lib/utils';

export function KnowledgeLibraryPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory | '全部'>('全部');
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null);
  const entries = useMemo(() => searchKnowledge(query, category), [query, category]);
  return <div className="min-h-screen bg-brand-bg p-6 xl:p-10">
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-night-lavender/15 px-4 py-1.5 text-xs font-bold text-night-royal"><BookOpen size={15} />影像术语 · 医学解读</span>
        <h1 className="text-3xl font-black text-night-deep xl:text-4xl">肺部医学知识库</h1>
        <p className="text-sm leading-7 text-slate-500">从一个影像术语开始，理解肺部结构、结节类型与常见病变。仅供科普参考，不替代医师诊断。</p>
      </header>
      <section className="soft-card space-y-5 p-5 sm:p-7" aria-label="知识检索">
        <form className="flex items-center gap-3 rounded-2xl border border-purple-100 bg-white p-2 pl-4" onSubmit={event => event.preventDefault()} role="search">
          <Search size={21} className="shrink-0 text-night-lavender" />
          <input aria-label="搜索医学知识" placeholder="搜索疾病、影像征象或编码，如：磨玻璃结节" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
          {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')} className="rounded-xl p-2 text-slate-400 hover:bg-purple-50"><X size={18} /></button>}
          <button type="submit" className="rounded-xl bg-night-royal px-5 py-3 text-sm font-bold text-white">搜索</button>
        </form>
        <div className="flex flex-wrap gap-2" aria-label="词条分类">
          {(['全部', ...KNOWLEDGE_CATEGORIES] as const).map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)} className={cn('rounded-full border px-4 py-2 text-xs font-bold transition', category === item ? 'border-night-royal bg-night-royal text-white shadow-lg shadow-purple-200/50' : 'border-purple-100 bg-white text-slate-500 hover:border-night-lavender')}>{item}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>热门词条：</span>{['磨玻璃结节', '毛刺征', '肺纤维化'].map(term => <button key={term} onClick={() => { setQuery(term); setCategory('全部'); }} className="rounded-lg px-2 py-1 text-night-royal hover:bg-purple-100">{term}</button>)}</div>
      </section>
      <div className="flex items-center justify-between text-sm">
        <h2 className="flex items-center gap-2 font-bold text-night-deep"><LibraryBig size={18} />{category === '全部' ? '全部知识词条' : category}</h2>
        <span aria-live="polite" className="text-xs text-slate-400">找到 {entries.length} 条 · 共 {medicalKnowledge.length} 条</span>
      </div>
      {entries.length ? <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {entries.map(entry => <button key={entry.code} onClick={() => setSelected(entry)} className="soft-card group flex flex-col items-start p-6 text-left transition hover:-translate-y-1 hover:border-night-lavender/60 focus-visible:outline-2 focus-visible:outline-night-royal">
          <div className="mb-5 flex w-full items-center justify-between"><span className="rounded-full bg-night-lavender/10 px-3 py-1 text-[11px] font-bold text-night-royal">{entry.category}</span><ArrowUpRight size={18} className="text-slate-300 transition group-hover:text-night-royal" /></div>
          <h3 className="mb-3 text-lg font-black text-night-deep">{entry.name}</h3>
          <p className="mb-5 text-sm leading-7 text-slate-500">{entry.brief}</p>
          <span className="mt-auto border-t border-purple-100 pt-4 text-xs font-bold text-night-royal">查看影像特征与参考依据 →</span>
        </button>)}
      </div> : <div className="soft-card p-12 text-center">
        <Search className="mx-auto mb-4 text-night-lavender" size={36} />
        <h3 className="font-bold text-night-deep">暂无相关词条，可尝试其他关键词</h3>
        <p className="mt-2 text-sm text-slate-400">也可以切换分类，或清空筛选浏览全部内容。</p>
        <button onClick={() => { setQuery(''); setCategory('全部'); }} className="mt-5 rounded-xl bg-night-royal px-5 py-3 text-sm font-bold text-white">重置筛选</button>
      </div>}
      <KnowledgeDisclaimer />
    </div>
    {selected && <KnowledgeDetail entry={selected} onClose={() => setSelected(null)} />}
  </div>;
}
