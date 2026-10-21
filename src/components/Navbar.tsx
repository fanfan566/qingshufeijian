import React from 'react';
import {
  Wind,
  Image as ImageIcon,
  Network,
  MessageSquare,
  MessagesSquare,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Database
} from 'lucide-react';
import { PageType } from '../types';
import { cn } from '../lib/utils';
import { userService } from '../services/userService';

interface NavbarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, onPageChange }) => {
  const currentUser = userService.getCurrentUser();
  const isPatient = currentUser?.role === 'patient';

  const navItems = [
    { id: 'dashboard', label: '概览', icon: LayoutDashboard },
    { id: 'segmentation', label: '图像分割', icon: ImageIcon },
    { id: 'graph', label: '知识图谱', icon: Network },
    { id: 'chat', label: '智能问答', icon: MessageSquare },
    { id: 'consultation', label: '咨询反馈', icon: MessagesSquare },
    ...(isPatient
      ? [
          { id: 'plans', label: '计划制定', icon: ClipboardList },
          { id: 'crawler', label: '爬虫管理', icon: Database },
        ]
      : []),
  ];

  const handleLogout = () => {
    userService.logout();
    window.location.href = '/login';
  };

  if (currentPage === 'welcome') return null;

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-80 p-5">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2rem] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0.1)_100%)] px-5 py-6 shadow-[0_24px_80px_rgba(31,38,135,0.16)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(191,140,225,0.28),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(55,133,216,0.18),transparent_32%)]" />
        <div className="pointer-events-none absolute left-4 top-5 h-24 w-24 rounded-full bg-night-pink/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-28 right-0 h-32 w-32 rounded-full bg-night-sky/20 blur-3xl" />

        <div
          className="relative mb-10 flex cursor-pointer items-center gap-3 rounded-[1.75rem] border border-white/25 bg-white/10 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-all hover:bg-white/14 group"
          onClick={() => onPageChange('welcome')}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-night-lavender via-night-royal to-night-sky text-white shadow-[0_12px_30px_rgba(28,29,171,0.35)] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
            <Wind size={24} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400/90">Lang Protector</div>
            <span className="block text-xl font-black tracking-tight text-slate-900/95">肺管家</span>
          </div>
        </div>

        {/* 可滑动的导航区域 */}
        <div className="relative flex-1 overflow-y-auto scrollbar-hide">
          <nav className="space-y-3 pb-6">
            <div className="px-3 text-[10px] font-bold uppercase tracking-[0.38em] text-slate-400/90">主菜单</div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id as PageType)}
                className={cn(
                  "group relative flex w-full items-center gap-4 overflow-hidden rounded-[1.35rem] border px-4 py-3.5 text-left font-bold transition-all duration-300",
                  currentPage === item.id
                    ? "border-white/30 bg-[linear-gradient(135deg,rgba(28,29,171,0.88),rgba(55,133,216,0.75),rgba(232,147,197,0.58))] text-white shadow-[0_18px_38px_rgba(46,64,184,0.32)]"
                    : "border-transparent bg-white/0 text-slate-500 hover:border-white/20 hover:bg-white/10 hover:text-night-deep"
                )}
              >
                <span className={cn("absolute inset-0 transition-opacity", currentPage === item.id ? "opacity-100 bg-[linear-gradient(90deg,rgba(255,255,255,0.2),transparent_45%)]" : "opacity-0 group-hover:opacity-100 bg-[linear-gradient(90deg,rgba(255,255,255,0.12),transparent_45%)]")} />
                <span
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300",
                    currentPage === item.id
                      ? "border-white/20 bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                      : "border-white/10 bg-white/10 text-slate-400 group-hover:border-white/20 group-hover:bg-white/14 group-hover:text-night-royal"
                  )}
                >
                  <item.icon size={20} />
                </span>
                <span className="relative flex-1">{item.label}</span>
              </button>
            ))}

          </nav>
        </div>

        <div className="relative mt-auto pt-6">
          <div className="mb-5 overflow-hidden rounded-[1.9rem] border border-white/25 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 shadow-[0_18px_44px_rgba(120,87,255,0.18)] backdrop-blur-xl">
            <div className="pointer-events-none absolute right-3 top-2 h-16 w-16 rounded-full bg-night-pink/25 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-4 left-2 h-20 w-20 rounded-full bg-night-sky/20 blur-2xl" />
            <div className="relative">
              <div className="mb-2 inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-night-pink">
                Premium
              </div>
              <div className="text-sm font-bold text-slate-900/95">升级专业版</div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                解锁更多 AI 分析报告与无限次咨询
              </p>
              <button className="mt-4 w-full rounded-2xl border border-white/20 bg-[linear-gradient(135deg,rgba(232,147,197,0.95),rgba(191,140,225,0.88))] py-2.5 text-[11px] font-bold text-white shadow-[0_14px_30px_rgba(232,147,197,0.28)] transition-all hover:scale-[1.02] hover:shadow-[0_16px_34px_rgba(232,147,197,0.34)]">
                立即升级
              </button>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[1.35rem] border border-transparent px-4 py-3.5 text-left font-bold text-slate-500 transition-all duration-300 hover:border-red-200/70 hover:bg-red-50/70 hover:text-red-500"
          >
            <span className="absolute inset-0 opacity-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.1),transparent_45%)] transition-opacity group-hover:opacity-100" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-slate-400 transition-all duration-300 group-hover:border-red-200/80 group-hover:bg-white/30 group-hover:text-red-500">
              <LogOut size={20} />
            </span>
            <span className="relative flex-1">退出登录</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
