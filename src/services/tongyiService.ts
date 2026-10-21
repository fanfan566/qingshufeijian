import axios from 'axios';
import { UserProfile } from './userService';

// 使用相对路径，让 Vite dev server / cpolar / 生产环境统一通过当前站点转发
const API_URL = '/api/chat';

export const callTongyiAPI = async (
  message: string,
  history?: Array<{ role: string; content: string }>,
  userProfile?: UserProfile
): Promise<string> => {
  try {
    const response = await axios.post(
      API_URL,
      {
        message,
        history,
        userProfile,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.text || '抱歉，我暂时无法回答这个问题。';
  } catch (error) {
    console.error('调用阿里通义 API 时出错:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || error.message || '网络请求失败');
    }
    throw error;
  }
};
