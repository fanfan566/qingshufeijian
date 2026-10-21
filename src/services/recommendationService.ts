// 推荐服务 - 管理健康推荐内容（支持第三 API）

export interface Recommendation {
  id: string;
  type: 'article' | 'video' | 'paper' | 'news';
  source: 'newsapi' | 'pubmed' | 'youtube' | 'fallback';
  title: string;
  summary: string;
  url: string; // 外部链接
  imageUrl?: string;
  publishDate: string;
  tags: string[];
  language: 'zh' | 'en';
}

export interface UserPreference {
  topics: string[];
  contentType: ('news' | 'paper' | 'video')[];
  language: 'zh' | 'en' | 'both';
}

class RecommendationService {
  // 从后端 API 获取推荐内容
  async getRecommendations(preference: UserPreference, limit: number = 10): Promise<Recommendation[]> {
    const topics = preference.topics.join(' ');
    const promises: Promise<Recommendation[]>[] = [];

    if (preference.contentType.includes('news')) {
      promises.push(this.fetchFromNewsAPI(topics, limit));
    }
    if (preference.contentType.includes('paper')) {
      promises.push(this.fetchFromPubMed(topics, limit));
    }
    if (preference.contentType.includes('video')) {
      promises.push(this.fetchFromYouTube(topics, limit));
    }

    const results = await Promise.allSettled(promises);
    const allRecommendations: Recommendation[] = [];

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        allRecommendations.push(...result.value);
      } else {
        console.error('获取推荐失败:', result.reason);
      }
    });

    // 按发布日期排序
    allRecommendations.sort((a, b) => 
      new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
    );

    return allRecommendations.slice(0, limit);
  }

  private async fetchFromNewsAPI(topics: string, limit: number): Promise<Recommendation[]> {
    try {
      const response = await fetch(`/api/recommendations/news?topics=${encodeURIComponent(topics)}&limit=${limit}`);
      const data = await response.json();
      
      if (!data.articles || data.articles.length === 0) {
        return [];
      }

      return data.articles.map((article: any, idx: number) => ({
        id: `news-${idx}-${Date.now()}`,
        type: 'news' as const,
        source: 'newsapi' as const,
        title: article.title,
        summary: article.description || article.title,
        url: article.url,
        imageUrl: article.urlToImage,
        publishDate: article.publishedAt,
        tags: ['健康资讯', article.source?.name || '新闻'].filter(Boolean),
        language: 'zh' as const,
      }));
    } catch (error) {
      console.error('NewsAPI 获取失败:', error);
      return [];
    }
  }

  private async fetchFromPubMed(topics: string, limit: number): Promise<Recommendation[]> {
    try {
      const response = await fetch(`/api/recommendations/pubmed?topics=${encodeURIComponent(topics)}&limit=${limit}`);
      const data = await response.json();
      
      const papers = data.result || {};
      const paperIds = Object.keys(papers).filter(id => id !== 'uids');
      
      if (paperIds.length === 0) {
        return [];
      }

      return paperIds.map((id: string, idx: number) => {
        const paper = papers[id];
        return {
          id: `pubmed-${id}`,
          type: 'paper' as const,
          source: 'pubmed' as const,
          title: paper.title || 'Untitled Paper',
          summary: paper.sorttitle || paper.title || 'Medical Research Paper',
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          imageUrl: `https://picsum.photos/seed/paper${idx}/400/300`,
          publishDate: paper.pubdate || new Date().toISOString(),
          tags: ['医学研究', 'PubMed'],
          language: 'en' as const,
        };
      });
    } catch (error) {
      console.error('PubMed 获取失败:', error);
      return [];
    }
  }

  private async fetchFromYouTube(topics: string, limit: number): Promise<Recommendation[]> {
    try {
      const response = await fetch(`/api/recommendations/youtube?topics=${encodeURIComponent(topics)}&limit=${limit}`);
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        return [];
      }

      return data.items.map((item: any, idx: number) => ({
        id: `youtube-${item.id?.videoId || idx}`,
        type: 'video' as const,
        source: 'youtube' as const,
        title: item.snippet?.title || 'Health Video',
        summary: item.snippet?.description || 'Health and wellness video content',
        url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
        imageUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
        publishDate: item.snippet?.publishedAt || new Date().toISOString(),
        tags: ['康复训练', '视频'],
        language: 'en' as const,
      }));
    } catch (error) {
      console.error('YouTube API 获取失败:', error);
      return [];
    }
  }

  // 后备推荐数据（当 API 不可用时）
  getFallbackRecommendations(): Recommendation[] {
    return [
      {
        id: 'fallback-1',
        type: 'news',
        source: 'fallback',
        title: '春季呼吸道防护指南：如何预防过敏和感染',
        summary: '春季是呼吸道疾病高发季节，专家建议外出佩戴口罩，保持室内湿度，定期通风，多喝水增强免疫力。',
        url: 'https://example.com/spring-respiratory-guide',
        imageUrl: 'https://picsum.photos/seed/spring-health/400/300',
        publishDate: new Date().toISOString(),
        tags: ['健康资讯', '呼吸道'],
        language: 'zh',
      },
      {
        id: 'fallback-2',
        type: 'paper',
        source: 'fallback',
        title: '新研究：腹式呼吸对肺功能的积极影响',
        summary: '最新医学研究表明，每日进行 10 分钟腹式呼吸训练，可显著提升肺活量和呼吸效率。',
        url: 'https://example.com/breathing-research',
        imageUrl: 'https://picsum.photos/seed/breathing-study/400/300',
        publishDate: new Date().toISOString(),
        tags: ['医学研究', '呼吸训练'],
        language: 'zh',
      },
      {
        id: 'fallback-3',
        type: 'video',
        source: 'fallback',
        title: '10 分钟基础腹式呼吸训练 | 增强肺活量',
        summary: '跟随专业指导师学习腹式呼吸技巧，每天 10 分钟，有效提升肺功能和呼吸效率。适合所有人群。',
        url: 'https://example.com/breathing-video',
        imageUrl: 'https://picsum.photos/seed/breathing-video/400/300',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', '视频'],
        language: 'zh',
      },
      {
        id: 'fallback-4',
        type: 'news',
        source: 'fallback',
        title: '肺部健康饮食：这 5 种食物最养肺',
        summary: '营养学家推荐苹果、鱼类、坚果、绿叶蔬菜和姜黄等食物，富含抗氧化剂和抗炎成分。',
        url: 'https://example.com/lung-healthy-foods',
        imageUrl: 'https://picsum.photos/seed/healthy-food/400/300',
        publishDate: new Date().toISOString(),
        tags: ['健康资讯', '饮食'],
        language: 'zh',
      },
      {
        id: 'fallback-5',
        type: 'paper',
        source: 'fallback',
        title: '慢性阻塞性肺病（COPD）的早期症状和预防',
        summary: 'COPD 早期症状不明显，定期检查肺功能很重要。戒烟、避免二手烟、接种疫苗是有效的预防措施。',
        url: 'https://example.com/copd-prevention',
        imageUrl: 'https://picsum.photos/seed/copd-awareness/400/300',
        publishDate: new Date().toISOString(),
        tags: ['医学研究', 'COPD'],
        language: 'zh',
      },
    ];
  }

  // 生成用户偏好（基于默认设置）
  getDefaultPreference(): UserPreference {
    return {
      topics: ['lung health', 'respiratory', 'breathing exercise'],
      contentType: ['news', 'paper', 'video'],
      language: 'both',
    };
  }
}

export const recommendationService = new RecommendationService();

// 用户偏好管理（localStorage）
const USER_PREF_STORAGE_KEY = 'user_recommendation_preference';

export function getUserPreference(userId: string): UserPreference {
  try {
    const saved = localStorage.getItem(`${USER_PREF_STORAGE_KEY}_${userId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('读取用户偏好失败:', error);
  }
  
  // 返回默认偏好
  return {
    topics: ['lung health', 'respiratory', 'breathing exercise'],
    contentType: ['news', 'paper', 'video'],
    language: 'both',
  };
}

export function saveUserPreference(userId: string, preference: UserPreference): void {
  try {
    localStorage.setItem(`${USER_PREF_STORAGE_KEY}_${userId}`, JSON.stringify(preference));
  } catch (error) {
    console.error('保存用户偏好失败:', error);
  }
}
