export interface PlanTask {
  id: string;
  title: string;
  description?: string;
  duration?: string; // 如 "15 分钟"
  completed: boolean;
  order: number;
}

export interface HealthPlan {
  id: string;
  name: string;
  description: string;
  period: number; // 周期（天）
  tasks: PlanTask[];
  createdAt: Date;
  startDate?: Date;
  status: 'draft' | 'active' | 'completed';
  color?: string; // 卡片颜色主题
}

export interface PlanStatistics {
  completedTasks: number;
  totalTasks: number;
  completionRate: number;
  consecutiveDays: number;
  aiScore: number;
}