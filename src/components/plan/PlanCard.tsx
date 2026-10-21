import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Shield, MoreVertical, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { HealthPlan } from '../../types/plan';
import { planService } from '../../services/planService';

interface PlanCardProps {
  plan: HealthPlan;
  index: number;
  totalCards: number;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isSelected?: boolean;
}

const COLOR_GRADIENTS: Record<string, { from: string; to: string; shadow: string }> = {
  blue: { from: 'from-sky-300/90', to: 'to-blue-500/78', shadow: 'shadow-sky-300/30' },
  mint: { from: 'from-emerald-200/90', to: 'to-teal-400/78', shadow: 'shadow-emerald-300/30' },
  peach: { from: 'from-orange-200/92', to: 'to-amber-400/80', shadow: 'shadow-orange-300/30' },
  lavender: { from: 'from-violet-200/92', to: 'to-fuchsia-400/80', shadow: 'shadow-violet-300/30' },
  rose: { from: 'from-pink-200/92', to: 'to-rose-400/80', shadow: 'shadow-pink-300/30' },
};

const FALLBACK_COLOR_KEYS = Object.keys(COLOR_GRADIENTS);

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  index,
  totalCards,
  onClick,
  onDelete,
  isSelected = false
}) => {
  const stats = planService.calculateStatistics(plan);
  const fallbackColorKey =
    FALLBACK_COLOR_KEYS[
      plan.id.split('-').reduce((a, b) => a + parseInt(b) || 0, 0) % FALLBACK_COLOR_KEYS.length
    ];
  const colorScheme = COLOR_GRADIENTS[plan.color || fallbackColorKey] || COLOR_GRADIENTS.blue;
  const isTopCard = index === 0;
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, x: 50, rotate: 15 }}
        animate={{
          opacity: isTopCard ? 1 : Math.max(0.35, 1 - index * 0.15),
          y: index * 15,
          x: index * 12,
          rotate: index * 4,
          scale: 1 - index * 0.04,
          zIndex: totalCards - index,
        }}
        exit={{ opacity: 0, x: -200, rotate: -20, transition: { duration: 0.3 } }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 20,
        }}
        onClick={onClick}
        className={cn(
          "absolute left-0 right-10 overflow-hidden rounded-[32px] border border-white/35 p-8 text-slate-700 shadow-xl backdrop-blur-xl transition-all",
          "bg-gradient-to-br",
          colorScheme.from,
          colorScheme.to,
          colorScheme.shadow,
          isTopCard ? "hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(255,255,255,0.12)]" : "",
          isSelected ? "ring-1 ring-white/45" : ""
        )}
        style={{
          transformOrigin: 'bottom center',
          aspectRatio: '1.15/1',
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.28),rgba(255,255,255,0.08)_40%,rgba(255,255,255,0.02))]" />
        <div className="absolute inset-0 border border-white/10 rounded-[32px]" />
        <div className="absolute inset-x-10 top-8 h-24 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute -right-6 top-12 h-28 w-28 rounded-full bg-white/18 blur-3xl" />
        <div className="absolute -bottom-10 -right-4 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-8 flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/35 bg-white/32 backdrop-blur-md shadow-[0_10px_30px_rgba(255,255,255,0.12)]">
              {index % 2 === 0 ? (
                <Heart size={20} className="text-slate-700" />
              ) : (
                <Shield size={20} className="text-slate-700" />
              )}
            </div>
            {isTopCard && (
              <span className="rounded-xl border border-white/25 bg-white/30 px-3 py-1.5 text-xs font-bold text-slate-700 backdrop-blur-md">
                {plan.status === 'active' ? '进行中' : plan.status === 'completed' ? '已完成' : '未开始'}
              </span>
            )}
          </div>

          <div className="mb-10">
            <h4 className="mb-3 text-3xl font-black tracking-wide text-slate-800">{plan.name}</h4>
            <p className="line-clamp-3 text-base leading-relaxed font-semibold text-slate-700/85">
              {plan.description}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold text-slate-700">
              <span>完成进度</span>
              <span>{stats.completionRate}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/20 bg-white/30">
              <motion.div
                className="h-full bg-white/95 shadow-[0_0_20px_rgba(255,255,255,0.75)]"
                initial={{ width: 0 }}
                animate={{ width: `${stats.completionRate}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            </div>
          </div>

          {isTopCard && (
            <div className="absolute right-0 top-0">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/25 bg-white/30 backdrop-blur-md transition-colors hover:bg-white/40"
              >
                <MoreVertical size={16} className="text-slate-700" />
              </motion.button>

              <AnimatePresence>
                {showMenu && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowMenu(false)}
                      className="fixed inset-0 z-40"
                    />

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-white/40 bg-white/82 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                    >
                      <div className="border-b border-slate-200/70 bg-gradient-to-r from-white/80 to-slate-100/80 px-4 py-3">
                        <p className="text-xs font-bold text-slate-700">计划管理</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{plan.name}</p>
                      </div>

                      <div className="p-2">
                        <motion.button
                          whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}
                          whileTap={{ scale: 0.98 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowMenu(false);
                            onDelete(e);
                          }}
                          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 transition-colors group-hover:bg-red-100">
                            <Trash2 size={16} className="text-red-500 group-hover:text-red-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-red-500">删除计划</p>
                            <p className="text-[10px] text-slate-400">删除后无法恢复</p>
                          </div>
                        </motion.button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

interface PlanCardsStackProps {
  plans: HealthPlan[];
  selectedPlanId: string | null;
  onSelectPlan: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
}

export const PlanCardsStack: React.FC<PlanCardsStackProps> = ({
  plans,
  selectedPlanId,
  onSelectPlan,
  onDeletePlan
}) => {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/70">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md">
          <Heart size={32} className="opacity-80" />
        </div>
        <p className="text-sm font-bold">暂无健康计划</p>
        <p className="mt-1 text-xs font-medium text-white/55">创建一个计划开始您的健康管理之旅</p>
      </div>
    );
  }

  const getSortedPlans = () => {
    if (!selectedPlanId) return plans;
    const selectedIndex = plans.findIndex(p => p.id === selectedPlanId);
    if (selectedIndex === -1) return plans;
    const selected = plans[selectedIndex];
    const others = plans.filter((_, i) => i !== selectedIndex);
    return [selected, ...others];
  };

  const sortedPlans = getSortedPlans();
  const containerHeight = Math.min(500, 320 + (sortedPlans.length - 1) * 12);

  const handleCardClick = (clickedIndex: number, planId: string) => {
    if (clickedIndex === 0 && sortedPlans.length > 1) {
      onSelectPlan(sortedPlans[1].id);
      return;
    }

    onSelectPlan(planId);
  };

  return (
    <div className="relative w-full" style={{ height: `${containerHeight}px` }}>
      <div className="relative h-full w-full">
        <AnimatePresence mode="popLayout">
          {sortedPlans.map((plan, index) => {
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                index={index}
                totalCards={sortedPlans.length}
                onClick={() => handleCardClick(index, plan.id)}
                onDelete={(e) => {
                  e.stopPropagation();
                  onDeletePlan(plan.id);
                }}
                isSelected={selectedPlanId === plan.id}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {sortedPlans.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/12 px-3 py-1 text-[10px] font-bold text-white/70 backdrop-blur-md"
        >
          {sortedPlans.length} 个计划 · 点击顶部卡片切换下一张
        </motion.div>
      )}
    </div>
  );
};