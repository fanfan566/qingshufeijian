import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Info, Loader2, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { KNOWLEDGE_DISCLAIMER, type KnowledgeEntry } from '../data/medicalKnowledge';
import { categoryStyles } from '../data/knowledgeCategories';
import { getKnowledgeEntry, type KnowledgeSummary } from '../services/knowledgeService';
import { cn } from '../lib/utils';

export function KnowledgeDisclaimer() {
  return <p className="flex items-start gap-2 rounded-2xl border border-purple-100 bg-purple-50/80 p-4 text-xs leading-6 text-slate-500"><Info size={16} className="mt-1 shrink-0 text-night-lavender" />{KNOWLEDGE_DISCLAIMER}</p>;
}

export function KnowledgeDetail({ entry, onClose }: { entry: KnowledgeEntry | KnowledgeSummary; onClose: () => void }) {
  const [full, setFull] = useState<KnowledgeEntry | null>('references' in entry ? entry : null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if ('references' in entry) { setFull(entry); return; }
    const controller = new AbortController();
    setFull(null); setError('');
    getKnowledgeEntry(entry.code, controller.signal)
      .then(data => { if (!controller.signal.aborted) setFull(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || '词条加载失败。'); });
    return () => controller.abort();
  }, [entry.code, retry]);
  return <Modal title={entry.name} onClose={onClose}>
    <div className="overflow-y-auto p-5 sm:p-7">
      {error ? <div role="alert" className="p-6 text-center"><p className="text-sm text-slate-500">{error}</p><button onClick={() => setRetry(value => value + 1)} className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-night-royal px-4 py-2 text-sm text-white"><RefreshCw size={16} />重试加载词条</button></div> : full ? <KnowledgeContent entry={full} /> : <div role="status" className="flex items-center justify-center gap-3 p-16 text-sm text-slate-500"><Loader2 className="animate-spin text-night-royal" size={22} />正在加载词条详情…</div>}
    </div>
    <div className="shrink-0 border-t border-purple-100 px-5 py-3"><KnowledgeDisclaimer /></div>
  </Modal>;
}

