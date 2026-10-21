import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  planName: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  planName,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* 弹窗主体 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 pointer-events-auto overflow-hidden"
              style={{
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)"
              }}
            >
              {/* 顶部装饰条 */}
              <div className="h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
              
              {/* 内容区域 */}
              <div className="p-6">
                {/* 关闭按钮 */}
                <div className="flex justify-end mb-4">
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
                  >
                    <X size={18} className="text-slate-500" />
                  </motion.button>
                </div>

                {/* 图标和标题 */}
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.1 }}
                    className="w-16 h-16 bg-gradient-to-br from-red-100 to-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
                  >
                    <AlertTriangle size={32} className="text-red-500" />
                  </motion.div>
                  
                  <h3 className="text-xl font-black text-slate-800 mb-2">
                    确认删除计划
                  </h3>
                  <p className="text-sm text-slate-500 font-medium">
                    您即将删除计划
                  </p>
                  <p className="text-base font-bold text-red-500 mt-1">
                    "{planName}"
                  </p>
                </div>

                {/* 警告信息 */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-6"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Trash2 size={16} className="text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-700 mb-1">
                        此操作不可撤销
                      </p>
                      <p className="text-xs text-red-600 font-medium leading-relaxed">
                        删除后，该计划的所有数据（包括任务进度、完成记录等）都将被永久删除，无法恢复。
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* 操作按钮 */}
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
                  >
                    取消
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(239, 68, 68, 0.95)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onConfirm();
                      onClose();
                    }}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30 transition-all"
                  >
                    确认删除
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
