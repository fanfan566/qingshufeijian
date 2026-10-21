// 用户服务 - 处理用户相关的 API 调用

const API_BASE_URL = '/api'; // 使用 Vite 代理

// 用户角色类型
export type UserRole = 'doctor' | 'patient' | 'student';

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  avatar?: string;
  membershipLevel?: 'free' | 'premium' | 'vip';
  bloodType?: string;
  height?: number;
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
  hasBasicDisease?: boolean;
  basicDiseases?: string[]; // 如：哮喘、冠心病等
  role?: UserRole; // 用户角色
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role?: UserRole; // 可选的角色，默认 patient
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
}

export interface UserProfile {
  age?: number;
  gender?: 'male' | 'female';
  hasBasicDisease?: boolean;
  basicDiseases?: string[];
}

class UserService {
  private token: string | null = null;
  private currentUser: Omit<User, 'password'> | null = null;

  constructor() {
    // 从 localStorage 恢复 token
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('current_user');
    if (savedToken && savedUser) {
      this.token = savedToken;
      this.currentUser = JSON.parse(savedUser);
    }
  }

  // 登录
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '登录失败');
    }

    const result = await response.json();
    this.token = result.token;
    this.currentUser = result.user;
    
    // 保存到 localStorage
    localStorage.setItem('auth_token', result.token);
    localStorage.setItem('current_user', JSON.stringify(result.user));

    return result;
  }

  // 注册
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '注册失败');
    }

    const result = await response.json();
    this.token = result.token;
    this.currentUser = result.user;
    
    // 保存到 localStorage
    localStorage.setItem('auth_token', result.token);
    localStorage.setItem('current_user', JSON.stringify(result.user));

    return result;
  }

  // 登出
  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
  }

  // 获取当前用户
  getCurrentUser(): Omit<User, 'password'> | null {
    return this.currentUser;
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    return !!this.token && !!this.currentUser;
  }

  // 获取用户画像
  getUserProfile(): UserProfile {
    const savedProfile = localStorage.getItem('user_profile');
    if (savedProfile) {
      return JSON.parse(savedProfile);
    }
    // 从当前用户获取基本信息
    return {
      age: this.currentUser?.age,
      gender: this.currentUser?.gender,
      hasBasicDisease: this.currentUser?.hasBasicDisease,
      basicDiseases: this.currentUser?.basicDiseases,
    };
  }

  // 保存用户画像
  saveUserProfile(profile: UserProfile) {
    localStorage.setItem('user_profile', JSON.stringify(profile));
    // 同步更新当前用户
    if (this.currentUser) {
      this.currentUser = {
        ...this.currentUser,
        ...profile,
      };
      localStorage.setItem('current_user', JSON.stringify(this.currentUser));
    }
  }

  // 更新用户资料
  updateProfile(profile: Partial<User>) {
    if (this.currentUser) {
      this.currentUser = {
        ...this.currentUser,
        ...profile,
      };
      localStorage.setItem('current_user', JSON.stringify(this.currentUser));
    }
  }

  // 获取所有用户（用于医生查看患者）
  getAllUsers(): User[] {
    try {
      const usersData = localStorage.getItem('users');
      if (!usersData) return [];
      return JSON.parse(usersData);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      return [];
    }
  }

  // 搜索用户（通过名称、UID等）
  async searchUsers(query: string, role?: UserRole): Promise<Omit<User, 'password'>[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(query)}${role ? `&role=${role}` : ''}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('搜索用户失败');
      }

      const result = await response.json();
      return result.users || [];
    } catch (error) {
      console.error('搜索用户失败:', error);
      // 如果API失败，回退到本地搜索
      return this.searchUsersLocally(query, role);
    }
  }

  // 本地搜索用户（备用）
  searchUsersLocally(query: string, role?: UserRole): Omit<User, 'password'>[] {
    const allUsers = this.getAllUsers();
    const lowerQuery = query.toLowerCase();

    return allUsers.filter(user => {
      const matchesQuery = 
        user.username.toLowerCase().includes(lowerQuery) ||
        user.id.toLowerCase().includes(lowerQuery) ||
        (user.email && user.email.toLowerCase().includes(lowerQuery));

      const matchesRole = !role || user.role === role;

      return matchesQuery && matchesRole;
    }).map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }
}

export const userService = new UserService();
