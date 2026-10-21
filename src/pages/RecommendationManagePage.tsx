import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  Save, 
  X, 
  Upload, 
  Video, 
  FileText, 
  BookOpen,
  Search,
  Filter
} from 'lucide-react';
import { recommendationService, Recommendation } from '../services/recommendationService';

export const RecommendationManagePage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRec, setEditingRec] = useState<Recommendation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = () => {
    const all = recommendationService.getAllRecommendations();
    setRecommendations(all);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这条推荐吗？')) {
      recommendationService.deleteRecommendation(id);
      loadRecommendations();
    }
  };

  const handleTogglePublish = (id: string) => {
    recommendationService.togglePublishStatus(id);
    loadRecommendations();
  };

  const handleEdit = (rec: Recommendation) => {
    setEditingRec(rec);
    setShowEditor(true);
  };

  const handleNew = () => {
    setEditingRec(null);
    setShowEditor(true);
  };

  const filteredRecommendations = recommendations.filter(rec => {
    const matchesSearch = rec.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rec.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || rec.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* 页面头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-800 mb-2">推荐内容管理</h1>
              <p className="text-slate-500 font-medium">管理个人中心的推荐内容</p>
            </div>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 bg-indigo-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-all"
            >
              <Plus size={20} />
              添加推荐
            </button>
          </div>
        </div>

        {/* 筛选和搜索 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-8">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="搜索推荐内容..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="pl-10 pr-8 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">全部类型</option>
                <option value="knowledge">知识图谱</option>
                <option value="training">康复训练</option>
                <option value="article">健康文章</option>
              </select>
            </div>
          </div>
        </div>

        {/* 推荐列表 */}
        <div className="grid gap-6">
          {filteredRecommendations.map((rec) => (
            <motion.div
              key={rec.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
            >
              <div className="flex gap-6">
                {/* 封面图 */}
                <div className="w-48 h-32 rounded-2xl overflow-hidden flex-shrink-0">
                  <img
                    src={rec.imageUrl}
                    alt={rec.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* 内容区域 */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          rec.type === 'knowledge' ? 'bg-blue-100 text-blue-600' :
                          rec.type === 'training' ? 'bg-green-100 text-green-600' :
                          'bg-purple-100 text-purple-600'
                        }`}>
                          {rec.type === 'knowledge' ? '知识图谱' :
                           rec.type === 'training' ? '康复训练' : '健康文章'}
                        </span>
                        {rec.duration && (
                          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                            <Video size={12} />
                            {rec.duration}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black text-slate-800 mb-1">{rec.title}</h3>
                      <p className="text-sm text-slate-500">{rec.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>浏览 {rec.viewCount || 0} 次</span>
                    <span>•</span>
                    <span>创建于 {new Date(rec.createdAt).toLocaleDateString('zh-CN')}</span>
                    <span>•</span>
                    <span className={rec.isPublished ? 'text-green-600' : 'text-slate-400'}>
                      {rec.isPublished ? '已发布' : '未发布'}
                    </span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => handleEdit(rec)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
                    >
                      <Edit size={14} />
                      编辑
                    </button>
                    <button
                      onClick={() => handleTogglePublish(rec.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                        rec.isPublished 
                          ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      {rec.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                      {rec.isPublished ? '下架' : '发布'}
                    </button>
                    <button
                      onClick={() => handleDelete(rec.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 编辑器弹窗 */}
      <AnimatePresence>
        {showEditor && (
          <RecommendationEditor
            recommendation={editingRec}
            onClose={() => setShowEditor(false)}
            onSave={() => {
              loadRecommendations();
              setShowEditor(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// 推荐内容编辑器组件
interface RecommendationEditorProps {
  recommendation: Recommendation | null;
  onClose: () => void;
  onSave: () => void;
}

const RecommendationEditor: React.FC<RecommendationEditorProps> = ({
  recommendation,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<Recommendation>({
    id: recommendation?.id || recommendationService.generateRecommendationId(),
    type: 'knowledge',
    title: '',
    description: '',
    imageUrl: '',
    content: '',
    videoUrl: '',
    duration: '',
    tags: [],
    viewCount: 0,
    createdAt: recommendation?.createdAt || new Date().toISOString(),
    isPublished: false,
    ...recommendation,
  });

  const handleSubmit = () => {
    recommendationService.saveRecommendation(formData);
    onSave();
  };

  return (
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
          className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto"
        >
          {/* 头部 */}
          <div className="sticky top-0 bg-white border-b border-slate-100 p-6 flex items-center justify-between rounded-t-3xl">
            <h2 className="text-2xl font-black text-slate-800">
              {recommendation ? '编辑推荐' : '添加推荐'}
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          {/* 表单内容 */}
          <div className="p-6 space-y-6">
            {/* 类型选择 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">推荐类型</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: 'knowledge', label: '知识图谱', icon: BookOpen },
                  { value: 'training', label: '康复训练', icon: Video },
                  { value: 'article', label: '健康文章', icon: FileText },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setFormData({ ...formData, type: type.value as any })}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                      formData.type === type.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <type.icon size={24} className={formData.type === type.value ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-sm font-bold">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 标题 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">标题</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
                placeholder="输入标题"
              />
            </div>

            {/* 描述 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">简介描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none resize-none"
                rows={3}
                placeholder="简要描述推荐内容"
              />
            </div>

            {/* 图片 URL */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">封面图片 URL</label>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
                  placeholder="https://..."
                />
                <button className="px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold transition-colors flex items-center gap-2">
                  <Upload size={18} />
                  上传
                </button>
              </div>
              {formData.imageUrl && (
                <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden">
                  <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* 视频 URL（仅训练类型） */}
            {formData.type === 'training' && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">视频链接</label>
                  <input
                    type="text"
                    value={formData.videoUrl || ''}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
                    placeholder="视频 URL（可选）"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">视频时长</label>
                  <input
                    type="text"
                    value={formData.duration || ''}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
                    placeholder="例如：10:25"
                  />
                </div>
              </>
            )}

            {/* 详细内容 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">详细内容（支持 HTML）</label>
              <textarea
                value={formData.content || ''}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none resize-none"
                rows={8}
                placeholder="输入详细内容，支持 HTML 格式"
              />
            </div>

            {/* 标签 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">标签（逗号分隔）</label>
              <input
                type="text"
                value={formData.tags.join(', ')}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()) })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-semibold focus:border-indigo-500 focus:outline-none"
                placeholder="例如：呼吸训练，肺活量，康复"
              />
            </div>

            {/* 发布状态 */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPublished"
                checked={formData.isPublished}
                onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="isPublished" className="text-sm font-bold text-slate-700">
                立即发布（用户可见）
              </label>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="sticky bottom-0 bg-white border-t border-slate-100 p-6 flex justify-end gap-3 rounded-b-3xl">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/30 transition-all"
            >
              <Save size={18} />
              保存推荐
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
};
