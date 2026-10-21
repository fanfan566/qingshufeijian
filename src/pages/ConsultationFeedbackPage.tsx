import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  HeartHandshake,
  LoaderCircle,
  MessageCircleMore,
  Search,
  SendHorizonal,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  Activity,
  AlertTriangle,
  CircleDot,
  Clock3,
  Inbox,
  CheckCheck,
  ClipboardList,
  Layers3,
  Radar,
  Reply,
  Wand2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { userService, type User } from '../services/userService';
import { consultationService } from '../services/consultationService';

type UserRole = 'doctor' | 'patient' | 'student';
type ConversationStatus = 'stable' | 'attention' | 'critical';
type MessageType = 'doctor_advice' | 'doctor_message' | 'patient_message';

interface CurrentUserLike {
  id: string;
  username: string;
  role?: UserRole;
  nickname?: string;
}

interface ConversationSummaryLike {
  conversationId: string;
  patientId: string;
  doctorId: string;
  title: string;
  subtitle?: string;
  status: ConversationStatus;
  lastMessage?: string;
  lastTimestamp?: string;
  unreadCount?: number;
  hasUnread?: boolean;
  advicePreview?: string;
}

interface ConversationMessageLike {
  id: string;
  type: MessageType;
  content: string;
  senderId: string;
  timestamp: string;
}

interface ConversationDetailLike extends ConversationSummaryLike {
  messages?: ConversationMessageLike[];
}

const FILTER_TABS: Array<{ key: 'all' | ConversationStatus; label: string }> = [
  { key: 'all', label: '全部会话' },
  { key: 'stable', label: '稳定' },
  { key: 'attention', label: '需关注' },
  { key: 'critical', label: '重点跟进' }
];

const statusConfig: Record<
  ConversationStatus,
  {
    label: string;
    badge: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    panel: string;
    glow: string;
  }
> = {
  stable: {
    label: '状态稳定',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: ShieldCheck,
    panel: 'from-emerald-500/12 via-teal-500/10 to-cyan-500/12',
    glow: 'bg-emerald-400/20'
  },
  attention: {
    label: '需要关注',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Activity,
    panel: 'from-amber-500/12 via-orange-500/10 to-yellow-500/12',
    glow: 'bg-amber-400/20'
  },
  critical: {
    label: '重点跟进',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    icon: AlertTriangle,
    panel: 'from-rose-500/12 via-pink-500/10 to-fuchsia-500/12',
    glow: 'bg-rose-400/20'
  }
};

const doctorQuickReplies = [
  '我已查看你的最新情况，我们一起稳步调整。',
  '今天先按当前计划执行，如有不适请及时告诉我。',
  '建议保持规律监测，晚些我再帮你复盘一次。',
  '别紧张，你反馈得很及时，这对判断很有帮助。'
];

const patientQuickReplies = [
  '我今天整体感觉比昨天轻松一些。',
  '已经按建议完成训练了。',
  '谢谢医生，我会继续观察并记录。',
  '这两天夜间有点不舒服，想再请您看看。'
];

const getDisplayName = (user: CurrentUserLike | null) => {
  if (!user) return '用户';
  return user.nickname || user.username || '用户';
};

const getMessageTheme = (message: ConversationMessageLike, isMine: boolean) => {
  const isAdvice = message.type === 'doctor_advice';

  if (isMine) {
    return {
      container: cn(
        'max-w-[82%] rounded-[26px] border text-white shadow-[0_18px_40px_rgba(79,70,229,0.24)]',
        isAdvice
          ? 'border-fuchsia-300/30 bg-[linear-gradient(135deg,rgba(217,70,239,0.92),rgba(168,85,247,0.9),rgba(99,102,241,0.86))]'
          : 'border-indigo-300/30 bg-[linear-gradient(135deg,rgba(79,70,229,0.92),rgba(99,102,241,0.88),rgba(168,85,247,0.82))]'
      ),
      inner: 'px-5 py-4',
      icon: isAdvice ? Wand2 : CheckCheck,
      align: 'justify-end',
      rail: 'items-end',
      metaTone: isAdvice ? 'text-white/80' : 'text-white/70',
      chip: isAdvice ? 'bg-white/18 text-white' : 'bg-white/16 text-white/90',
      content: 'text-white'
    };
  }

  return {
    container: cn(
      'max-w-[82%] rounded-[26px] border shadow-[0_18px_40px_rgba(148,163,184,0.16)] backdrop-blur-xl',
      isAdvice
        ? 'border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.96),rgba(255,237,213,0.94),rgba(254,240,138,0.34))] text-slate-700'
        : 'border-white/50 bg-white/75 text-slate-700'
    ),
    inner: 'px-5 py-4',
    icon: isAdvice ? Sparkles : MessageCircleMore,
    align: 'justify-start',
    rail: 'items-start',
    metaTone: isAdvice ? 'text-amber-700/80' : 'text-slate-400',
    chip: isAdvice ? 'bg-white/70 text-amber-700' : 'bg-slate-100 text-slate-500',
    content: 'text-slate-700'
  };
};