function KnowledgeContent({ entry }: { entry: KnowledgeEntry }) {
  const styles = categoryStyles[entry.category];
  const isNodule = entry.category === '肺结节亚型';
  const isOntology = entry.kind === 'ontology';
  return <>
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold">
      <span className={cn('rounded-full border px-3 py-1', styles.badge)}>{entry.category}</span>
      <span className="font-mono text-slate-400">{entry.code}</span>
      {entry.respiratory && <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-600">呼吸专题</span>}
    </div>
    <div className="grid items-start gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-4">
        {isOntology ? <div className={cn('rounded-3xl border p-5', styles.badge)}>
          <BookOpen size={36} className="mb-4 opacity-70" />
          <p className="text-xs font-bold">标准医学术语</p>
          <p lang="en" className="mt-3 break-words text-sm font-semibold leading-6">{entry.englishName}</p>
          <p className="mt-4 text-xs leading-6 opacity-75">{entry.sourceInfo?.name}</p>
        </div> : <div className="rounded-3xl border border-white bg-gradient-to-br from-purple-100 to-blue-50 p-4">
          <svg viewBox="0 0 240 210" role="img" aria-label={isNodule ? '结节密度概念示意，非真实 CT' : '双肺解剖定位示意，非病变或真实 CT'} className="w-full">
            <path d="M110 42 C86 28 40 56 28 112 C15 174 52 190 103 165 Z" fill="#bfa4e8" opacity=".7" />
            <path d="M130 42 C154 28 200 56 212 112 C225 174 188 190 137 165 Z" fill="#93b9e6" opacity=".8" />
            <path d="M120 20V90M120 70L82 104M120 70L158 104" stroke="white" strokeWidth="9" fill="none" strokeLinecap="round" />
            {isNodule && <><circle cx="67" cy="132" r="23" fill="white" opacity={entry.code === 'NODULE_SOLID' ? 1 : .45} />{entry.code === 'NODULE_MIX' && <circle cx="72" cy="132" r="10" fill="white" />}<circle cx="67" cy="132" r="31" fill="none" stroke="#6b52b7" strokeWidth="2" strokeDasharray="4 5" /></>}
          </svg>
          <p className="text-center text-[11px] leading-5 text-slate-500">{isNodule ? '结节密度概念示意' : '双肺解剖定位示意'}<br />非真实 CT，不用于识别病变</p>
        </div>}
        {!isOntology && <p className="text-sm leading-7 text-slate-600">{entry.brief}</p>}
        {!!entry.aliases.length && <section className="rounded-2xl border border-purple-100 bg-white p-4"><h3 className="mb-2 text-xs font-bold text-night-deep">同义词 / 别名</h3><ul className="space-y-2 break-words text-xs leading-5 text-slate-500">{entry.aliases.slice(0, 20).map(alias => <li key={alias}>{alias}</li>)}</ul>{entry.aliases.length > 20 && <p className="mt-2 text-[10px] text-slate-400">共 {entry.aliases.length} 个同义词，均可用于检索</p>}</section>}
      </aside>
      <div className="min-w-0 space-y-5">
        {isOntology && <>
          <section><h3 className="mb-2 border-l-4 border-night-lavender pl-3 text-sm font-black text-night-deep">来源定义 · 英文原文</h3><p lang="en" className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{entry.definition}</p></section>
          <div className="rounded-2xl bg-slate-100/80 p-4 text-xs leading-6 text-slate-500">此记录提供术语定义与概念关系，来源未提供独立的 CT 特征、风险分层或随访方案。请勿将术语定义作为诊疗建议。</div>
          {!!entry.parents?.length && <section><h3 className="mb-2 text-sm font-bold text-night-deep">上位概念</h3><ul className="space-y-2">{entry.parents.map(parent => <li key={parent.code} className="rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">{parent.name}<span className="ml-2 font-mono text-slate-400">{parent.code}</span></li>)}</ul></section>}
          {!!entry.xrefs?.length && <section><h3 className="mb-2 text-sm font-bold text-night-deep">外部标准编码</h3><div className="flex flex-wrap gap-2">{entry.xrefs.map(code => <span key={code} className="max-w-full break-all rounded-lg bg-purple-50 px-2 py-1 font-mono text-[11px] text-slate-500">{code}</span>)}</div></section>}
          {entry.definitionSources && <section><h3 className="mb-2 text-sm font-bold text-night-deep">原始定义引用标识</h3><p className="break-all rounded-xl bg-white p-3 text-xs leading-6 text-slate-500">{entry.definitionSources}</p></section>}
        </>}
        {[
          ['CT 影像特征', entry.feature], ['风险提示', entry.risk], ['随访与复核建议', entry.follow], ['鉴别要点', entry.differential],
        ].filter(([, text]) => !!text).map(([title, text]) => <section key={title}>
          <h3 className="mb-2 border-l-4 border-night-lavender pl-3 text-sm font-black text-night-deep">{title}</h3>
          <p className="text-sm leading-7 text-slate-600">{text}</p>
        </section>)}
        <section className="rounded-2xl bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-night-deep"><BookOpen size={16} />参考来源</h3>
          <ul className="space-y-3">{entry.references.map(reference => <li key={reference.url}>
            <a href={reference.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-xs leading-5 text-night-royal underline decoration-purple-200 underline-offset-4">{reference.title}<ExternalLink size={13} className="mt-1 shrink-0" /></a>
          </li>)}</ul>
          {entry.sourceInfo && <p className="mt-4 border-t border-purple-100 pt-3 text-xs leading-6 text-slate-400">数据版本：{entry.sourceInfo.version} · <a href={entry.sourceInfo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{entry.sourceInfo.license}</a></p>}
        </section>
      </div>
    </div>
  </>;
}
