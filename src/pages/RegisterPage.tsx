import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, UserPlus, Stethoscope, User as UserIcon, GraduationCap } from 'lucide-react';
import { userService, UserRole } from '../services/userService';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'patient' as UserRole, // 默认患者角色
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 角色选项
  const roles: { value: UserRole; label: string; icon: any; color: string; desc: string }[] = [
    { 
      value: 'doctor', 
      label: '医生', 
      icon: Stethoscope,
      color: 'from-emerald-500 to-teal-500',
      desc: '管理患者健康数据'
    },
    { 
      value: 'patient', 
      label: '患者', 
      icon: UserIcon,
      color: 'from-indigo-500 to-purple-500',
      desc: '个人健康管理'
    },
    { 
      value: 'student', 
      label: '学生', 
      icon: GraduationCap,
      color: 'from-amber-500 to-orange-500',
      desc: '学习肺功能知识'
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证密码匹配
    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    // 验证密码长度
    if (formData.password.length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }

    setLoading(true);
    console.log('注册信息:', formData); // 调试日志

    try {
      const result = await userService.register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });
      console.log('注册成功，返回的用户信息:', result.user); // 调试日志
      window.location.href = '/';
    } catch (err: any) {
      console.error('注册失败:', err); // 调试日志
      setError(err.message || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 p-4">
      <div className="w-full max-w-md">
        {/* 注册卡片 */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8">
          {/* Logo 和标题 */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <UserPlus size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-gray-800 mb-2">注册账号</h1>
            <p className="text-gray-500 font-medium">创建新账号，开始健康管理</p>
          </div>

          {/* 注册表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户名输入 */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <User size={20} />
              </div>
              <input
                type="text"
                placeholder="用户名"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-700 font-semibold focus:border-purple-500 focus:outline-none transition-all"
                required
              />
            </div>

            {/* 邮箱输入 */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Mail size={20} />
              </div>
              <input
                type="email"
                placeholder="电子邮箱"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-700 font-semibold focus:border-purple-500 focus:outline-none transition-all"
                required
              />
            </div>

            {/* 密码输入 */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={20} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="密码（至少 6 位）"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-12 pr-12 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-700 font-semibold focus:border-purple-500 focus:outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-all"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* 确认密码输入 */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={20} />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="确认密码"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full pl-12 pr-12 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-gray-700 font-semibold focus:border-purple-500 focus:outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-all"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* 角色选择 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">选择您的身份</label>
              <div className="grid grid-cols-3 gap-3">
                {roles.map((roleOption) => {
                  const Icon = roleOption.icon;
                  const isSelected = formData.role === roleOption.value;
                  return (
                    <button
                      key={roleOption.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: roleOption.value })}
                      className={`relative p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                        isSelected
                          ? `border-${roleOption.color.split(' ')[0].replace('from-', '')} bg-gradient-to-br ${roleOption.color} text-white shadow-lg`
                          : 'border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      <Icon size={28} className={isSelected ? 'text-white' : 'text-gray-400'} />
                      <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                        {roleOption.label}
                      </span>
                      <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-500'} text-center`}>
                        {roleOption.desc}
                      </span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {/* 注册按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-2xl font-bold text-lg hover:from-purple-600 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <UserPlus size={20} />
              {loading ? '注册中...' : '注册'}
            </button>

            {/* 登录链接 */}
            <div className="text-center">
              <p className="text-gray-500 font-medium">
                已有账号？{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-purple-600 font-bold hover:text-purple-700 transition-all"
                >
                  立即登录
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
