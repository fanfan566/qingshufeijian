// 使用 RSS 和公开 API 获取健康内容
import axios from 'axios';
import Parser from 'rss-parser';

const parser = new Parser();

export class RSSCrawler {
  constructor() {
    // 健康类 RSS 订阅源（公开可用）
    this.rssFeeds = [
      // 丁香医生（如果有 RSS）
      // 'https://dxy.com/rss',
      
      // 医学界
      'https://www.yixuejie.com/rss',
      
      // 其他健康博客 RSS
    ];

    // 公开的健康 API
    this.publicAPIs = {
      // 国家卫生健康委员会（示例）
      nhc: 'http://www.nhc.gov.cn/',
      
      // 中国疾控中心
      chinacdc: 'http://www.chinacdc.cn/'
    };
  }

  async crawlAll() {
    console.log('\n🚀 开始获取健康内容（RSS + 公开 API）...\n');
    
    const results = {
      articles: [],
      videos: [],
      lastUpdate: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    };

    try {
      // 1. 从 RSS 获取文章
      const rssArticles = await this.fetchFromRSS();
      console.log(`✓ RSS 获取成功：${rssArticles.length} 篇文章`);
      results.articles.push(...rssArticles);

      // 2. 从公开 API 获取
      const apiArticles = await this.fetchFromPublicAPI();
      console.log(`✓ 公开 API 获取成功：${apiArticles.length} 篇文章`);
      results.articles.push(...apiArticles);

      // 3. 从 B 站获取视频（使用开放 API）
      const videos = await this.fetchBilibiliVideos();
      console.log(`✓ B 站获取成功：${videos.length} 个视频`);
      results.videos.push(...videos);

      // 去重和排序
      results.articles = this.deduplicate(results.articles);
      results.videos = this.deduplicate(results.videos);
      results.articles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
      results.videos.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

      console.log(`\n✅ 获取完成！总计：${results.articles.length} 篇文章，${results.videos.length} 个视频\n`);
      return results;
    } catch (error) {
      console.error('获取失败:', error.message);
      return this.getFallback();
    }
  }

  async fetchFromRSS() {
    const articles = [];
    
    // 示例：解析 RSS feed
    try {
      // 这里使用一个示例 RSS，实际使用时替换为真实的健康类 RSS
      const feed = await parser.parseURL('https://feeds.feedburner.com/36kr');
      
      feed.items.slice(0, 10).forEach(item => {
        if (item.title && (item.title.includes('健康') || item.title.includes('医疗') || item.title.includes('肺'))) {
          articles.push({
            id: `rss-${item.guid || item.link}`,
            type: 'article',
            source: 'RSS',
            title: item.title,
            summary: item.contentSnippet || item.description || '',
            url: item.link,
            imageUrl: item.image?.url || item.enclosure?.url,
            publishDate: item.pubDate || new Date().toISOString(),
            tags: ['健康科普', 'RSS'],
            author: item.author || '未知',
            voteCount: 0
          });
        }
      });
    } catch (error) {
      console.error('RSS 获取失败:', error.message);
    }

    return articles.length > 0 ? articles : this.getRSSFallback();
  }

  async fetchFromPublicAPI() {
    const articles = [];
    
    // 这里可以调用一些公开的医疗 API
    // 例如：用药助手 API、医学百科 API 等
    
    return articles;
  }

  async fetchBilibiliVideos() {
    try {
      const response = await axios.get(
        'https://api.bilibili.com/x/web-interface/search/type',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com'
          },
          params: {
            search_type: 'video',
            keyword: '呼吸训练',
            page: 1,
            page_size: 5,
            order: 'totalrank'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.data && response.data.data.result) {
        return response.data.data.result.map(video => ({
          id: `bilibili-${video.bvid}`,
          type: 'video',
          source: 'B 站',
          title: video.title.replace(/<[^>]*>/g, ''),
          summary: video.description || '',
          url: `https://www.bilibili.com/video/${video.bvid}`,
          imageUrl: video.pic.replace('http://', 'https://'),
          publishDate: new Date(video.pubdate * 1000).toISOString(),
          tags: ['康复训练', 'B 站'],
          author: video.author,
          videoId: video.bvid,
          duration: this.formatDuration(video.duration),
          playCount: video.play || 0
        }));
      }
    } catch (error) {
      console.error('B 站 API 失败:', error.message);
    }

    return this.getBilibiliFallback();
  }

  formatDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  deduplicate(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = item.url || `${item.source}-${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getRSSFallback() {
    return [
      {
        id: 'rss-1',
        type: 'article',
        source: '医学界',
        title: '慢性阻塞性肺疾病诊治指南（2021 年修订版）',
        summary: 'COPD 是常见的慢性呼吸系统疾病，早期诊断和规范治疗对改善患者预后至关重要。本文介绍了 COPD 的最新诊断标准和治疗方案。',
        url: 'https://www.yixuejie.com/copd-guide',
        imageUrl: 'https://picsum.photos/seed/copd/400/300',
        publishDate: new Date().toISOString(),
        tags: ['医学指南', 'COPD'],
        author: '医学界',
        voteCount: 0
      }
    ];
  }

  getBilibiliFallback() {
    return [
      {
        id: 'bilibili-1',
        type: 'video',
        source: 'B 站',
        title: '【腹式呼吸】4 分钟跟练',
        summary: '每天 4 分钟，增强肺活量',
        url: 'https://www.bilibili.com/video/BV1MM411B7SW',
        imageUrl: 'https://i1.hdslb.com/bfs/archive/a46d1c0a79d572acf3e13bb05cafcf1d69114792.jpg',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站'],
        author: '康复硕士小贾 Jasmine',
        videoId: 'BV1MM411B7SW',
        duration: '04:00',
        playCount: 255135
      }
    ];
  }

  getFallback() {
    return {
      articles: this.getRSSFallback(),
      videos: this.getBilibiliFallback(),
      lastUpdate: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    };
  }
}

export const rssCrawler = new RSSCrawler();
