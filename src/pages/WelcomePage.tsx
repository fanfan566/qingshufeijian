import React from 'react';
import { motion } from 'motion/react';
import { Wind, ArrowRight, ShieldCheck, Zap, HeartPulse, Sparkles, Activity } from 'lucide-react';
import { PageType } from '../types';

interface WelcomePageProps {
  onStart: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-brand-bg pt-16 overflow-hidden relative">
      {/* Background Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-night-royal/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-night-pink/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-night-lavender/5 rounded-full blur-[100px] -z-10" />

      <div className="max-w-7xl mx-auto px-8 h-[calc(100vh-64px)] flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 bg-night-royal/10 text-night-royal px-5 py-2 rounded-full text-xs font-black tracking-widest uppercase border border-night-royal/5">
              <Sparkles size={14} />
              <span>AI 驱动的肺部健康专家</span>
            </div>
            
            <h1 className="text-7xl font-black text-night-deep leading-[1.1] tracking-tight">
              您的
              <br />
              智能<span className="text-transparent bg-clip-text bg-gradient-to-r from-night-royal to-night-sky whitespace-nowrap">肺部健康</span>
              <br />
              全方位管家
            </h1>
            
            <p className="text-xl text-slate-500 max-w-lg leading-relaxed font-medium">
              集成最先进的 AI 图像分割技术与肺部知识图谱，为您提供精准的诊断辅助、智能问答及个性化健康管理方案。
            </p>
            
            <div className="flex items-center gap-6 pt-4">
              <button 
                onClick={() => window.location.href = '/login'}
                className="btn-primary flex items-center gap-3 text-lg group"
              >
                立即开始
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="btn-secondary text-lg">
                了解更多
              </button>
            </div>

            <div className="pt-12 grid grid-cols-3 gap-12">
              <div className="space-y-2">
                <div className="text-4xl font-black text-night-royal">99%</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">分割准确率</div>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-black text-night-pink">5000+</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">知识节点</div>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-black text-night-lavender">24/7</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">智能问答</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="relative z-10 soft-card p-10 bg-white/40 backdrop-blur-xl border-white/60 peel-effect group">
              <div className="rounded-[32px] overflow-hidden shadow-2xl shadow-night-royal/10 border border-white/50">
                <img 
                  src="/images/picture1.jpg" 
                  alt="Lung Health Visualization" 
                  className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-1000"
                  style={{ minHeight: '400px' }}
                />
              </div>
              
              {/* Floating UI Elements - Soft UI Style */}
              <motion.div 
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -top-8 -right-8 glass-card p-5 rounded-[24px] flex items-center gap-4 shadow-2xl shadow-night-sky/20"
              >
                <div className="bg-night-sky/10 p-3 rounded-2xl text-night-sky">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">健康状态</div>
                  <div className="text-base font-black text-night-deep">肺部功能良好</div>
                </div>
              </motion.div>

              <motion.div 
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, delay: 1 }}
                className="absolute -bottom-8 -left-8 glass-card p-5 rounded-[24px] flex items-center gap-4 shadow-2xl shadow-night-pink/20"
              >
                <div className="bg-night-pink/10 p-3 rounded-2xl text-night-pink">
                  <HeartPulse size={28} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">实时监测</div>
                  <div className="text-base font-black text-night-deep">呼吸频率稳定</div>
                </div>
              </motion.div>

              <motion.div 
                animate={{ x: [0, 10, 0] }}
                transition={{ duration: 6, repeat: Infinity, delay: 0.5 }}
                className="absolute top-1/2 -right-12 -translate-y-1/2 glass-card p-5 rounded-[24px] flex items-center gap-4 shadow-2xl shadow-night-lavender/20"
              >
                <div className="bg-night-lavender/10 p-3 rounded-2xl text-night-lavender">
                  <Activity size={28} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">AI 算力</div>
                  <div className="text-base font-black text-night-deep">极速响应</div>
                </div>
              </motion.div>
            </div>

            {/* Background Decorative Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-night-royal/5 rounded-full blur-[100px] -z-10" />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
