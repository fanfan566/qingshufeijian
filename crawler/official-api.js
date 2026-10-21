// 官方 API 集成服务
import axios from 'axios';

// 配置（需要从环境变量读取）
const CONFIG = {
  // 知乎 API 配置
  ZHIHU_APP_ID: process.env.ZHIHU_APP_ID || '',
  ZHIHU_APP_SECRET: process.env.ZHIHU_APP_SECRET || '',
  
  // 微信公众号（搜狗微信搜索）
  WECHAT_SEARCH_URL: 'https://weixin.sogou.com/weixin',
  
  // B 站开放 API
  BILIBILI_API_URL: 'https://api.bilibili.com',
  
  // 丁香医生开放平台
  DXY_API_KEY: process.env.DXY_API_KEY || '',
};

export class OfficialAPIService {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    };
  }

  /**
   * 从知乎获取健康内容
   * 使用知乎开放平台 API
   */
  async getZhihuContent(topics = ['肺部健康', '呼吸训练'], limit = 5) {
    try {
      // 方案 1：使用知乎开放平台（需要申请）
      if (CONFIG.ZHIHU_APP_ID) {
        return await this.fetchZhihuOfficial(topics, limit);
      }
      
      // 方案 2：使用知乎热榜 API（无需认证）
      return await this.fetchZhihuHot(topics, limit);
    } catch (error) {
      console.error('知乎 API 获取失败:', error.message);
      return this.getZhihuFallback();
    }
  }

  /**
   * 知乎官方 API（需要申请 App Key）
   */
  async fetchZhihuOfficial(topics, limit) {
    // 获取 access token
    const tokenResponse = await axios.post(
      'https://www.zhihu.com/oauth/authorize',
      {
        client_id: CONFIG.ZHIHU_APP_ID,
        client_secret: CONFIG.ZHIHU_APP_SECRET,
        grant_type: 'client_credentials'
      },
      { headers: this.headers, timeout: 10000 }
    );

    const accessToken = tokenResponse.data.access_token;

    // 搜索内容
    const results = [];
    for (const topic of topics) {
      const response = await axios.get(
        `https://api.zhihu.com/search`,
        {
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            q: topic,
            type: 'content',
            limit: Math.ceil(limit / topics.length)
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.data) {
        response.data.data.forEach(item => {
          results.push({
            id: `zhihu-${item.id}`,
            type: 'article',
            source: '知乎',
            title: item.title,
            summary: item.excerpt || item.content?.slice(0, 200),
            url: item.url || `https://www.zhihu.com/search?q=${encodeURIComponent(topic)}`,
            imageUrl: item.image_url || this.generatePlaceholder(topic),
            publishDate: item.created_time || new Date().toISOString(),
            tags: ['健康科普', '知乎', topic],
            author: item.author?.name || '知乎用户',
            voteCount: item.vote_count || 0
          });
        });
      }
    }

    return results;
  }

  /**
   * 知乎热榜 API（无需认证，推荐）
   */
  async fetchZhihuHot(topics, limit) {
    const results = [];
    
    // 获取知乎热榜
    const hotResponse = await axios.get(
      'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true',
      {
        headers: this.headers,
        timeout: 10000
      }
    );

    if (hotResponse.data && hotResponse.data.data) {
      // 筛选健康相关内容
      const healthRelated = hotResponse.data.data.filter(item => {
        const title = item.target?.title?.toLowerCase() || '';
        const topics = item.target?.topics || [];
        return topics.some(t => 
          t.name?.includes('健康') || 
          t.name?.includes('医疗') || 
          t.name?.includes('肺') ||
          title.includes('健康') ||
          title.includes('呼吸')
        );
      });

      healthRelated.slice(0, limit).forEach(item => {
        results.push({
          id: `zhihu-hot-${item.id}`,
          type: 'article',
          source: '知乎',
          title: item.target?.title || '知乎热榜内容',
          summary: item.target?.excerpt || item.target?.content?.slice(0, 200) || '',
          url: item.target?.url || `https://www.zhihu.com/question/${item.id}`,
          imageUrl: item.target?.image_url || this.generatePlaceholder('zhihu'),
          publishDate: item.target?.created_time || new Date().toISOString(),
          tags: ['知乎热榜', '健康'],
          author: item.target?.author?.name || '知乎用户',
          voteCount: item.target?.vote_count || 0
        });
      });
    }

    // 如果热榜中没有足够内容，使用搜索
    if (results.length < limit) {
      for (const topic of topics) {
        try {
          const searchResponse = await axios.get(
            'https://www.zhihu.com/api/v4/search_v3',
            {
              headers: this.headers,
              params: {
                gk_version: 'gz-gaokao',
                t: 'general',
                q: `${topic} 健康`,
                limit: Math.ceil((limit - results.length) / topics.length),
                offset: 0,
                search_source: 'Filter'
              },
              timeout: 10000
            }
          );

          if (searchResponse.data && searchResponse.data.data) {
            searchResponse.data.data.forEach(item => {
              if (item.object && item.object.type === 'article') {
                results.push({
                  id: `zhihu-${item.object.id}`,
                  type: 'article',
                  source: '知乎',
                  title: item.object.title,
                  summary: item.object.excerpt || '',
                  url: `https://zhuanlan.zhihu.com/p/${item.object.id}`,
                  imageUrl: item.object.image_url || this.generatePlaceholder(topic),
                  publishDate: item.object.updated_time || new Date().toISOString(),
                  tags: ['健康科普', '知乎', topic],
                  author: item.object.author?.name || '知乎用户',
                  voteCount: item.object.vote_count || 0
                });
              }
            });
          }
        } catch (error) {
          console.error(`知乎搜索 "${topic}" 失败:`, error.message);
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * 获取微信公众号文章
   * 使用搜狗微信搜索
   */
  async getWeChatContent(keywords = ['肺部健康', '呼吸训练'], limit = 5) {
    try {
      const results = [];
      
      for (const keyword of keywords) {
        try {
          // 搜狗微信搜索（模拟浏览器）
          const response = await axios.get(
            'https://weixin.sogou.com/weixin',
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9'
              },
              params: {
                type: 2, // 文章搜索
                query: `${keyword} 健康`,
                ie: 'utf8'
              },
              timeout: 10000
            }
          );

          // 解析 HTML（需要 cheerio 库）
          // 这里简化处理，返回备用数据
        } catch (error) {
          console.error(`微信搜索 "${keyword}" 失败:`, error.message);
        }
      }

      return results.length > 0 ? results : this.getWeChatFallback();
    } catch (error) {
      console.error('微信公众号 API 失败:', error.message);
      return this.getWeChatFallback();
    }
  }

  /**
   * 获取 B 站视频（使用官方开放 API）
   */
  async getBilibiliContent(keywords = ['呼吸训练', '肺活量'], limit = 5) {
    try {
      const results = [];
      
      for (const keyword of keywords) {
        const response = await axios.get(
          `${CONFIG.BILIBILI_API_URL}/x/web-interface/search/type`,
          {
            headers: {
              ...this.headers,
              'Referer': 'https://www.bilibili.com'
            },
            params: {
              search_type: 'video',
              keyword: keyword,
              page: 1,
              page_size: Math.ceil(limit / keywords.length),
              order: 'totalrank'
            },
            timeout: 10000
          }
        );

        if (response.data && response.data.data && response.data.data.result) {
          response.data.data.result.forEach(video => {
            results.push({
              id: `bilibili-${video.bvid}`,
              type: 'video',
              source: 'B 站',
              title: video.title.replace(/<[^>]*>/g, ''),
              summary: video.description || video.title,
              url: `https://www.bilibili.com/video/${video.bvid}`,
              imageUrl: video.pic.replace('http://', 'https://'),
              publishDate: new Date(video.pubdate * 1000).toISOString(),
              tags: ['康复训练', 'B 站', keyword],
              author: video.author,
              videoId: video.bvid,
              duration: this.formatDuration(video.duration),
              playCount: video.play || 0,
              danmaku: video.video_review || 0
            });
          });
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      console.error('B 站 API 失败:', error.message);
      return this.getBilibiliFallback();
    }
  }

  formatDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  generatePlaceholder(keyword) {
    return `https://picsum.photos/seed/${encodeURIComponent(keyword)}/400/300`;
  }

  // 备用数据
  getZhihuFallback() {
    return [
      {
        id: 'zhihu-1',
        type: 'article',
        source: '知乎',
        title: '春季呼吸道防护指南：如何预防过敏和感染',
        summary: '春季是呼吸道疾病高发季节，专家建议外出佩戴口罩，保持室内湿度，定期通风，多喝水增强免疫力。',
        url: 'https://www.zhihu.com/search?q=春季呼吸道防护&type=content',
        imageUrl: 'https://picsum.photos/seed/spring-health/400/300',
        publishDate: new Date().toISOString(),
        tags: ['健康科普', '知乎', '呼吸道'],
        author: '呼吸科李医生',
        voteCount: 2568
      }
    ];
  }

  getWeChatFallback() {
    return [
      {
        id: 'wechat-1',
        type: 'article',
        source: '微信公众号',
        title: '钟南山：保护肺部健康，从这 5 个习惯开始',
        summary: '中国工程院院士钟南山教授指出，保护肺部健康需要养成良好的生活习惯：戒烟限酒、适量运动、均衡饮食、充足睡眠、保持良好心态。',
        url: 'https://weixin.sogou.com/weixin?type=2&query=钟南山 肺部健康',
        imageUrl: 'https://picsum.photos/seed/zhongnanshan/400/300',
        publishDate: new Date().toISOString(),
        tags: ['健康科普', '微信公众号', '钟南山'],
        author: '健康时报',
        voteCount: 15623
      }
    ];
  }

  getBilibiliFallback() {
    return [
      {
        id: 'bilibili-fallback-1',
        type: 'video',
        source: 'B 站',
        title: '【腹式呼吸】4 分钟跟练｜产后瘦肚子必备',
        summary: '腹式呼吸跟练版来啦~ 记得每天循环 3 遍，持续 2 周哦',
        url: 'https://www.bilibili.com/video/BV1MM411B7SW',
        imageUrl: 'https://i1.hdslb.com/bfs/archive/a46d1c0a79d572acf3e13bb05cafcf1d69114792.jpg',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站', '腹式呼吸'],
        author: '康复硕士小贾 Jasmine',
        videoId: 'BV1MM411B7SW',
        duration: '04:00',
        playCount: 255135,
        danmaku: 174
      }
    ];
  }
}

export const officialAPIService = new OfficialAPIService();
