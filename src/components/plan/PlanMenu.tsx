import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoreVertical, Trash2 } from 'lucide-react';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface PlanMenuProps {
  planName: string;
  onDelete: () => void;
}

export const PlanMenu: React.FC<PlanMenuProps> = ({ planName, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <>
      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors"
        >
          <MoreVertical size={16} className="text-white" />
        </motion.button>

        {/* 删除确认菜单 */}
        <AnimatePresence>
          {showMenu && (
            <>
              {/* 背景遮罩 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMenu(false)}
                className="fixed inset-0 z-40"
              />
              
              {/* 菜单弹窗 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl z-50 overflow-hidden"
                style={{
                  boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15)"
                }}
              >
                {/* 菜单头部 */}
                <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-700">计划管理</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{planName}</p>
                </div>
                
                {/* 菜单选项 */}
                <div className="p-2">
                  <motion.button
                    whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group"
                  >
                    <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center group-hover:bg-red-100 transition-colors">
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

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => {
          onDelete();
          setShowDeleteModal(false);
        }}
        planName={planName}
      />
    </>
  );
};
