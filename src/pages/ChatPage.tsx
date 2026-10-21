import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, User, Bot, Loader2, Sparkles, Plus, MessageSquare, History, Activity, 
  Share2, MoreVertical, AlertCircle, X, Check, Copy, FileText, 
  Calendar, Stethoscope, Heart, Zap
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { callTongyiAPI } from '../services/tongyiService';
import { userService, UserProfile } from '../services/userService';
import { UserProfileModal } from '../components/UserProfileModal';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string, type: 'error' | 'suggestion' | 'other') => void;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  onCopy: () => void;
}

// 快捷提问标签
const QUICK_QUESTIONS = [
  { icon: FileText, label: '肺炎常见问题', question: '肺炎有哪些常见症状？如何预防和治疗？' },
  { icon: Zap, label: '检查结果怎么看', question: '如何解读肺部 CT 检查报告？各项指标代表什么？' },
  { icon: Heart, label: '日常护理建议', question: '肺部疾病患者在日常生活中需要注意什么？有哪些护理建议？' },
  { icon: Stethoscope, label: '药物使用疑问', question: '治疗肺部疾病的药物应该如何正确使用？有什么副作用？' },
];

const MAX_INPUT_LENGTH = 500;

// 反馈弹窗组件
const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState<'error' | 'suggestion' | 'other'>('error');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!feedback.trim()) return;
    onSubmit(feedback, feedbackType);
    setIsSubmitted(true);
    setTimeout(() => {
      setFeedback('');
      setIsSubmitted(false);
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="soft-card bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-night-royal to-night-sky rounded-xl flex items-center justify-center text-white">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-night-deep">反馈与建议</h3>
                    <p className="text-xs font-bold text-slate-400">帮助我们做得更好</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 hover:text-night-royal transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-12 flex flex-col items-center justify-center"
                >
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-4">
                    <Check size={32} />
                  </div>
                  <p className="text-lg font-black text-night-deep">感谢您的反馈！</p>
                  <p className="text-sm font-bold text-slate-400 mt-2">我们会认真考虑您的建议</p>
                </motion.div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">反馈类型</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFeedbackType('error')}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                          feedbackType === 'error'
                            ? "bg-red-50 text-red-600 border-2 border-red-200"
                            : "bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100"
                        )}
                      >
                        内容纠错
                      </button>
                      <button
                        onClick={() => setFeedbackType('suggestion')}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                          feedbackType === 'suggestion'
                            ? "bg-blue-50 text-blue-600 border-2 border-blue-200"
                            : "bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100"
                        )}
                      >
                        功能建议
                      </button>
                      <button
                        onClick={() => setFeedbackType('other')}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                          feedbackType === 'other'
                            ? "bg-slate-50 text-slate-600 border-2 border-slate-200"
                            : "bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100"
                        )}
                      >
                        其他
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">详细内容</label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder={feedbackType === 'error' ? "请指出具体的错误内容..." : "请详细描述您的建议..."}
                      className="w-full h-32 p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-night-royal focus:ring-0 text-sm font-medium text-night-deep placeholder:text-slate-400 resize-none"
                    />
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={!feedback.trim()}
                    className={cn(
                      "w-full py-4 rounded-2xl font-black text-white transition-all",
                      !feedback.trim()
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-night-royal to-night-sky hover:scale-[1.02] shadow-lg shadow-night-royal/20"
                    )}
                  >
                    提交反馈
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// 分享弹窗组件
const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, shareUrl, onCopy }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="soft-card bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-night-royal to-night-sky rounded-xl flex items-center justify-center text-white">
                    <Share2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-night-deep">分享对话</h3>
                    <p className="text-xs font-bold text-slate-400">生成链接分享给他人</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 hover:text-night-royal transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">分享链接</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-1 px-4 py-3 bg-slate-50 rounded-xl border-2 border-transparent text-sm font-bold text-slate-600"
                    />
                    <button
                      onClick={onCopy}
                      className="px-4 py-3 bg-night-royal text-white rounded-xl hover:bg-night-royal/90 transition-all"
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 flex items-center gap-2">
                    <AlertCircle size={14} />
                    分享链接将在 7 天后失效，且仅包含对话内容，不包含个人信息
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export const ChatPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [showTooltip, setShowTooltip] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 初始化时从 localStorage 加载对话历史
  useEffect(() => {
    const savedConversations = localStorage.getItem('chat-conversations');
    if (savedConversations) {
      const parsed = JSON.parse(savedConversations);
      const conversationsWithDates = parsed.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        messages: c.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }))
      }));
      setConversations(conversationsWithDates);
      
      if (conversationsWithDates.length > 0) {
        const latest = conversationsWithDates.sort((a: any, b: any) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];
        setCurrentConversationId(latest.id);
        setMessages(latest.messages);
      }
    }
    
    if (!currentConversationId && conversations.length === 0) {
      startNewConversation();
    }

    // 加载用户画像
    const profile = userService.getUserProfile();
    setUserProfile(profile);
  }, []);

  // 保存对话到 localStorage
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('chat-conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 开始新对话
  const startNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: '新的对话',
      messages: [{
        id: '1',
        role: 'assistant',
        content: '您好！我是您的肺部健康智能助手。您可以向我咨询关于肺部健康、CT 影像分析结果或日常护理建议。请问有什么可以帮您？',
        timestamp: new Date()
      }],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newConversation.id);
    setMessages(newConversation.messages);
  };

  // 加载历史对话
  const loadConversation = (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      setCurrentConversationId(conversationId);
      setMessages(conversation.messages);
    }
  };

  // 更新当前对话
  const updateCurrentConversation = (updatedMessages: Message[]) => {
    if (!currentConversationId) return;
    
    setConversations(prev => prev.map(c => {
      if (c.id === currentConversationId) {
        const firstUserMessage = updatedMessages.find(m => m.role === 'user');
        const title = firstUserMessage 
          ? firstUserMessage.content.slice(0, 20) + (firstUserMessage.content.length > 20 ? '...' : '')
          : c.title;
        
        return {
          ...c,
          title,
          messages: updatedMessages,
          updatedAt: new Date()
        };
      }
      return c;
    }));
  };

  const handleSend = async (customMessage?: string) => {
    const messageToSend = customMessage || input;
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToSend,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await callTongyiAPI(messageToSend, undefined, userProfile);
      console.log('阿里通义返回:', response);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || '抱歉，我暂时无法回答这个问题。',
        timestamp: new Date()
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      updateCurrentConversation(finalMessages);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `连接出错：${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: new Date()
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      updateCurrentConversation(finalMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleQuickQuestion = (question: string) => {
    handleSend(question);
  };

  const handleShare = () => {
    if (!currentConversationId) return;
    
    const shareId = btoa(currentConversationId);
    const url = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
    setShareUrl(url);
    setShowShareModal(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  const handleFeedback = (feedback: string, type: 'error' | 'suggestion' | 'other') => {
    localStorage.setItem('chat-feedback', JSON.stringify({
      type,
      feedback,
      conversationId: currentConversationId,
      timestamp: new Date().toISOString()
    }));
  };

  const handleGenerateFollowUpPlan = () => {
    alert('正在为您生成个性化的随访计划...（功能开发中）');
  };

  const handleInputFocus = () => {
    setShowTooltip(true);
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowTooltip(false), 200);
  };

  const isInputTooLong = input.length > MAX_INPUT_LENGTH;
  const canSend = input.trim() && !isInputTooLong && !isLoading;

  const handleSendClick = () => {
    if (!input.trim()) {
      const inputElement = inputRef.current;
      if (inputElement) {
        inputElement.classList.add('animate-pulse');
        setTimeout(() => inputElement.classList.remove('animate-pulse'), 500);
      }
      return;
    }
    if (isInputTooLong) {
      return;
    }
    handleSend();
  };

  return (
    <div className="h-screen bg-brand-bg flex p-8 gap-8 overflow-hidden">
      {/* Chat Sidebar */}
      <div className="w-80 flex flex-col gap-6">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 bg-night-sky/10 text-night-sky px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">
            <Activity size={14} />
            <span>AI 智能问答系统</span>
          </div>
          <h2 className="text-4xl font-black text-night-deep">肺管家助手</h2>
          <p className="text-slate-400 font-medium">全天候为您解答肺部健康疑问，提供专业医学建议。</p>
        </header>

        <button 
          onClick={startNewConversation}
          className="w-full py-4 bg-night-royal text-white rounded-2xl font-black shadow-xl shadow-night-royal/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          开启新对话
        </button>

        <div className="soft-card p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
              <History size={14} />
              历史对话
            </h3>
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-400">暂无历史对话</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={cn(
                      "w-full p-4 rounded-2xl text-left text-sm font-bold transition-all flex items-center gap-3",
                      currentConversationId === conv.id
                        ? "bg-night-royal/10 text-night-royal"
                        : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <MessageSquare size={16} className={cn(
                      currentConversationId === conv.id ? "text-night-royal" : "text-slate-300"
                    )} />
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{conv.title}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(conv.updatedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="soft-card p-6 flex items-center justify-between">
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                {i}
              </div>
            ))}
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1.2k+ 用户在线</span>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col soft-card bg-white/50 backdrop-blur-sm overflow-hidden border-white">
        {/* Chat Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-night-royal to-night-sky rounded-2xl flex items-center justify-center text-white shadow-lg shadow-night-royal/20">
              <Bot size={28} />
            </div>
            <div>
              <div className="text-lg font-black text-night-deep">肺管家 AI</div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-slate-400">在线 · 极速响应</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowProfileModal(true)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-sm transition-all relative"
              title="健康档案"
            >
              <User size={18} />
              {(userProfile.age || userProfile.gender || userProfile.basicDiseases?.length) && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full" />
              )}
            </button>
            <button 
              onClick={handleShare}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-sm transition-all"
            >
              <Share2 size={18} />
            </button>
            <button 
              onClick={() => setShowFeedbackModal(true)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-sm transition-all"
            >
              <MoreVertical size={18} />
            </button>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex items-start gap-4",
                  message.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg",
                  message.role === 'user' 
                    ? "bg-white text-night-royal" 
                    : "bg-gradient-to-br from-night-royal to-night-sky text-white"
                )}>
                  {message.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>
                
                <div className={cn(
                  "max-w-[70%] p-6 rounded-[28px] shadow-sm",
                  message.role === 'user'
                    ? "bg-night-royal text-white rounded-tr-none"
                    : "bg-white text-slate-600 rounded-tl-none border border-slate-50"
                )}>
                  <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-p:font-medium">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  <div className={cn(
                    "text-[10px] mt-3 font-bold uppercase tracking-widest opacity-50",
                    message.role === 'user' ? "text-white" : "text-slate-400"
                  )}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-night-royal to-night-sky text-white flex items-center justify-center shadow-lg">
                <Bot size={20} />
              </div>
              <div className="bg-white p-6 rounded-[28px] rounded-tl-none shadow-sm border border-slate-50">
                <Loader2 size={20} className="animate-spin text-night-royal" />
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions */}
        <div className="px-8 py-4 bg-white/30 border-t border-slate-100">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {QUICK_QUESTIONS.map((item, index) => (
              <motion.button
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleQuickQuestion(item.question)}
                className="flex-shrink-0 px-4 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-night-royal hover:shadow-md transition-all flex items-center gap-2 group"
              >
                <item.icon size={16} className="text-night-royal group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-slate-600 group-hover:text-night-royal whitespace-nowrap">
                  {item.label}
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-8 bg-white/50 border-t border-slate-100">
          <div className="max-w-4xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-night-royal to-night-sky rounded-[32px] blur opacity-10 group-focus-within:opacity-20 transition duration-500" />
            <div className="relative flex items-center gap-4 bg-white p-3 rounded-[28px] shadow-xl shadow-black/5 border border-slate-100">
              <div className="p-3 text-night-pink bg-night-pink/5 rounded-2xl">
                <Sparkles size={20} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder="我可以帮你解释肺炎、CT 报告和护理建议…"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-night-deep placeholder:text-slate-300"
              />
              {input.length > 0 && (
                <span className={cn(
                  "text-xs font-bold px-2 py-1 rounded-lg",
                  isInputTooLong ? "text-red-500 bg-red-50" : "text-slate-400 bg-slate-50"
                )}>
                  {input.length}/{MAX_INPUT_LENGTH}
                </span>
              )}
              <button
                onClick={handleSendClick}
                disabled={!canSend || isLoading}
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  !canSend || isLoading
                    ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                    : "bg-night-royal text-white shadow-lg shadow-night-royal/20 hover:scale-105 active:scale-95"
                )}
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
            
            <AnimatePresence>
              {showTooltip && !input && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-night-deep text-white rounded-xl text-xs font-bold whitespace-nowrap"
                >
                  请输入您的问题，我可以帮您…
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-night-deep rotate-45" />
                </motion.div>
              )}
            </AnimatePresence>

            {isInputTooLong && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -bottom-8 left-0 text-xs font-bold text-red-500 flex items-center gap-1"
              >
                <AlertCircle size={12} />
                字数超限，建议控制在{MAX_INPUT_LENGTH}字以内
              </motion.div>
            )}
          </div>

          {/* 随访计划入口 */}
          <div className="max-w-4xl mx-auto mt-6">
            <button
              onClick={handleGenerateFollowUpPlan}
              className="w-full py-4 bg-gradient-to-r from-night-royal to-night-sky text-white rounded-2xl font-black shadow-lg shadow-night-royal/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
            >
              <Calendar size={20} />
              生成随访计划 / 保存为护理方案
            </button>
          </div>

          <div className="text-center mt-4">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">AI 助手建议仅供参考，不作为最终医疗诊断依据</p>
          </div>
        </div>
      </div>

      {/* Modals */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSubmit={handleFeedback}
      />
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareUrl}
        onCopy={handleCopyLink}
      />
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSave={(profile) => setUserProfile(profile)}
      />
    </div>
  );
};

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  
  return new Date(date).toLocaleDateString('zh-CN');
};
