import React, { useEffect, useState } from 'react';
import { BookOpen, Search, ArrowUpRight, X, LibraryBig, ChevronLeft, ChevronRight, RefreshCw, Database, Languages, Wind, ExternalLink } from 'lucide-react';
import { KNOWLEDGE_CATEGORIES } from '../data/medicalKnowledge';
import { categoryStyles } from '../data/knowledgeCategories';
import { KnowledgeDetail, KnowledgeDisclaimer } from '../components/KnowledgeDetail';
import { findKnowledge, getKnowledgeMetadata, type KnowledgeMetadata, type KnowledgeResults, type KnowledgeSummary } from '../services/knowledgeService';
import { cn } from '../lib/utils';

const number = (value?: number) => value === undefined ? '—' : value.toLocaleString('zh-CN');
const initialFilters = { q: '', category: '全部', scope: 'all', sort: 'relevance', page: 1, pageSize: 24 };

export function KnowledgeLibraryPage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [metadata, setMetadata] = useState<KnowledgeMetadata | null>(null);
  const [results, setResults] = useState<KnowledgeResults | null>(null);
  const [selected, setSelected] = useState<KnowledgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(previous => previous.q === query.trim() ? previous : { ...previous, q: query.trim(), page: 1 }), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([metadata ? Promise.resolve(metadata) : getKnowledgeMetadata(controller.signal), findKnowledge(filters, controller.signal)])
      .then(([info, data]) => { if (!controller.signal.aborted) { setMetadata(info); setResults(data); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || '知识数据加载失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, retry]);
  const reset = () => { setQuery(''); setFilters(initialFilters); };
  const changePage = (page: number) => { setFilters(previous => ({ ...previous, page })); };
  const pageNumbers = results ? Array.from(new Set([1, ...Array.from({ length: 5 }, (_, i) => results.page - 2 + i).filter(value => value > 1 && value < results.pages), results.pages])) : [];
  return <div className="min-h-screen bg-brand-bg p-6 xl:p-10">
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-night-lavender/15 px-4 py-1.5 text-xs font-bold text-night-royal"><BookOpen size={15} />影像解读 · 医学术语 · 可追溯来源</span>
        <h1 className="text-3xl font-black text-night-deep xl:text-4xl">肺部医学知识库</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-500">从肺部影像解读，延伸到疾病与临床表型。支持中文名称、英文同义词及标准编码检索；仅供科普参考，不替代医师诊断。</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3" aria-label="知识库数据概览">
        {[
          { label: '全库知识记录', count: metadata?.total, icon: Database, color: 'text-night-royal bg-purple-50' },
          { label: '呼吸专题记录', count: metadata?.respiratoryTotal, icon: Wind, color: 'text-sky-600 bg-sky-50' },
          { label: '具有中文名称', count: metadata?.chineseTotal, icon: Languages, color: 'text-emerald-600 bg-emerald-50' },
        ].map(item => <div key={item.label} className="soft-card flex items-center gap-4 p-5">
          <span className={cn('rounded-2xl p-3', item.color)}><item.icon size={22} /></span>
          <div><div className="text-2xl font-black tracking-tight text-night-deep">{number(item.count)}</div><div className="mt-1 text-xs text-slate-500">{item.label}</div></div>
        </div>)}
      </div>
      <section className="soft-card space-y-5 p-5 sm:p-7" aria-label="知识检索">
        <form className="flex items-center gap-3 rounded-2xl border border-purple-100 bg-white p-2 pl-4" onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, q: query.trim(), page: 1 })); }} role="search">
          <Search size={21} className="shrink-0 text-night-lavender" />
          <input aria-label="搜索医学知识" maxLength={256} placeholder="搜索：呼吸困难 / asthma / HP:0002099" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
          {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')} className="rounded-xl p-2 text-slate-400 hover:bg-purple-50"><X size={18} /></button>}
          <button type="submit" className="rounded-xl bg-night-royal px-5 py-3 text-sm font-bold text-white">搜索</button>
        </form>
        <div className="flex flex-wrap items-center gap-2" aria-label="检索范围">
          {[{ value: 'all', label: '全医学知识', count: metadata?.total }, { value: 'respiratory', label: '呼吸专题', count: metadata?.respiratoryTotal }].map(item => <button key={item.value} type="button" aria-pressed={filters.scope === item.value} onClick={() => setFilters(previous => ({ ...previous, scope: item.value, page: 1 }))} className={cn('rounded-xl border px-4 py-2 text-xs font-bold', filters.scope === item.value ? 'border-night-royal bg-night-royal text-white' : 'border-purple-100 bg-white text-slate-500')}>{item.label}<span className="ml-2 opacity-70">{number(item.count)}</span></button>)}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="词条分类">
          <button type="button" aria-pressed={filters.category === '全部'} onClick={() => setFilters(previous => ({ ...previous, category: '全部', page: 1 }))} className={cn('rounded-full border px-4 py-2 text-xs font-bold', filters.category === '全部' ? 'border-night-royal bg-night-royal text-white' : 'border-purple-100 bg-white text-slate-500')}>全部分类</button>
          {KNOWLEDGE_CATEGORIES.map(category => {
            const styles = categoryStyles[category];
            const count = metadata?.categories.find(item => item.name === category);
            return <button type="button" key={category} aria-pressed={filters.category === category} onClick={() => setFilters(previous => ({ ...previous, category, page: 1 }))} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition', filters.category === category ? styles.active : styles.badge)}><span className={cn('h-1.5 w-1.5 rounded-full', filters.category === category ? 'bg-white' : styles.dot)} />{category}<span className="opacity-65">{number(filters.scope === 'respiratory' ? count?.respiratoryCount : count?.count)}</span></button>;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>试着搜索：</span>{['磨玻璃结节', '呼吸困难', '哮喘', 'pulmonary fibrosis'].map(term => <button key={term} onClick={() => { setQuery(term); setFilters(previous => ({ ...previous, q: term, category: '全部', scope: 'all', page: 1 })); }} className="rounded-lg px-2 py-1 text-night-royal hover:bg-purple-100">{term}</button>)}</div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm" id="knowledge-results">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-night-deep"><LibraryBig size={18} />{filters.category === '全部' ? '全部知识词条' : filters.category}</h2>
          <p aria-live="polite" className="mt-2 text-xs text-slate-400">{loading ? '正在检索…' : error ? '检索暂不可用' : `找到 ${number(results?.total)} 条记录 · 第 ${results?.page || 1} / ${results?.pages || 1} 页`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-500">排序 <select aria-label="词条排序" value={filters.sort} onChange={event => setFilters(previous => ({ ...previous, sort: event.target.value, page: 1 }))} className="ml-2 rounded-xl border border-purple-100 bg-white p-2 text-night-deep"><option value="relevance">相关度优先</option><option value="name">名称排序</option></select></label>
          <label className="text-xs text-slate-500">每页 <select aria-label="每页条数" value={filters.pageSize} onChange={event => setFilters(previous => ({ ...previous, pageSize: Number(event.target.value), page: 1 }))} className="ml-2 rounded-xl border border-purple-100 bg-white p-2 text-night-deep">{[12, 24, 48].map(value => <option key={value} value={value}>{value} 条</option>)}</select></label>
        </div>
      </div>
      <div aria-busy={loading}>
        {loading ? <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3" role="status" aria-label="正在加载知识词条">{Array.from({ length: 6 }, (_, index) => <div key={index} className="soft-card h-64 animate-pulse p-6"><div className="mb-6 h-5 w-24 rounded-full bg-purple-100" /><div className="mb-4 h-6 w-3/4 rounded-lg bg-purple-100/70" /><div className="h-16 rounded-xl bg-slate-100" /></div>)}</div> : error ?
          <div className="soft-card p-10 text-center" role="alert"><h3 className="font-bold text-night-deep">{error}</h3><button onClick={() => setRetry(value => value + 1)} className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-night-royal px-5 py-3 text-sm font-bold text-white"><RefreshCw size={16} />重新加载</button></div> : results?.items.length ?
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3" aria-label="知识词条列表">{results.items.map(entry => {
            const styles = categoryStyles[entry.category];
            return <button key={entry.code} onClick={() => setSelected(entry)} className={cn('soft-card group flex min-w-0 flex-col items-start border-t-4 p-6 text-left transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-night-royal', styles.top)}>
              <div className="mb-4 flex w-full items-center justify-between gap-2"><span className={cn('rounded-full border px-3 py-1 text-[11px] font-bold', styles.badge)}>{entry.category}</span><span className="text-[10px] text-slate-400">{entry.kind === 'core' ? '核心解读' : entry.source === 'hpo' ? 'HPO 术语' : 'MONDO 术语'}</span></div>
              <h3 className="mb-2 break-words text-lg font-black leading-7 text-night-deep">{entry.name}</h3>
              {entry.englishName && entry.englishName !== entry.name && <p lang="en" className="mb-3 break-words text-xs leading-5 text-slate-400">{entry.englishName}</p>}
              <p className="mb-4 line-clamp-3 text-sm leading-7 text-slate-500">{entry.brief}</p>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px]"><span className="font-mono text-slate-400">{entry.code}</span>{entry.respiratory && <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-600">呼吸专题</span>}</div>
              <span className="mt-auto flex w-full items-center justify-between border-t border-purple-100 pt-4 text-xs font-bold text-night-royal">{entry.kind === 'core' ? '查看影像特征与参考依据' : '查看原始定义与来源'}<ArrowUpRight size={16} /></span>
            </button>;
          })}</div> : <div className="soft-card p-12 text-center"><Search className="mx-auto mb-4 text-night-lavender" size={36} /><h3 className="font-bold text-night-deep">暂无相关词条，可尝试其他关键词</h3><p className="mt-2 text-sm text-slate-400">试试中文名称、英文同义词或标准编码，也可以切换检索范围。</p><button onClick={reset} className="mt-5 rounded-xl bg-night-royal px-5 py-3 text-sm font-bold text-white">重置筛选</button></div>}
      </div>
      {!loading && !error && !!results?.total && <nav aria-label="知识词条分页" className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white bg-white/70 p-4">
        <p className="text-xs text-slate-500">显示 {number((results.page - 1) * results.pageSize + 1)}–{number(Math.min(results.page * results.pageSize, results.total))} 条，共 {number(results.total)} 条</p>
        <div className="flex flex-wrap items-center gap-2">
          <button aria-label="上一页" disabled={results.page === 1} onClick={() => changePage(results.page - 1)} className="rounded-xl bg-white p-2 text-night-royal disabled:opacity-30"><ChevronLeft size={18} /></button>
          {pageNumbers.map((page, index) => <React.Fragment key={page}>{index > 0 && page - pageNumbers[index - 1] > 1 && <span className="px-1 text-slate-400">…</span>}<button aria-label={`第 ${page} 页`} aria-current={page === results.page ? 'page' : undefined} onClick={() => changePage(page)} className={cn('min-w-9 rounded-xl px-2 py-2 text-xs font-bold', page === results.page ? 'bg-night-royal text-white' : 'bg-white text-slate-500')}>{page}</button></React.Fragment>)}
          <button aria-label="下一页" disabled={results.page === results.pages} onClick={() => changePage(results.page + 1)} className="rounded-xl bg-white p-2 text-night-royal disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      </nav>}
      <details className="rounded-3xl border border-purple-100 bg-white/60 p-5">
        <summary className="cursor-pointer text-sm font-bold text-night-deep">数据来源与内容范围</summary>
        <p className="mt-3 text-xs leading-6 text-slate-500">核心词条提供影像解读；扩展记录来自 HPO 和 MONDO，按有效标准编码计数，同义词不重复计数。HPO 部分具有官方中文名称，扩展定义保留英文原文；未提供的诊疗建议不会自动生成。呼吸专题按来源本体分支和名称关键词归类，不代表疾病诊断。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{metadata && Object.entries(metadata.sources).map(([key, source]) => <div key={key} className="rounded-2xl bg-white p-4 text-xs leading-6 text-slate-500"><a href={source.url} target="_blank" rel="noopener noreferrer" className="font-bold text-night-royal">{source.name}<ExternalLink size={12} className="ml-1 inline" /></a><p>版本：{source.version}</p><a href={source.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">许可：{source.license}</a>{source.translationUrl && <a href={source.translationUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-night-royal underline">中文译名来源</a>}</div>)}</div>
      </details>
      <KnowledgeDisclaimer />
    </div>
    {selected && <KnowledgeDetail entry={selected} onClose={() => setSelected(null)} />}
  </div>;
}