export const ConsultationFeedbackPage: React.FC = () => {
  const [boardMode, setBoardMode] = useState<'overview' | 'timeline' | 'actions'>('overview');
  const [currentUser, setCurrentUser] = useState<CurrentUserLike | null>(null);
  const [summaries, setSummaries] = useState<ConversationSummaryLike[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | ConversationStatus>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<Omit<User, 'password'>[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const user = userService.getCurrentUser() as CurrentUserLike | null;
    setCurrentUser(user);
  }, []);

  const loadConversations = () => {
    const current = userService.getCurrentUser() as CurrentUserLike | null;
    setCurrentUser(current);

    const list = (consultationService.getConversationSummaries() || []) as ConversationSummaryLike[];
    setSummaries(list);

    if (current?.role === 'patient') {
      const ownConversation = consultationService.getCurrentConversationForUser() as ConversationSummaryLike | null;
      if (ownConversation?.conversationId) {
        setSelectedConversationId((prev) => prev || ownConversation.conversationId);
      } else if (list[0]?.conversationId) {
        setSelectedConversationId((prev) => prev || list[0].conversationId);
      } else {
        setSelectedConversationId('');
      }
    } else if (list.length > 0) {
      setSelectedConversationId((prev) => {
        const exists = list.some((item) => item.conversationId === prev);
        return exists ? prev : list[0].conversationId;
      });
    } else {
      setSelectedConversationId('');
    }

    setIsBootstrapping(false);
  };

  useEffect(() => {
    loadConversations();
  }, [refreshTick]);

  const filteredSummaries = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return summaries.filter((item) => {
      const matchKeyword =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        item.subtitle?.toLowerCase().includes(keyword) ||
        item.lastMessage?.toLowerCase().includes(keyword) ||
        item.patientId.toLowerCase().includes(keyword) ||
        item.doctorId.toLowerCase().includes(keyword);

      const matchFilter = activeFilter === 'all' || item.status === activeFilter;
      return matchKeyword && matchFilter;
    });
  }, [summaries, searchKeyword, activeFilter]);

  useEffect(() => {
    if (!filteredSummaries.length) return;
    if (!selectedConversationId) {
      setSelectedConversationId(filteredSummaries[0].conversationId);
      return;
    }

    const exists = filteredSummaries.some((item) => item.conversationId === selectedConversationId);
    if (!exists) {
      setSelectedConversationId(filteredSummaries[0].conversationId);
    }
  }, [filteredSummaries, selectedConversationId]);

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return (consultationService.getConversationById(selectedConversationId) || null) as ConversationDetailLike | null;
  }, [selectedConversationId, refreshTick]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedConversation?.messages?.length, selectedConversationId]);

  const currentRole = currentUser?.role || 'patient';
  const isDoctor = currentRole === 'doctor';
  const quickReplies = isDoctor ? doctorQuickReplies : patientQuickReplies;

  const selectedSummary = selectedConversation
    ? summaries.find((item) => item.conversationId === selectedConversation.conversationId) || selectedConversation
    : null;

  const selectedMessages = selectedConversation?.messages || [];
  const adviceMessages = selectedMessages.filter((message) => message.type === 'doctor_advice');
  const lastConversationMessage = selectedMessages[selectedMessages.length - 1];
  const recentAdviceText = selectedSummary?.advicePreview?.trim() || '暂无最新建议，建议通过下方输入区开始本次沟通。';
  const headerStatus = selectedSummary ? statusConfig[selectedSummary.status] : statusConfig.stable;
  const counterpartName = selectedConversation?.title || (isDoctor ? '患者' : '医生');
  const selectedUnreadCount = selectedSummary?.unreadCount || 0;
  const lastActiveText = selectedSummary?.lastTimestamp
    ? consultationService.formatRelativeTime(selectedSummary.lastTimestamp)
    : '刚刚建立';
  const todayMessageCount = selectedMessages.length;
  const insightItems = [
    {
      label: '建议同步',
      value: `${adviceMessages.length} 条`,
      accent: 'from-amber-400 to-orange-500',
      note: adviceMessages.length > 0 ? '已自动沉淀到私聊' : '等待医生建议'
    },
    {
      label: '最近互动',
      value: lastActiveText,
      accent: 'from-cyan-400 to-sky-500',
      note: lastConversationMessage?.content ? '沟通链路保持活跃' : '尚未发送消息'
    },
    {
      label: '会话热度',
      value: `${todayMessageCount} 条`,
      accent: 'from-violet-500 to-fuchsia-500',
      note: isDoctor ? '便于连续随访' : '反馈越充分越精准'
    }
  ];

  const latestAdviceMessage = [...selectedMessages].reverse().find((message) => message.type === 'doctor_advice');
  const timelineMoments = [
    latestAdviceMessage
      ? {
          key: 'advice',
          title: '最新建议已沉淀',
          description: latestAdviceMessage.content,
          time: consultationService.formatRelativeTime(latestAdviceMessage.timestamp),
          accent: 'from-amber-400 to-orange-500'
        }
      : null,
    lastConversationMessage
      ? {
          key: 'last-message',
          title: '最近一条对话',
          description: lastConversationMessage.content,
          time: consultationService.formatRelativeTime(lastConversationMessage.timestamp),
          accent: 'from-cyan-400 to-sky-500'
        }
      : null,
    {
      key: 'status',
      title: '当前跟进状态',
      description: selectedSummary ? headerStatus.label : '尚未建立状态标记',
      time: '实时更新',
      accent: 'from-violet-500 to-fuchsia-500'
    }
  ].filter(Boolean) as Array<{ key: string; title: string; description: string; time: string; accent: string }>;

  const actionItems = [
    {
      key: 'reply-advice',
      title: isDoctor ? '补充一条可执行建议' : '快速回复医生建议',
      description: isDoctor ? '让建议与聊天主线同步沉淀。' : '把执行感受直接反馈给医生。',
      icon: Reply,
      action: () =>
        setMessageInput(
          isDoctor ? '补充建议：今天请继续记录症状变化，晚间复测后我再帮你判断。' : '我已收到建议，今晚会按要求记录并反馈。'
        )
    },
    {
      key: 'follow-up',
      title: isDoctor ? '生成随访话术' : '生成反馈模板',
      description: isDoctor ? '快速形成温和、连续的随访消息。' : '一键带出更完整的症状反馈表达。',
      icon: Wand2,
      action: () =>
        setMessageInput(
          isDoctor
            ? '今天的核心目标是观察变化，不需要太紧张。如果有新的不适，第一时间告诉我。'
            : '今天整体情况：症状较昨日有变化，已按建议执行训练，想补充夜间不适与体感。'
        )
    },
    {
      key: 'sync-advice',
      title: '查看建议同步效果',
      description: '图2卡片现在用于展示建议沉淀、时间线与可执行动作。',
      icon: Layers3,
      action: () => setBoardMode('timeline')
    }
  ];

  const handleSelectQuickReply = (content: string) => {
    setMessageInput(content);
  };

  const handleSendMessage = () => {
    if (!selectedConversationId || !messageInput.trim() || isSending) return;

    setIsSending(true);
    try {
      consultationService.sendMessage(selectedConversationId, messageInput.trim());
      setMessageInput('');
      setRefreshTick((prev) => prev + 1);
    } finally {
      setIsSending(false);
    }
  };

  const handleSearchUsers = async (query: string) => {
    if (!query.trim()) {
      setUserSearchResults([]);
      return;
    }

    setIsSearchingUsers(true);
    try {
      const results = await userService.searchUsers(query.trim(), currentUser?.role === 'doctor' ? 'patient' : 'doctor');
      // 过滤掉当前用户和不合适的角色组合
      const filteredResults = results.filter(user => {
        if (user.id === currentUser?.id) return false;
        if (currentUser?.role === 'doctor' && user.role !== 'patient') return false;
        if (currentUser?.role === 'patient' && user.role !== 'doctor') return false;
        return true;
      });
      setUserSearchResults(filteredResults);
    } catch (error) {
      console.error('搜索用户失败:', error);
      setUserSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleStartConversation = (targetUserId: string) => {
    const conversation = consultationService.createConversationWithUser(targetUserId);
    if (conversation) {
      setSelectedConversationId(conversation.conversationId);
      setUserSearchQuery('');
      setUserSearchResults([]);
      setRefreshTick((prev) => prev + 1);
    }
  };

  const emptyTitle = isDoctor ? '还没有可跟进的咨询会话' : '你的咨询窗口正在准备中';
  const emptyDescription = isDoctor
    ? '当患者产生健康档案、医生建议或发起私聊后，这里会自动沉淀为可持续跟进的会话。'
    : '医生建议同步后会出现在这里。你也可以稍后刷新页面查看最新沟通记录。';

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-12 h-72 w-72 rounded-full bg-night-sky/15 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-night-pink/15 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl" />
        <motion.div
          animate={{ y: [0, -12, 0], x: [0, 10, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute right-20 top-32 h-24 w-24 rounded-full bg-white/20 blur-2xl"
        />
        <motion.div
          animate={{ y: [0, 16, 0], x: [0, -8, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-24 bottom-24 h-28 w-28 rounded-full bg-violet-300/10 blur-2xl"
        />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.72)_0%,rgba(245,247,255,0.5)_48%,rgba(255,255,255,0.56)_100%)] p-6 shadow-[0_30px_80px_rgba(56,28,140,0.16)] backdrop-blur-2xl sm:p-8"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(191,140,225,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(55,133,216,0.14),transparent_30%)]" />
          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/45 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-night-sky shadow-[0_12px_30px_rgba(55,133,216,0.12)] backdrop-blur-md">
                <HeartHandshake size={14} />
                咨询反馈中心
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">咨询反馈</h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-500 sm:text-base">
                在医生与患者之间建立更自然的持续沟通。建议、反馈、情绪变化与关键提醒都会在这里被温柔地记录下来。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-[26px] border border-white/40 bg-white/55 px-5 py-4 shadow-[0_16px_40px_rgba(148,163,184,0.12)] backdrop-blur-xl">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">当前身份</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-black text-slate-700">
                  {isDoctor ? <Stethoscope size={16} className="text-emerald-500" /> : <UserRound size={16} className="text-indigo-500" />}
                  {isDoctor ? '医生沟通台' : '患者咨询窗'}
                </div>
              </div>
              <div className="rounded-[26px] border border-white/40 bg-white/55 px-5 py-4 shadow-[0_16px_40px_rgba(148,163,184,0.12)] backdrop-blur-xl">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">活跃会话</div>
                <div className="mt-2 text-2xl font-black text-slate-800">{summaries.length}</div>
              </div>
              <div className="rounded-[26px] border border-white/40 bg-white/55 px-5 py-4 shadow-[0_16px_40px_rgba(148,163,184,0.12)] backdrop-blur-xl">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">当前用户</div>
                <div className="mt-2 truncate text-sm font-black text-slate-700">{getDisplayName(currentUser)}</div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)_290px]">
          <motion.aside
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative overflow-hidden rounded-[34px] border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(245,247,255,0.55))] p-5 shadow-[0_24px_70px_rgba(99,102,241,0.14)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_28%)]" />
            <div className="relative z-10">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">咨询反馈</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {isDoctor ? '查看患者会话并持续跟进恢复情况' : '与医生保持一条安心、连续的沟通链路'}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(79,70,229,0.9),rgba(168,85,247,0.82))] text-white shadow-[0_16px_36px_rgba(99,102,241,0.26)]">
                  <MessageCircleMore size={22} />
                </div>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={isDoctor ? '搜索患者姓名、UID 或消息...' : '搜索建议、关键字...'}
                  className="w-full rounded-2xl border border-white/50 bg-white/70 py-3 pl-12 pr-4 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] outline-none transition-all placeholder:text-slate-400 focus:border-indigo-200 focus:ring-4 focus:ring-indigo-100/70"
                />
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-xs font-black transition-all',
                      activeFilter === tab.key
                        ? 'border-transparent bg-[linear-gradient(135deg,rgba(79,70,229,0.95),rgba(168,85,247,0.85))] text-white shadow-[0_12px_30px_rgba(99,102,241,0.24)]'
                        : 'border-white/50 bg-white/60 text-slate-500 hover:border-indigo-100 hover:text-slate-700'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                  {isDoctor ? '患者列表' : '我的咨询'}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
                  {filteredSummaries.length} 条
                </span>
              </div>

              {/* 用户搜索区域 */}
              <div className="mb-4">
                <div className="relative mb-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={userSearchQuery}
                    onChange={(e) => {
                      setUserSearchQuery(e.target.value);
                      handleSearchUsers(e.target.value);
                    }}
                    placeholder={isDoctor ? '搜索患者姓名或UID...' : '搜索医生姓名或UID...'}
                    className="w-full rounded-xl border border-white/50 bg-white/70 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] outline-none transition-all placeholder:text-slate-400 focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100/70"
                  />
                  {isSearchingUsers && (
                    <LoaderCircle size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" />
                  )}
                </div>

                {userSearchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-white/50 bg-white/80 shadow-lg">
                    {userSearchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleStartConversation(user.id)}
                        className="w-full p-3 text-left hover:bg-indigo-50/50 transition-colors border-b border-white/30 last:border-b-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-sm font-bold">
                            {user.username?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-700 truncate">
                              {user.username || user.id}
                            </div>
                            <div className="text-xs text-slate-500">
                              UID: {user.id} • {user.role === 'doctor' ? '医生' : '患者'}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {userSearchQuery && userSearchResults.length === 0 && !isSearchingUsers && (
                  <div className="rounded-xl border border-white/50 bg-white/80 p-3 text-center text-sm text-slate-500">
                    未找到匹配的用户
                  </div>
                )}
              </div>

              <div className="max-h-[calc(100vh-28rem)] min-h-[380px] space-y-3 overflow-y-auto pr-1 scrollbar-hide">
                {isBootstrapping ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-white/60 bg-white/45 text-slate-500">
                    <LoaderCircle size={28} className="animate-spin text-indigo-500" />
                    <p className="text-sm font-bold">正在加载咨询会话...</p>
                  </div>
                ) : filteredSummaries.length > 0 ? (
                  filteredSummaries.map((item, index) => {
                    const status = statusConfig[item.status];
                    const StatusIcon = status.icon;
                    const isActive = item.conversationId === selectedConversationId;

                    return (
                      <motion.button
                        key={item.conversationId}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => setSelectedConversationId(item.conversationId)}
                        className={cn(
                          'group relative w-full overflow-hidden rounded-[28px] border p-4 text-left transition-all',
                          isActive
                            ? 'border-indigo-200 bg-[linear-gradient(135deg,rgba(238,242,255,0.98),rgba(245,243,255,0.96))] shadow-[0_20px_40px_rgba(99,102,241,0.18)]'
                            : 'border-white/50 bg-white/65 hover:border-indigo-100 hover:bg-white/80 hover:shadow-[0_18px_36px_rgba(148,163,184,0.14)]'
                        )}
                      >
                        <div className={cn('pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl', status.glow)} />
                        <div className="relative z-10">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(79,70,229,0.92),rgba(34,211,238,0.78))] text-base font-black text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)]">
                                {item.title?.trim()?.[0] || 'C'}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-800">{item.title}</div>
                                <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                  <StatusIcon size={12} className="text-slate-400" />
                                  <span className="truncate">{item.subtitle || (isDoctor ? `患者 ID：${item.patientId}` : `医生 ID：${item.doctorId}`)}</span>
                                </div>
                              </div>
                            </div>

                            {item.hasUnread ? (
                              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-1 text-[10px] font-black text-white shadow-[0_10px_22px_rgba(244,63,94,0.26)]">
                                {item.unreadCount}
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">
                                暂无未读
                              </span>
                            )}
                          </div>

                          <div className="mb-3 flex items-center gap-2">
                            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black', status.badge)}>
                              <StatusIcon size={12} />
                              {status.label}
                            </span>
                            {item.lastTimestamp ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                                <Clock3 size={12} />
                                {consultationService.formatRelativeTime(item.lastTimestamp)}
                              </span>
                            ) : null}
                          </div>

                          <p className="line-clamp-2 text-sm font-medium leading-6 text-slate-500">
                            {item.lastMessage || '暂无消息，点击开始本次沟通。'}
                          </p>

                          {item.advicePreview ? (
                            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs font-bold leading-5 text-amber-700">
                              建议摘要：{item.advicePreview}
                            </div>
                          ) : null}
                        </div>
                      </motion.button>
                    );
                  })
                ) : summaries.length > 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center rounded-[28px] border border-dashed border-white/70 bg-white/45 px-6 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Search size={28} />
                    </div>
                    <h3 className="text-lg font-black text-slate-700">没有找到匹配结果</h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                      试试更换关键字、切换筛选状态，或直接查看全部会话。
                    </p>
                  </div>
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center rounded-[28px] border border-dashed border-white/70 bg-white/45 px-6 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Inbox size={28} />
                    </div>
                    <h3 className="text-lg font-black text-slate-700">{emptyTitle}</h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{emptyDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.aside>

          <motion.section
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(245,247,255,0.58))] shadow-[0_30px_80px_rgba(76,81,191,0.15)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.08),transparent_32%)]" />

            {selectedConversation ? (
              <div className="relative z-10 flex h-full min-h-[760px] flex-col">
                <div className="border-b border-white/40 px-6 py-5 sm:px-7">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,rgba(79,70,229,0.94),rgba(56,189,248,0.82),rgba(168,85,247,0.84))] text-2xl font-black text-white shadow-[0_18px_40px_rgba(99,102,241,0.28)]">
                        {selectedConversation.title?.trim()?.[0] || 'C'}
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-400">
                          <CircleDot size={8} className="text-white" />
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-2xl font-black text-slate-800">{selectedConversation.title}</h2>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-600">
                            <CircleDot size={12} />
                            在线
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-600">
                            {isDoctor ? <UserRound size={12} /> : <Stethoscope size={12} />}
                            {isDoctor ? '患者咨询对象' : '负责医生'}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                          {selectedConversation.subtitle || (isDoctor ? `患者 ID：${selectedConversation.patientId}` : `医生 ID：${selectedConversation.doctorId}`)}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black', headerStatus.badge)}>
                            <headerStatus.icon size={12} />
                            {headerStatus.label}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-500">
                            <BadgeCheck size={12} className="text-indigo-500" />
                            会话编号：{selectedConversation.conversationId}
                          </span>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black',
                              selectedUnreadCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            )}
                          >
                            <CheckCheck size={12} />
                            {selectedUnreadCount > 0 ? `未读 ${selectedUnreadCount}` : '消息已读'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    {[
                      { key: 'overview', label: '总览', icon: Radar },
                      { key: 'timeline', label: '时间线', icon: Layers3 },
                      { key: 'actions', label: '快捷动作', icon: ClipboardList }
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = boardMode === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setBoardMode(tab.key as 'overview' | 'timeline' | 'actions')}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black transition-all',
                            active
                              ? 'border-transparent bg-[linear-gradient(135deg,rgba(79,70,229,0.95),rgba(56,189,248,0.88),rgba(168,85,247,0.86))] text-white shadow-[0_14px_30px_rgba(99,102,241,0.22)]'
                              : 'border-white/60 bg-white/70 text-slate-500 hover:border-indigo-100 hover:text-slate-700'
                          )}
                        >
                          <Icon size={14} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={boardMode}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22 }}
                      className="mb-5"
                    >
                      {boardMode === 'overview' ? (
                        <div className="grid gap-3 lg:grid-cols-3">
                          {insightItems.map((item) => (
                            <div
                              key={item.label}
                              className="relative overflow-hidden rounded-[24px] border border-white/50 bg-white/72 p-4 shadow-[0_14px_30px_rgba(148,163,184,0.1)]"
                            >
                              <div className={cn('absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br opacity-80 blur-2xl', item.accent)} />
                              <div className="relative">
                                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
                                <div className="mt-2 text-2xl font-black text-slate-800">{item.value}</div>
                                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{item.note}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : boardMode === 'timeline' ? (
                        <div className="rounded-[28px] border border-white/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(245,247,255,0.74))] p-5 shadow-[0_18px_40px_rgba(148,163,184,0.12)]">
                          <div className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                            <Layers3 size={14} className="text-indigo-500" />
                            沟通时间线
                          </div>
                          <div className="space-y-4">
                            {timelineMoments.map((item, index) => (
                              <div key={item.key} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                  <div className={cn('h-10 w-10 rounded-2xl bg-gradient-to-br shadow-[0_10px_24px_rgba(99,102,241,0.16)]', item.accent)} />
                                  {index !== timelineMoments.length - 1 ? <div className="mt-2 h-full w-px bg-slate-200" /> : null}
                                </div>
                                <div className="flex-1 rounded-[22px] border border-white/60 bg-white/80 px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-sm font-black text-slate-800">{item.title}</div>
                                    <div className="text-[11px] font-bold text-slate-400">{item.time}</div>
                                  </div>
                                  <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{item.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-3">
                          {actionItems.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.key}
                                onClick={item.action}
                                className="group rounded-[24px] border border-white/50 bg-white/75 p-4 text-left shadow-[0_14px_30px_rgba(148,163,184,0.1)] transition-all hover:-translate-y-1 hover:border-indigo-100 hover:shadow-[0_20px_38px_rgba(99,102,241,0.14)]"
                              >
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(79,70,229,0.95),rgba(56,189,248,0.86),rgba(168,85,247,0.84))] text-white shadow-[0_12px_26px_rgba(99,102,241,0.2)]">
                                  <Icon size={18} />
                                </div>
                                <div className="mt-4 text-sm font-black text-slate-800">{item.title}</div>
                                <p className="mt-2 text-xs font-medium leading-5 text-slate-500">{item.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                      {(selectedConversation.messages || []).length > 0 ? (
                        selectedConversation.messages!.map((message, index) => {
                          const isMine = message.senderId === currentUser?.id;
                          const theme = getMessageTheme(message, isMine);
                          const Icon = theme.icon;

                          return (
                            <motion.div
                              key={message.id || `${message.timestamp}-${index}`}
                              initial={{ opacity: 0, y: 16, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.24, delay: index * 0.02 }}
                              className={cn('flex w-full', theme.align)}
                            >
                              <div className={cn('flex w-full items-end gap-3', isMine ? 'justify-end' : 'justify-start')}>
                                {!isMine ? (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(79,70,229,0.94),rgba(56,189,248,0.82),rgba(168,85,247,0.84))] text-sm font-black text-white shadow-[0_12px_28px_rgba(99,102,241,0.22)]">
                                    {message.type === 'doctor_advice' ? '建' : (selectedConversation.title?.trim()?.[0] || 'C')}
                                  </div>
                                ) : null}

                                <div className={cn(theme.container, 'w-fit')}>
                                  <div className={theme.inner}>
                                    <div className="mb-2 flex items-center gap-2">
                                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black', theme.chip)}>
                                        <Icon size={12} />
                                        {message.type === 'doctor_advice'
                                          ? '医生建议'
                                          : message.type === 'doctor_message'
                                            ? '医生消息'
                                            : '患者消息'}
                                      </span>
                                      <span className={cn('text-[11px] font-bold', theme.metaTone)}>
                                        {consultationService.formatRelativeTime(message.timestamp)}
                                      </span>
                                    </div>

                                    <p className={cn('whitespace-pre-wrap text-sm font-medium leading-7', theme.content)}>{message.content}</p>
                                  </div>
                                </div>

                                {isMine ? (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(79,70,229,0.94),rgba(56,189,248,0.82),rgba(168,85,247,0.84))] text-sm font-black text-white shadow-[0_12px_28px_rgba(99,102,241,0.22)]">
                                    我
                                  </div>
                                ) : null}
                              </div>
                            </motion.div>
                          );
                        })
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex min-h-[320px] flex-col items-center justify-center rounded-[30px] border border-dashed border-white/70 bg-white/45 px-6 text-center"
                        >
                          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                            <MessageCircleMore size={28} />
                          </div>
                          <h3 className="text-lg font-black text-slate-700">开始第一条沟通吧</h3>
                          <p className="mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
                            {isDoctor
                              ? '你可以向患者发送鼓励、追踪问题或补充说明，形成连续且可追溯的随访记录。'
                              : '你可以把今天的感受、症状变化或训练反馈告诉医生，让建议更贴近你的真实状态。'}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div ref={messageEndRef} />
                  </div>
                </div>

                <div className="border-t border-white/40 px-4 py-5 sm:px-6">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {quickReplies.map((item) => (
                      <button
                        key={item}
                        onClick={() => handleSelectQuickReply(item)}
                        className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs font-bold text-slate-600 shadow-[0_10px_22px_rgba(148,163,184,0.1)] transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:text-indigo-600"
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-[30px] border border-white/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(245,247,255,0.72))] p-3 shadow-[0_18px_40px_rgba(148,163,184,0.12)] backdrop-blur-xl">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="flex-1">
                        <textarea
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          rows={3}
                          placeholder={isDoctor ? '给患者一句安心的解释、一条具体的提醒，或继续补充今天的诊疗建议…' : '把你的感受、疑问或训练反馈轻轻告诉医生吧…'}
                          className="w-full resize-none rounded-[24px] border border-white/60 bg-white/80 px-4 py-3 text-sm font-medium leading-7 text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-200 focus:ring-4 focus:ring-indigo-100/70"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              handleSendMessage();
                            }
                          }}
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="hidden rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 md:block">
                          Enter 发送
                        </div>
                        <button
                          onClick={handleSendMessage}
                          disabled={!messageInput.trim() || isSending}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-[22px] px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_36px_rgba(99,102,241,0.26)] transition-all',
                            !messageInput.trim() || isSending
                              ? 'cursor-not-allowed bg-slate-300 shadow-none'
                              : 'bg-[linear-gradient(135deg,rgba(79,70,229,0.96),rgba(56,189,248,0.86),rgba(168,85,247,0.9))] hover:-translate-y-0.5'
                          )}
                        >
                          {isSending ? <LoaderCircle size={18} className="animate-spin" /> : <SendHorizonal size={18} />}
                          发送消息
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex min-h-[760px] flex-col items-center justify-center px-8 text-center">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/50 bg-white/70 text-indigo-500 shadow-[0_18px_40px_rgba(99,102,241,0.12)]">
                  <MessageCircleMore size={40} />
                </div>
                <h3 className="text-2xl font-black text-slate-800">
                  {filteredSummaries.length > 0 ? '请选择一个会话开始沟通' : '暂时还没有可展示的咨询内容'}
                </h3>
                <p className="mt-3 max-w-lg text-sm font-medium leading-7 text-slate-500">
                  {filteredSummaries.length > 0
                    ? '左侧会话卡片会汇总患者状态、最近建议与最新消息。点开任意一项，即可进入沉浸式沟通视图。'
                    : emptyDescription}
                </p>
              </div>
            )}
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 }}
            className="relative overflow-hidden rounded-[34px] border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(245,247,255,0.55))] p-5 shadow-[0_24px_70px_rgba(99,102,241,0.12)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.1),transparent_30%)]" />
            <div className="relative z-10 space-y-4">
              <motion.div
                whileHover={{ y: -4 }}
                className="rounded-[28px] border border-white/50 bg-[linear-gradient(135deg,rgba(79,70,229,0.82),rgba(56,189,248,0.82),rgba(168,85,247,0.88))] p-5 text-white shadow-[0_22px_40px_rgba(99,102,241,0.24)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-white/70">Consult Board</div>
                    <h3 className="mt-2 text-2xl font-black">{counterpartName}</h3>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                    {isDoctor ? <UserRound size={22} /> : <Stethoscope size={22} />}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-white/85">
                  {isDoctor ? '建议、追问与随访提醒会在这里形成一条连续的患者沟通时间线。' : '医生建议会第一时间同步到这里，你也可以继续追问并反馈自己的身体变化。'}
                </p>
                <button
                  onClick={() => setBoardMode('timeline')}
                  className="mt-4 flex w-full items-center justify-between rounded-[20px] bg-white/14 px-4 py-3 text-left text-xs font-bold text-white/90 transition-all hover:bg-white/20"
                >
                  <span className="inline-flex items-center gap-2">
                    <CircleDot size={12} />
                    最近活跃：{lastActiveText}
                  </span>
                  <ArrowRight size={14} />
                </button>
              </motion.div>

              <div className="rounded-[28px] border border-white/50 bg-white/72 p-5 shadow-[0_18px_36px_rgba(148,163,184,0.1)] backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <Sparkles size={14} className="text-indigo-500" />
                  面板功能
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => setBoardMode('overview')}
                    className={cn(
                      'w-full rounded-2xl px-4 py-3 text-left transition-all',
                      boardMode === 'overview' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <div className="text-sm font-black">总览数据</div>
                    <p className="mt-1 text-xs font-medium leading-5">查看建议同步、互动频率和会话热度。</p>
                  </button>
                  <button
                    onClick={() => setBoardMode('timeline')}
                    className={cn(
                      'w-full rounded-2xl px-4 py-3 text-left transition-all',
                      boardMode === 'timeline' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <div className="text-sm font-black">时间线追踪</div>
                    <p className="mt-1 text-xs font-medium leading-5">把“写建议”与对话自动串成连续时间线。</p>
                  </button>
                  <button
                    onClick={() => setBoardMode('actions')}
                    className={cn(
                      'w-full rounded-2xl px-4 py-3 text-left transition-all',
                      boardMode === 'actions' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <div className="text-sm font-black">快捷动作</div>
                    <p className="mt-1 text-xs font-medium leading-5">一键生成建议补充、反馈模板和跟进话术。</p>
                  </button>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/50 bg-white/72 p-5 shadow-[0_18px_36px_rgba(148,163,184,0.1)] backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <Layers3 size={14} className="text-cyan-500" />
                  最新沉淀
                </div>
                <div className="space-y-3">
                  {timelineMoments.slice(0, 2).map((item) => (
                    <div key={item.key} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-black text-slate-700">{item.title}</div>
                        <div className="text-[11px] font-bold text-slate-400">{item.time}</div>
                      </div>
                      <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(209,250,229,0.88))] p-5 shadow-[0_18px_36px_rgba(16,185,129,0.12)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm">
                    <HeartHandshake size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-800">温和陪伴式沟通</div>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                      保持清晰、及时、可执行的建议，会显著提升患者配合度。
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
};
