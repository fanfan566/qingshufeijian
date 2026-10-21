import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Calendar, FileText, Heart, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PlanTaskInput {
  id: string;
  title: string;
  description: string;
  duration: string;
}

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (plan: {
    name: string;
    description: string;
    period: number;
    color: string;
    tasks: PlanTaskInput[];
  }) => void;
}

const COLORS = [
  { key: 'blue', name: '奶霜蓝', from: 'from-sky-300', to: 'to-blue-400' },
  { key: 'mint', name: '薄荷绿', from: 'from-emerald-200', to: 'to-teal-300' },
  { key: 'peach', name: '蜜桃橙', from: 'from-orange-200', to: 'to-amber-300' },
  { key: 'lavender', name: '薰衣草紫', from: 'from-violet-200', to: 'to-fuchsia-300' },
  { key: 'rose', name: '奶油粉', from: 'from-pink-200', to: 'to-rose-300' },
];

export const CreatePlanModal: React.FC<CreatePlanModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planPeriod, setPlanPeriod] = useState(7);
  const [tasks, setTasks] = useState<PlanTaskInput[]>([
    { id: '1', title: '', description: '', duration: '' },
    { id: '2', title: '', description: '', duration: '' },
    { id: '3', title: '', description: '', duration: '' },
  ]);
  const [selectedColor, setSelectedColor] = useState(0);
  const [isCreated, setIsCreated] = useState(false);

  const addTask = () => {
    setTasks([
      ...tasks,
      { id: Date.now().toString(), title: '', description: '', duration: '' },
    ]);
  };

  const removeTask = (id: string) => {
    if (tasks.length <= 1) return;
    setTasks(tasks.filter(t => t.id !== id));
  };

  const updateTask = (id: string, field: keyof PlanTaskInput, value: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleCreate = () => {
    // 过滤空任务
    const validTasks = tasks.filter(t => t.title.trim());
    if (!planName.trim() || validTasks.length === 0) return;

    onCreate({
      name: planName,
      description: planDescription,
      period: planPeriod,
      color: COLORS[selectedColor].key,
      tasks: validTasks,
    });

    setIsCreated(true);
    setTimeout(() => {
      setPlanName('');
      setPlanDescription('');
      setPlanPeriod(7);
      setTasks([
        { id: '1', title: '', description: '', duration: '' },
        { id: '2', title: '', description: '', duration: '' },
        { id: '3', title: '', description: '', duration: '' },
      ]);
      setIsCreated(false);
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50"
          >
            <div className="soft-card bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-night-royal to-night-sky rounded-xl flex items-center justify-center text-white">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-night-deep">创建健康计划</h3>
                    <p className="text-xs font-bold text-slate-400">定制您的专属健康管理方案</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 hover:text-night-royal transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {isCreated ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-16 flex flex-col items-center justify-center"
                >
                  <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-6 animate-bounce">
                    <Check size={40} />
                  </div>
                  <p className="text-xl font-black text-night-deep">计划创建成功！</p>
                  <p className="text-sm font-bold text-slate-400 mt-2">开始您的健康管理之旅吧</p>
                </motion.div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* 基本信息 */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <FileText size={14} />
                          计划名称
                        </label>
                        <input
                          type="text"
                          value={planName}
                          onChange={(e) => setPlanName(e.target.value)}
                          placeholder="如：术后康复计划"
                          className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-night-royal focus:ring-0 text-sm font-bold text-night-deep placeholder:text-slate-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Calendar size={14} />
                          计划周期
                        </label>
                        <select
                          value={planPeriod}
                          onChange={(e) => setPlanPeriod(Number(e.target.value))}
                          className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-night-royal focus:ring-0 text-sm font-bold text-night-deep"
                        >
                          <option value={7}>7 天</option>
                          <option value={14}>14 天</option>
                          <option value={21}>21 天</option>
                          <option value={30}>30 天</option>
                          <option value={60}>60 天</option>
                          <option value={90}>90 天</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Heart size={14} />
                        计划描述
                      </label>
                      <textarea
                        value={planDescription}
                        onChange={(e) => setPlanDescription(e.target.value)}
                        placeholder="简要描述这个计划的目标和内容..."
                        className="w-full h-20 px-4 py-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-night-royal focus:ring-0 text-sm font-medium text-night-deep placeholder:text-slate-400 resize-none"
                      />
                    </div>
                  </div>

                  {/* 颜色主题选择 */}
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">卡片颜色</label>
                    <div className="flex gap-3">
                      {COLORS.map((color, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedColor(index)}
                          className={cn(
                            "w-12 h-12 rounded-xl bg-gradient-to-br transition-all shadow-sm",
                            color.from,
                            color.to,
                            selectedColor === index
                              ? "ring-4 ring-offset-2 ring-night-royal/30 scale-110"
                              : "hover:scale-105"
                          )}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 任务列表 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        计划任务
                      </label>
                      <button
                        onClick={addTask}
                        className="text-xs font-bold text-night-royal flex items-center gap-1 hover:underline"
                      >
                        <Plus size={14} />
                        添加任务
                      </button>
                    </div>

                    <div className="space-y-3">
                      {tasks.map((task, index) => (
                        <motion.div
                          key={task.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-slate-50 rounded-2xl p-4 space-y-3 relative group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-night-royal/10 rounded-full flex items-center justify-center text-night-royal text-xs font-black">
                              {index + 1}
                            </div>
                            <input
                              type="text"
                              value={task.title}
                              onChange={(e) => updateTask(task.id, 'title', e.target.value)}
                              placeholder="任务名称（如：深呼吸练习）"
                              className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-night-deep placeholder:text-slate-400"
                            />
                            {tasks.length > 1 && (
                              <button
                                onClick={() => removeTask(task.id)}
                                className="text-slate-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-3 pl-9">
                            <input
                              type="text"
                              value={task.description}
                              onChange={(e) => updateTask(task.id, 'description', e.target.value)}
                              placeholder="任务描述（可选）"
                              className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-medium text-slate-600 placeholder:text-slate-400"
                            />
                            <input
                              type="text"
                              value={task.duration}
                              onChange={(e) => updateTask(task.id, 'duration', e.target.value)}
                              placeholder="时长（如：15 分钟）"
                              className="w-32 bg-transparent border-none focus:ring-0 text-xs font-medium text-slate-600 placeholder:text-slate-400"
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleCreate}
                    disabled={!planName.trim() || tasks.filter(t => t.title.trim()).length === 0}
                    className={cn(
                      "w-full py-4 rounded-2xl font-black text-white transition-all",
                      !planName.trim() || tasks.filter(t => t.title.trim()).length === 0
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : `bg-gradient-to-r ${COLORS[selectedColor].from} ${COLORS[selectedColor].to} hover:scale-[1.02] shadow-lg`
                    )}
                  >
                    创建计划
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
