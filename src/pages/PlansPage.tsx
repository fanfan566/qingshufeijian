import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Calendar, Heart, Activity } from 'lucide-react';
import { HealthPlan } from '../types/plan';
import { planService } from '../services/planService';
import { CreatePlanModal, PlanCardsStack, PlanDetail, DeleteConfirmModal } from '../components/plan';

export const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);

  // 加载计划
  useEffect(() => {
    const loadedPlans = planService.getAllPlans();
    setPlans(loadedPlans);
    if (loadedPlans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(loadedPlans[0].id);
    }
  }, []);

  // 创建计划
  const handleCreatePlan = (planData: {
    name: string;
    description: string;
    period: number;
    color: string;
    tasks: Array<{ id: string; title: string; description: string; duration: string }>;
  }) => {
    const newPlan: HealthPlan = {
      id: planService.generatePlanId(),
      name: planData.name,
      description: planData.description,
      period: planData.period,
      tasks: planData.tasks.map((t, index) => ({
        id: planService.generateTaskId(),
        title: t.title,
        description: t.description,
        duration: t.duration,
        completed: false,
        order: index,
      })),
      createdAt: new Date(),
      startDate: new Date(),
      status: 'active',
      color: planData.color,
    };

    planService.savePlan(newPlan);
    const updatedPlans = planService.getAllPlans();
    setPlans(updatedPlans);
    setSelectedPlanId(newPlan.id);
  };

  // 切换任务状态
  const handleToggleTask = (taskId: string) => {
    if (!selectedPlanId) return;

    const updatedPlan = planService.toggleTaskCompletion(selectedPlanId, taskId);
    if (updatedPlan) {
      setPlans(planService.getAllPlans());
    }
  };

  // 选择计划
  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
  };

  // 删除计划 - 显示确认弹窗
  const handleRequestDelete = (planId: string) => {
    setPlanToDelete(planId);
    setShowDeleteModal(true);
  };

  // 确认删除
  const handleConfirmDelete = () => {
    if (!planToDelete) return;
    
    planService.deletePlan(planToDelete);
    const updatedPlans = planService.getAllPlans();
    setPlans(updatedPlans);
    
    if (selectedPlanId === planToDelete) {
      setSelectedPlanId(updatedPlans.length > 0 ? updatedPlans[0].id : null);
    }
    
    setPlanToDelete(null);
    setShowDeleteModal(false);
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const deletingPlan = plans.find(p => p.id === planToDelete);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-[36px] border border-white/20 bg-white/8 p-6 shadow-[0_30px_80px_rgba(56,28,140,0.18)] backdrop-blur-2xl sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(232,147,197,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))]" />
          <div className="pointer-events-none absolute -left-20 top-10 h-44 w-44 rounded-full bg-night-sky/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-night-pink/20 blur-3xl" />

          <div className="relative z-10 mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/14 px-4 py-1.5 text-[10px] font-black tracking-[0.24em] text-night-sky uppercase shadow-[0_10px_30px_rgba(55,133,216,0.15)] backdrop-blur-md mb-4">
                <Activity size={14} />
                <span>健康管理计划</span>
              </div>
              <h1 className="text-3xl font-black text-white drop-shadow-[0_8px_30px_rgba(30,15,117,0.28)] sm:text-4xl">
                健康管理计划
              </h1>
              <p className="mt-3 max-w-xl text-sm font-medium leading-7 text-slate-100/80 sm:text-base">
                根据您的身体状况与 AI 分析结果，为您量身定制的肺部健康方案。
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs font-black text-white/90 backdrop-blur-md">
                <Calendar size={14} className="text-night-pale" />
                进行中的计划 {plans.filter(p => p.status === 'active').length} 个
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-gradient-to-r from-night-royal via-night-sky to-night-lavender px-6 py-4 font-black text-white shadow-[0_18px_40px_rgba(55,133,216,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(55,133,216,0.35)]"
              >
                <Plus size={20} />
                创建新计划
              </button>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)]">
            <div className="rounded-[32px] border border-white/20 bg-white/12 p-5 shadow-[0_25px_70px_rgba(18,18,56,0.18)] backdrop-blur-2xl sm:p-6 min-h-[600px]">
              <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-lg font-black text-white">
                  <Heart size={20} className="text-night-pink" />
                  我的计划
                </h2>
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/70">
                  Premium Dashboard
                </div>
              </div>

              <PlanCardsStack
                plans={plans}
                selectedPlanId={selectedPlanId}
                onSelectPlan={handleSelectPlan}
                onDeletePlan={handleRequestDelete}
              />
            </div>

            <div>
              <AnimatePresence mode="wait">
                {selectedPlan ? (
                  <motion.div
                    key={selectedPlan.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-[32px]"
                  >
                    <PlanDetail
                      plan={selectedPlan}
                      onToggleTask={handleToggleTask}
                      onDeletePlan={() => handleRequestDelete(selectedPlan.id)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex min-h-[600px] flex-col items-center justify-center rounded-[32px] border border-white/20 bg-white/12 p-16 text-center shadow-[0_25px_70px_rgba(18,18,56,0.16)] backdrop-blur-2xl"
                  >
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-white/16 shadow-[0_15px_35px_rgba(255,255,255,0.12)]">
                      <Calendar size={40} className="text-white/65" />
                    </div>
                    <h3 className="mb-2 text-xl font-black text-white">
                      暂无计划详情
                    </h3>
                    <p className="mb-6 max-w-sm text-sm font-medium leading-7 text-white/70">
                      从左侧选择一个计划或创建新计划
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-night-royal to-night-sky px-6 py-3 font-bold text-white shadow-[0_16px_35px_rgba(55,133,216,0.28)] transition-all hover:-translate-y-0.5"
                    >
                      <Plus size={18} />
                      创建第一个计划
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* 创建计划弹窗 */}
      <CreatePlanModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreatePlan}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setPlanToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        planName={deletingPlan?.name || '该计划'}
      />
    </div>
  );
};
