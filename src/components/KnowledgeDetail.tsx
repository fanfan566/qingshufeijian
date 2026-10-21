import React from 'react';
import { BookOpen, ExternalLink, Info } from 'lucide-react';
import { Modal } from './Modal';
import { KNOWLEDGE_DISCLAIMER, type KnowledgeEntry } from '../data/medicalKnowledge';

export function KnowledgeDisclaimer() {
  return <p className="flex items-start gap-2 rounded-2xl border border-purple-100 bg-purple-50/80 p-4 text-xs leading-6 text-slate-500"><Info size={16} className="mt-1 shrink-0 text-night-lavender" />{KNOWLEDGE_DISCLAIMER}</p>;
}

export function KnowledgeDetail({ entry, onClose }: { entry: KnowledgeEntry; onClose: () => void }) {
  const isNodule = entry.category === '肺结节亚型';
  return <Modal title={entry.name} onClose={onClose}>
    <div className="overflow-y-auto p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold text-night-royal">
        <span className="rounded-full bg-purple-100 px-3 py-1">{entry.category}</span>
        <span className="font-mono text-slate-400">{entry.code}</span>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-[220px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-white bg-gradient-to-br from-purple-100 to-blue-50 p-4">
            <svg viewBox="0 0 240 210" role="img" aria-label={isNodule ? '结节密度概念示意，非真实 CT' : '双肺解剖定位示意，非病变或真实 CT'} className="w-full">
              <path d="M110 42 C86 28 40 56 28 112 C15 174 52 190 103 165 Z" fill="#bfa4e8" opacity=".7" />
              <path d="M130 42 C154 28 200 56 212 112 C225 174 188 190 137 165 Z" fill="#93b9e6" opacity=".8" />
              <path d="M120 20V90M120 70L82 104M120 70L158 104" stroke="white" strokeWidth="9" fill="none" strokeLinecap="round" />
              {isNodule && <>
                <circle cx="67" cy="132" r="23" fill="white" opacity={entry.code === 'NODULE_SOLID' ? 1 : .45} />
                {entry.code === 'NODULE_MIX' && <circle cx="72" cy="132" r="10" fill="white" />}
                <circle cx="67" cy="132" r="31" fill="none" stroke="#6b52b7" strokeWidth="2" strokeDasharray="4 5" />
              </>}
            </svg>
            <p className="text-center text-[11px] leading-5 text-slate-500">{isNodule ? '结节密度概念示意' : '双肺解剖定位示意'}<br />非真实 CT，不用于识别病变</p>
          </div>
          <p className="text-sm leading-7 text-slate-600">{entry.brief}</p>
        </aside>
        <div className="space-y-5">
          {[
            ['CT 影像特征', entry.feature], ['风险提示', entry.risk], ['随访与复核建议', entry.follow], ['鉴别要点', entry.differential],
          ].map(([title, text]) => <section key={title}>
            <h3 className="mb-2 border-l-4 border-night-lavender pl-3 text-sm font-black text-night-deep">{title}</h3>
            <p className="text-sm leading-7 text-slate-600">{text}</p>
          </section>)}
          <section className="rounded-2xl bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-night-deep"><BookOpen size={16} />参考来源</h3>
            <ul className="space-y-3">{entry.references.map(reference => <li key={reference.url}>
              <a href={reference.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-xs leading-5 text-night-royal underline decoration-purple-200 underline-offset-4">{reference.title}<ExternalLink size={13} className="mt-1 shrink-0" /></a>
            </li>)}</ul>
          </section>
        </div>
      </div>
    </div>
    <div className="shrink-0 border-t border-purple-100 px-5 py-3"><KnowledgeDisclaimer /></div>
  </Modal>;
}
