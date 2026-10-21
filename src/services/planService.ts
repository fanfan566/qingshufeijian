import { HealthPlan, PlanTask, PlanStatistics } from '../types/plan';
import { userService } from './userService';

type StoredHealthPlan = HealthPlan & {
  ownerId?: string;
};

class PlanService {
  private storageKey = 'health-plans';

  // 获取当前用户 ID
  private getCurrentOwnerId(): string | null {
    return userService.getCurrentUser()?.id || null;
  }

  // 获取所有原始计划
  private getStoredPlans(): StoredHealthPlan[] {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return [];

    const plans = JSON.parse(saved);
    // 恢复 Date 对象
    return plans.map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      startDate: p.startDate ? new Date(p.startDate) : undefined,
    }));
  }

  // 保存所有原始计划
  private saveStoredPlans(plans: StoredHealthPlan[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(plans));
  }

  // 获取所有计划
  getAllPlans(): HealthPlan[] {
    const ownerId = this.getCurrentOwnerId();
    if (!ownerId) return [];

    return this.getStoredPlans().filter(plan => plan.ownerId === ownerId);
  }

  // 保存计划
  savePlan(plan: HealthPlan): void {
    const ownerId = this.getCurrentOwnerId();
    if (!ownerId) return;

    const plans = this.getStoredPlans();
    const index = plans.findIndex(p => p.id === plan.id && p.ownerId === ownerId);
    const planWithOwner: StoredHealthPlan = {
      ...plan,
      ownerId,
    };

    if (index >= 0) {
      plans[index] = planWithOwner;
    } else {
      plans.push(planWithOwner);
    }

    this.saveStoredPlans(plans);
  }

  // 删除计划
  deletePlan(planId: string): void {
    const ownerId = this.getCurrentOwnerId();
    if (!ownerId) return;

    const plans = this.getStoredPlans();
    const filtered = plans.filter(p => !(p.id === planId && p.ownerId === ownerId));
    this.saveStoredPlans(filtered);
  }

  // 更新任务状态
  toggleTaskCompletion(planId: string, taskId: string): HealthPlan | null {
    const ownerId = this.getCurrentOwnerId();
    if (!ownerId) return null;

    const plans = this.getStoredPlans();
    const plan = plans.find(p => p.id === planId && p.ownerId === ownerId);

    if (!plan) return null;

    const task = plan.tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      this.savePlan(plan);
      return plan;
    }

    return null;
  }

  // 更新计划顺序
  reorderPlans(planIds: string[]): void {
    const ownerId = this.getCurrentOwnerId();
    if (!ownerId) return;

    const plans = this.getStoredPlans();
    const currentUserPlans = plans.filter(p => p.ownerId === ownerId);
    const otherPlans = plans.filter(p => p.ownerId !== ownerId);
    const reordered: StoredHealthPlan[] = [];

    planIds.forEach(id => {
      const plan = currentUserPlans.find(p => p.id === id);
      if (plan) reordered.push(plan);
    });

    currentUserPlans.forEach(plan => {
      if (!reordered.some(item => item.id === plan.id)) {
        reordered.push(plan);
      }
    });

    this.saveStoredPlans([...otherPlans, ...reordered]);
  }

  // 计算计划统计
  calculateStatistics(plan: HealthPlan): PlanStatistics {
    const totalTasks = plan.tasks.length;
    const completedTasks = plan.tasks.filter(t => t.completed).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 计算连续天数（简化版本）
    const consecutiveDays = plan.startDate ?
      Math.floor((Date.now() - new Date(plan.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // 评估得分（满分 100，任务全部完成时直接满分；未完成时以完成率为主并结合连续天数小幅加分）
    const aiScore = completionRate >= 100
      ? 100
      : Math.min(99, Math.max(0, Math.round(completionRate + Math.min(consecutiveDays, 10) * 0.5)));

    return {
      completedTasks,
      totalTasks,
      completionRate,
      consecutiveDays,
      aiScore,
    };
  }

  // 生成计划 ID
  generatePlanId(): string {
    return 'plan_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // 生成任务 ID
  generateTaskId(): string {
    return 'task_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

export const planService = new PlanService();
