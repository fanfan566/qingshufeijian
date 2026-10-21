import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Activity, Heart, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { userService, UserProfile } from '../services/userService';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (profile: UserProfile) => void;
}

const COMMON_DISEASES = [
  '哮喘',
  '冠心病',
  '高血压',
  '糖尿病',
  '慢性阻塞性肺病',
  '支气管炎',
  '肺结节',
  '其他'
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, onSave }) => {
  const [profile, setProfile] = useState<UserProfile>({
    age: undefined,
    gender: undefined,
    hasBasicDisease: false,
    basicDiseases: []
  });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const savedProfile = userService.getUserProfile();
      setProfile(savedProfile);
      setIsSaved(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    userService.saveUserProfile(profile);
    setIsSaved(true);
    setTimeout(() => {
      if (onSave) onSave(profile);
      onClose();
    }, 1500);
  };

  const toggleDisease = (disease: string) => {
    setProfile(prev => ({
      ...prev,
      basicDiseases: prev.basicDiseases?.includes(disease)
        ? prev.basicDiseases.filter(d => d !== disease)
        : [...(prev.basicDiseases || []), disease]
    }));
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
          >
            <div className="soft-card bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-night-royal to-night-sky rounded-xl flex items-center justify-center text-white">
                    <User size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-night-deep">健康档案</h3>
                    <p className="text-xs font-bold text-slate-400">完善信息以获得更精准的建议</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 hover:text-night-royal transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {isSaved ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-12 flex flex-col items-center justify-center"
                >
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-4">
                    <Check size={32} />
                  </div>
                  <p className="text-lg font-black text-night-deep">保存成功！</p>
                  <p className="text-sm font-bold text-slate-400 mt-2">AI 将根据您的信息提供个性化建议</p>
                </motion.div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* 基本信息 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-night-deep font-black">
                      <User size={18} className="text-night-royal" />
                      <span className="text-sm">基本信息</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">年龄</label>
                        <input
                          type="number"
                          value={profile.age || ''}
                          onChange={(e) => setProfile({ ...profile, age: parseInt(e.target.value) || undefined })}
                          placeholder="岁"
                          className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-night-royal focus:ring-0 text-sm font-bold text-night-deep placeholder:text-slate-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">性别</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setProfile({ ...profile, gender: 'male' })}
                            className={cn(
                              "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                              profile.gender === 'male'
                                ? "bg-blue-50 text-blue-600 border-2 border-blue-200"
                                : "bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100"
                            )}
                          >
                            男
                          </button>
                          <button
                            onClick={() => setProfile({ ...profile, gender: 'female' })}
                            className={cn(
                              "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                              profile.gender === 'female'
                                ? "bg-pink-50 text-pink-600 border-2 border-pink-200"
                                : "bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100"
                            )}
                          >
                            女
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 基础疾病 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-night-deep font-black">
                      <Heart size={18} className="text-night-pink" />
                      <span className="text-sm">基础疾病</span>
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={profile.hasBasicDisease}
                          onChange={(e) => setProfile({ ...profile, hasBasicDisease: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-night-royal focus:ring-night-royal"
                        />
                        <span className="text-sm font-bold text-slate-600">我有以下基础疾病</span>
                      </label>

                      {profile.hasBasicDisease && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="grid grid-cols-2 gap-2"
                        >
                          {COMMON_DISEASES.map((disease) => (
                            <button
                              key={disease}
                              onClick={() => toggleDisease(disease)}
                              className={cn(
                                "px-4 py-3 rounded-xl text-sm font-bold transition-all text-left",
                                profile.basicDiseases?.includes(disease)
                                  ? "bg-night-royal text-white shadow-md shadow-night-royal/20"
                                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              {disease}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleSave}
                    className="w-full py-4 bg-gradient-to-r from-night-royal to-night-sky text-white rounded-2xl font-black shadow-lg shadow-night-royal/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                  >
                    <Activity size={20} />
                    保存健康档案
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
