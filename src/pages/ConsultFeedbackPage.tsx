import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock3,
  HeartPulse,
  MessageCircleMore,
  Search,
  Send,
  Sparkles,
  Stethoscope,
  User,
  UserRound,
  Wand2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { userService } from '../services/userService';
import { patientService } from '../services/patientService';
import { consultService, ConsultThread, ConsultMessage } from '../services/consultService';

interface ThreadSummaryLike {
  patientId: string;
  unreadCount?: number;
  updatedAt?: string | Date;
  lastMessage?: {
    content?: string;
    type?: string;
    createdAt?: string | Date;
  };
  participant?: {
    id?: string;
    name?: string;
    avatar?: string;
    role?: string;
  };
  doctor?: {
    id?: string;
    name?: string;
    avatar?: string;
  };
}

const QUICK_DOCTOR_ACTIONS = [
  '根据最新肺功能数据，建议继续规律吸入治疗并保持每周复查记录。',
  '近期指标有波动，请减少剧烈运动，注意呼吸频率，必要时尽快复诊。',
  '请继续监测晨起咳嗽与夜间气促情况，连续三天异常请及时联系我。'
];

const QUICK_PATIENT_ACTIONS = [
  '医生您好，我已按时用药，今天整体状态稳定。',
  '我昨晚有些咳嗽加重，想咨询是否需要调整护理方案。',
  '我已经看过建议内容了，会继续记录指标变化。'
];

const formatTime = (value?: string | Date) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';

  const now = new Date();
  const isToday = now.toDateString() === date.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

const getMessagePreview = (summary: ThreadSummaryLike) => {
  const content = summary.lastMessage?.content?.trim();
  if (!content) return '暂无沟通记录';
  if (summary.lastMessage?.type === 'recommendation') {
    return `建议：${content}`;
  }
  return content;
};

const getStatusMeta = (status?: string) => {
  switch (status) {
    case 'stable':
      return {
        text: '状态稳定',
        className: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
      };
    case 'attention':
      return {
        text: '需重点关注',
        className: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
      };
    case 'critical':
      return {
        text: '建议尽快干预',
        className: 'text-rose-500 bg-rose-500/10 border-rose-500/20'
      };
    default:
      return {
        text: '待评估',
        className: 'text-slate-500 bg-slate-500/10 border-slate-500/20'
      };
  }
};

