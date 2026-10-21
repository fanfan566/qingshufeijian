import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, Calendar, TrendingUp, Award, CheckCircle, Circle, 
  MoreVertical, Sparkles, ChevronRight, Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { HealthPlan } from '../../types/plan';
import { planService } from '../../services/planService';

interface PlanDetailProps {
  plan: HealthPlan;
  onToggleTask: (taskId: string) => void;
  onDeletePlan?: () => void;
}

export const PlanDetail: React.FC<PlanDetailProps> = ({ plan, onToggleTask, onDeletePlan }) => {
  const stats = planService.calculateStatistics(plan);
  const remainingDays = plan.startDate 
    ? Math.max(0, plan.period - Math.floor((Date.now() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)))
    : plan.period;
  const [showMenu, setShowMenu] = React.useState(false);

  // 按完成状态和顺序排序任务
  const sortedTasks = [...plan.tasks].sort((a, b) => {
    // 已完成的排后面
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.order - b.order;
  });

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
      {/* 头部 */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-night-royal to-night-sky rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Heart size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-night-deep">{plan.name}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  <Calendar size={12} />
                  创建于 {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
                </span>
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  <Activity size={12} />
                  预计剩余 {remainingDays} 天
                </span>
              </div>
            </div>
          </div>
          <button className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:text-night-royal transition-all">
            <MoreVertical size={18} />
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-400 mb-2">已完成任务</div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-night-deep">{stats.completedTasks}</span>
              <span className="text-sm font-bold text-slate-400">/ {stats.totalTasks}</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-400 mb-2">当前连续天数</div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-night-deep">{stats.consecutiveDays}</span>
              <span className="text-sm font-bold text-slate-400">Days</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-4">
            <div className="text-xs font-bold text-emerald-600 mb-2">评估得分</div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-emerald-600">{stats.aiScore}</span>
              <span className="text-sm font-bold text-emerald-400">/ 100</span>
            </div>
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">今日任务清单</h3>
          <div className="text-xs font-bold text-slate-400">
            {stats.completedTasks} / {stats.totalTasks} 已完成
          </div>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {sortedTasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  scale: task.completed ? 0.98 : 1,
                }}
                transition={{ 
                  delay: index * 0.05,
                  type: "spring",
                  stiffness: 300,
                  damping: 25
                }}
                onClick={() => onToggleTask(task.id)}
                className={cn(
                  "relative p-4 rounded-2xl border-2 cursor-pointer transition-all group",
                  task.completed
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-white border-slate-100 hover:border-night-royal/30 hover:shadow-md"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    task.completed
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-100 text-slate-400 group-hover:bg-night-royal/10 group-hover:text-night-royal"
                  )}>
                    {task.completed ? <CheckCircle size={20} /> : <Circle size={20} />}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-bold transition-all",
                        task.completed
                          ? "text-emerald-600 line-through"
                          : "text-night-deep"
                      )}>
                        {task.title}
                      </span>
                      {task.duration && (
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          task.completed
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                        )}>
                          {task.duration}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className={cn(
                        "text-xs mt-1 transition-all",
                        task.completed ? "text-emerald-400" : "text-slate-400"
                      )}>
                        {task.description}
                      </p>
                    )}
                  </div>

                  <ChevronRight 
                    size={18} 
                    className={cn(
                      "transition-all",
                      task.completed ? "text-emerald-400" : "text-slate-300"
                    )} 
                  />
                </div>

                {/* 完成动画 */}
                {task.completed && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute inset-0 pointer-events-none"
                  >
                    <div className="absolute top-4 right-4 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                      <CheckCircle size={16} className="text-white" />
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* AI 提示 */}
        <div className="mt-6 p-4 bg-gradient-to-r from-night-royal/5 to-night-sky/5 rounded-2xl border border-night-royal/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-night-royal to-night-sky rounded-xl flex items-center justify-center text-white">
              <Sparkles size={18} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-night-deep">
                AI 助手已根据您的最新 CT 报告优化了今日训练强度
              </p>
            </div>
            <button className="text-xs font-bold text-night-royal hover:underline flex items-center gap-1">
              查看分析详情
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