const ConsultFeedbackPage: React.FC = () => {
  const currentUser = userService.getCurrentUser();
  const isDoctor = currentUser?.role === 'doctor';

  const [threadSummaries, setThreadSummaries] = useState<ThreadSummaryLike[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedThread, setSelectedThread] = useState<ConsultThread | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [recommendationInput, setRecommendationInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSummaries = () => {
    const summaries = (consultService.getThreadSummaries() || []) as ThreadSummaryLike[];
    setThreadSummaries(summaries);

    if (!selectedPatientId && summaries.length > 0) {
      setSelectedPatientId(summaries[0].patientId);
    }

    if (selectedPatientId && !summaries.some((item) => item.patientId === selectedPatientId) && summaries.length > 0) {
      setSelectedPatientId(summaries[0].patientId);
    }
  };

  const loadThread = (patientId: string) => {
    const thread = consultService.getThreadByPatientId(patientId) as ConsultThread | null;
    setSelectedThread(thread);
    consultService.markThreadAsRead(patientId);
    const refreshed = (consultService.getThreadSummaries() || []) as ThreadSummaryLike[];
    setThreadSummaries(refreshed);
  };

  useEffect(() => {
    loadSummaries();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      loadThread(selectedPatientId);
    } else {
      setSelectedThread(null);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThread]);

  const filteredSummaries = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return threadSummaries;

    return threadSummaries.filter((item) => {
      const patient = patientService.getPatientById(item.patientId);
      const name = item.participant?.name || patient?.name || '';
      const id = item.patientId || '';
      return name.toLowerCase().includes(keyword) || id.toLowerCase().includes(keyword);
    });
  }, [searchKeyword, threadSummaries]);

  const currentPatient = useMemo(() => {
    if (!selectedPatientId) return undefined;
    return patientService.getPatientById(selectedPatientId);
  }, [selectedPatientId, selectedThread]);

  const recommendationMessages = useMemo(() => {
    return (selectedThread?.messages || []).filter((message: ConsultMessage) => message.type === 'recommendation');
  }, [selectedThread]);

  const latestRecommendation = recommendationMessages[recommendationMessages.length - 1];

  const titleDescription = isDoctor
    ? '医生可与患者进行一对一咨询沟通，建议将自动沉淀在私聊记录中。'
    : '查看医生建议、回复咨询问题，并持续跟进您的康复情况。';

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedPatientId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (isDoctor) {
        consultService.sendDoctorMessage(selectedPatientId, content);
      } else {
        consultService.sendPatientMessage(selectedPatientId, content);
      }
      setMessageInput('');
      loadSummaries();
      loadThread(selectedPatientId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeedRecommendation = (content?: string) => {
    const finalContent = (content || recommendationInput).trim();
    if (!finalContent || !selectedPatientId) return;

    consultService.seedRecommendationToThread(selectedPatientId, finalContent);
    setRecommendationInput('');
    loadSummaries();
    loadThread(selectedPatientId);
  };

  const renderMessageBubble = (message: ConsultMessage, index: number) => {
    const isRecommendation = message.type === 'recommendation';
    const isSystem = message.type === 'system' || message.source === 'system' || message.role === 'system';
    const ownMessage = isDoctor ? message.role === 'doctor' : message.role === 'patient';

    if (isRecommendation) {
      return (
        <motion.div
          key={message.id || `${index}-${message.createdAt}`}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mx-auto max-w-2xl"
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-night-pink/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,255,255,0.72))] p-5 shadow-[0_18px_45px_rgba(191,140,225,0.18)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,147,197,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(55,133,216,0.12),transparent_28%)]" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-night-pink via-night-lavender to-night-sky text-white shadow-[0_12px_28px_rgba(191,140,225,0.28)]">
                <Wand2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-night-pink/20 bg-night-pink/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-night-pink">
                    <Sparkles size={12} />
                    医生建议
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">{formatTime(message.createdAt)}</span>
                </div>
                <p className="text-sm leading-7 text-slate-600">{message.content}</p>
              </div>
            </div>
          </div>
        </motion.div>
      );
    }

    if (isSystem) {
      return (
        <motion.div
          key={message.id || `${index}-${message.createdAt}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <div className="rounded-full border border-white/30 bg-white/55 px-4 py-2 text-xs font-bold text-slate-500 shadow-sm backdrop-blur-md">
            {message.content}
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={message.id || `${index}-${message.createdAt}`}
        initial={{ opacity: 0, y: 18, x: ownMessage ? 12 : -12 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        className={cn('flex items-end gap-3', ownMessage ? 'justify-end' : 'justify-start')}
      >
        {!ownMessage && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 text-night-royal shadow-[0_10px_24px_rgba(49,70,184,0.12)] backdrop-blur-md">
            {message.role === 'doctor' ? <Stethoscope size={18} /> : <UserRound size={18} />}
          </div>
        )}

        <div
          className={cn(
            'max-w-[72%] rounded-[1.9rem] px-5 py-4 shadow-[0_12px_35px_rgba(15,23,42,0.08)]',
            ownMessage
              ? 'rounded-br-md bg-[linear-gradient(135deg,rgba(28,29,171,0.95),rgba(55,133,216,0.86),rgba(191,140,225,0.78))] text-white'
              : 'rounded-bl-md border border-white/40 bg-white/78 text-slate-600 backdrop-blur-xl'
          )}
        >
          <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
          <div className={cn('mt-3 text-[10px] font-black uppercase tracking-[0.24em]', ownMessage ? 'text-white/70' : 'text-slate-400')}>
            {formatTime(message.createdAt)}
          </div>
        </div>

        {ownMessage && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-night-royal to-night-sky text-white shadow-[0_12px_28px_rgba(55,133,216,0.28)]">
            {isDoctor ? <Stethoscope size={18} /> : <User size={18} />}
          </div>
        )}
      </motion.div>
    );
  };

  const doctorName = (selectedThread as any)?.doctor?.name || '负责医生';
  const patientName = currentPatient?.name || (selectedThread as any)?.participant?.name || '当前咨询对象';
  const statusMeta = getStatusMeta(currentPatient?.status);

  return (
    <div className="relative h-screen overflow-hidden bg-brand-bg p-8">
      <div className="pointer-events-none absolute left-24 top-10 h-64 w-64 rounded-full bg-night-pink/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 right-24 h-72 w-72 rounded-full bg-night-sky/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(191,140,225,0.12),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(55,133,216,0.1),transparent_24%)]" />

      <div className="relative flex h-full gap-6">
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex w-[340px] flex-col overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.12)_100%)] p-5 shadow-[0_24px_80px_rgba(31,38,135,0.14)] backdrop-blur-2xl"
        >
          <div className="mb-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-night-sky/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-night-sky">
              <Activity size={14} />
              沟通面板
            </div>
            <h2 className="text-3xl font-black tracking-tight text-night-deep">咨询反馈</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{titleDescription}</p>
          </div>

          <div className="relative mb-5">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder={isDoctor ? '搜索患者姓名 / UID' : '搜索会话'}
              className="h-12 w-full rounded-2xl border border-white/30 bg-white/55 pl-11 pr-4 text-sm font-semibold text-night-deep outline-none placeholder:text-slate-400 backdrop-blur-md transition-all focus:border-night-royal/30 focus:bg-white/80"
            />
          </div>

          <div className="mb-4 flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-400">
              {isDoctor ? '患者列表' : '我的咨询'}
            </span>
            <span className="rounded-full bg-white/60 px-3 py-1 text-[10px] font-black text-night-royal">
              {filteredSummaries.length} 条
            </span>
          </div>

          <div className="scrollbar-hide flex-1 space-y-3 overflow-y-auto pr-1">
            {filteredSummaries.map((summary, index) => {
              const patient = patientService.getPatientById(summary.patientId);
              const active = summary.patientId === selectedPatientId;
              const patientStatus = getStatusMeta(patient?.status);
              const contactName = summary.participant?.name || patient?.name || summary.patientId;

              return (
                <motion.button
                  key={summary.patientId}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  onClick={() => setSelectedPatientId(summary.patientId)}
                  className={cn(
                    'group relative w-full overflow-hidden rounded-[1.6rem] border p-4 text-left transition-all duration-300',
                    active
                      ? 'border-white/35 bg-[linear-gradient(135deg,rgba(28,29,171,0.86),rgba(55,133,216,0.72),rgba(191,140,225,0.58))] text-white shadow-[0_18px_38px_rgba(46,64,184,0.26)]'
                      : 'border-white/20 bg-white/32 text-slate-600 hover:bg-white/48'
                  )}
                >
                  <span className={cn('absolute inset-0 transition-opacity', active ? 'opacity-100 bg-[linear-gradient(90deg,rgba(255,255,255,0.16),transparent_46%)]' : 'opacity-0 group-hover:opacity-100 bg-[linear-gradient(90deg,rgba(255,255,255,0.14),transparent_46%)]')} />
                  <div className="relative flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-black shadow-sm',
                        active
                          ? 'border-white/20 bg-white/15 text-white'
                          : 'border-white/30 bg-white/70 text-night-royal'
                      )}
                    >
                      {contactName.slice(0, 1)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black">{contactName}</div>
                          <div className={cn('mt-1 text-[11px] font-bold', active ? 'text-white/70' : 'text-slate-400')}>
                            {summary.patientId}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={cn('text-[10px] font-black', active ? 'text-white/75' : 'text-slate-400')}>
                            {formatTime(summary.updatedAt || summary.lastMessage?.createdAt)}
                          </span>
                          {!!summary.unreadCount && (
                            <span
                              className={cn(
                                'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black',
                                active ? 'bg-white text-night-royal' : 'bg-night-royal text-white'
                              )}
                            >
                              {summary.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className={cn('mt-3 line-clamp-2 text-xs leading-5', active ? 'text-white/85' : 'text-slate-500')}>
                        {getMessagePreview(summary)}
                      </p>

                      <div className="mt-3 flex items-center gap-2">
                        <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-black', active ? 'border-white/20 bg-white/12 text-white' : patientStatus.className)}>
                          {patientStatus.text}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}

            {filteredSummaries.length === 0 && (
              <div className="rounded-[1.6rem] border border-white/20 bg-white/30 px-5 py-12 text-center text-sm font-semibold text-slate-400">
                暂无匹配的咨询会话
              </div>
            )}
          </div>
        </motion.aside>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.32)_0%,rgba(255,255,255,0.14)_100%)] shadow-[0_24px_80px_rgba(31,38,135,0.12)] backdrop-blur-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/20 px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-night-royal via-night-sky to-night-pink text-white shadow-[0_14px_32px_rgba(67,72,196,0.32)]">
                {isDoctor ? <UserRound size={24} /> : <Bot size={24} />}
              </div>
              <div>
                <div className="text-lg font-black text-night-deep">
                  {isDoctor ? patientName : doctorName}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  {isDoctor ? '患者会话已连接' : '医生建议同步中'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-2xl border border-white/25 bg-white/45 px-4 py-3 text-right backdrop-blur-md md:block">
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">未读消息</div>
                <div className="mt-1 text-base font-black text-night-deep">{selectedThread?.unreadCount || 0}</div>
              </div>
              <div className="rounded-2xl border border-white/25 bg-white/45 px-4 py-3 backdrop-blur-md">
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">最近更新</div>
                <div className="mt-1 text-sm font-black text-night-deep">
                  {formatTime((selectedThread as any)?.updatedAt)}
                </div>
              </div>
            </div>
          </div>

          <div className="scrollbar-hide flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <AnimatePresence initial={false}>
              {(selectedThread?.messages || []).map((message, index) => renderMessageBubble(message, index))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/20 bg-white/18 px-6 py-5">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {(isDoctor ? QUICK_DOCTOR_ACTIONS : QUICK_PATIENT_ACTIONS).map((item) => (
                <button
                  key={item}
                  onClick={() => setMessageInput(item)}
                  className="rounded-2xl border border-white/25 bg-white/55 px-4 py-3 text-left text-xs font-bold leading-5 text-slate-500 transition-all hover:-translate-y-0.5 hover:border-night-royal/25 hover:text-night-royal"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="relative rounded-[2rem] border border-white/25 bg-white/70 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[linear-gradient(135deg,rgba(191,140,225,0.06),rgba(55,133,216,0.04))]" />
              <div className="relative flex items-end gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-night-pink/10 text-night-pink">
                  <MessageCircleMore size={20} />
                </div>
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={isDoctor ? '向患者发送随访反馈、护理建议或复诊提醒…' : '回复医生、反馈症状变化或询问康复建议…'}
                  className="max-h-36 min-h-[52px] flex-1 resize-none bg-transparent pt-3 text-sm font-semibold leading-6 text-night-deep outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || isSubmitting || !selectedPatientId}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl transition-all',
                    !messageInput.trim() || isSubmitting || !selectedPatientId
                      ? 'bg-slate-100 text-slate-300'
                      : 'bg-gradient-to-br from-night-royal to-night-sky text-white shadow-[0_14px_30px_rgba(46,64,184,0.28)] hover:scale-105'
                  )}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden w-[340px] flex-col gap-5 xl:flex"
        >
          <div className="overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.12)_100%)] p-5 shadow-[0_24px_80px_rgba(31,38,135,0.12)] backdrop-blur-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-night-royal to-night-sky text-white">
                <HeartPulse size={22} />
              </div>
              <div>
                <div className="text-lg font-black text-night-deep">当前资料</div>
                <div className="text-xs font-bold text-slate-400">实时查看本次咨询对象信息</div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-white/25 bg-white/50 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-black text-night-deep">{patientName}</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{selectedPatientId || '未选择会话'}</div>
                </div>
                <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black', statusMeta.className)}>
                  {statusMeta.text}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/70 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">FEV1</div>
                  <div className="mt-2 text-lg font-black text-night-deep">{currentPatient?.fev1 ?? '--'}</div>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">FVC</div>
                  <div className="mt-2 text-lg font-black text-night-deep">{currentPatient?.fvc ?? '--'}</div>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">FEV1/FVC</div>
                  <div className="mt-2 text-lg font-black text-night-deep">{currentPatient?.fev1Fvc ?? '--'}</div>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">PEF</div>
                  <div className="mt-2 text-lg font-black text-night-deep">{currentPatient?.pef ?? '--'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.12)_100%)] p-5 shadow-[0_24px_80px_rgba(31,38,135,0.12)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-night-pink/15 text-night-pink">
                <ClipboardList size={20} />
              </div>
              <div>
                <div className="text-lg font-black text-night-deep">建议摘要</div>
                <div className="text-xs font-bold text-slate-400">最新 recommendation 内容</div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-night-pink/15 bg-white/55 p-4 backdrop-blur-md">
              {latestRecommendation ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full bg-night-pink/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-night-pink">
                      <CheckCircle2 size={12} />
                      已同步
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">{formatTime(latestRecommendation.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{latestRecommendation.content}</p>
                </>
              ) : (
                <div className="text-sm font-semibold leading-7 text-slate-400">
                  暂无医生建议。发送 recommendation 后会自动在此处高亮展示。
                </div>
              )}
            </div>

            {isDoctor && (
              <div className="mt-4 space-y-3">
                <textarea
                  value={recommendationInput}
                  onChange={(e) => setRecommendationInput(e.target.value)}
                  placeholder="录入新的医生建议，并自动同步到私聊窗口…"
                  className="min-h-[110px] w-full resize-none rounded-[1.6rem] border border-white/30 bg-white/55 p-4 text-sm font-semibold leading-6 text-night-deep outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={() => handleSeedRecommendation()}
                  disabled={!recommendationInput.trim() || !selectedPatientId}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black transition-all',
                    !recommendationInput.trim() || !selectedPatientId
                      ? 'bg-slate-100 text-slate-300'
                      : 'bg-[linear-gradient(135deg,rgba(232,147,197,0.95),rgba(191,140,225,0.92),rgba(55,133,216,0.86))] text-white shadow-[0_16px_36px_rgba(191,140,225,0.24)] hover:scale-[1.02]'
                  )}
                >
                  <Sparkles size={16} />
                  发送为医生建议
                </button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.12)_100%)] p-5 shadow-[0_24px_80px_rgba(31,38,135,0.12)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-night-sky/15 text-night-sky">
                <Clock3 size={20} />
              </div>
              <div>
                <div className="text-lg font-black text-night-deep">快捷操作</div>
                <div className="text-xs font-bold text-slate-400">常用随访与咨询动作</div>
              </div>
            </div>

            <div className="space-y-3">
              {(isDoctor
                ? ['提醒患者按时复查', '发送呼吸训练建议', '同步阶段性诊疗重点']
                : ['告诉医生今日状态', '确认已阅读建议', '反馈近期不适症状']).map((item, index) => (
                <button
                  key={item}
                  onClick={() => {
                    if (isDoctor) {
                      handleSeedRecommendation(`${item}：请结合最近三日记录继续观察，如有异常及时联系。`);
                    } else {
                      setMessageInput(`${item}，我会持续记录并配合后续随访。`);
                    }
                  }}
                  className="group flex w-full items-center justify-between rounded-[1.4rem] border border-white/25 bg-white/50 px-4 py-3 text-left transition-all hover:border-night-royal/20 hover:bg-white/70"
                >
                  <div>
                    <div className="text-sm font-black text-night-deep">{item}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-400">
                      {index === 0 ? '一键快速插入' : index === 1 ? '适合高频沟通' : '沉淀到会话记录'}
                    </div>
                  </div>
                  <ArrowUpRight size={16} className="text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-night-royal" />
                </button>
              ))}
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
};

export default ConsultFeedbackPage;