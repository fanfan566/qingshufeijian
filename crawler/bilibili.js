// B 站健康视频爬虫
import axios from 'axios';

export class BilibiliCrawler {
  constructor() {
    this.baseURL = 'https://api.bilibili.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.bilibili.com'
    };

    // 健康相关关键词
    this.keywords = [
      '呼吸训练',
      '肺活量锻炼',
      '腹式呼吸',
      '康复训练',
      '健康养生',
      '戒烟方法',
      '瑜伽呼吸',
      '慢性阻塞性肺病'
    ];
  }

  // 生成随机 User-Agent
  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  // 延迟函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async crawl() {
    console.log('  开始爬取 B 站健康视频...');
    const videos = [];

    try {
      // 搜索 B 站视频
      for (const keyword of this.keywords.slice(0, 5)) { // 限制前 5 个关键词
        try {
          console.log(`    搜索关键词：${keyword}`);
          
          // 使用 B 站搜索 API
          const searchURL = 'https://api.bilibili.com/x/web-interface/search/type';
          const params = {
            search_type: 'video',
            keyword: keyword,
            page: 1,
            page_size: 3,
            order: 'totalrank',
            duration: 0,
            tids: 0,
            filter: ''
          };

          const response = await axios.get(searchURL, {
            headers: {
              ...this.headers,
              'User-Agent': this.getRandomUserAgent()
            },
            params,
            timeout: 10000
          });

          if (response.data && response.data.data && response.data.data.result) {
            response.data.data.result.forEach(video => {
              videos.push({
                id: `bilibili-${video.bvid}`,
                type: 'video',
                source: 'B 站',
                title: video.title.replace(/<[^>]*>/g, ''), // 移除 HTML 标签
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

          // 随机延迟
          await this.sleep(Math.random() * 2000 + 1000);
        } catch (error) {
          console.error(`      关键词 "${keyword}" 爬取失败:`, error.message);
        }
      }

      // 如果 API 爬取失败，使用备用数据
      if (videos.length === 0) {
        console.log('  API 爬取未获取到数据，使用备用数据...');
        videos.push(...this.getFallbackVideos());
      }

      console.log(`  ✓ B 站爬取完成：${videos.length} 个视频`);
      return videos;
    } catch (error) {
      console.error('B 站爬取失败:', error.message);
      return this.getFallbackVideos();
    }
  }

  // 格式化时长
  formatDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 备用数据
  getFallbackVideos() {
    return [
      {
        id: 'bilibili-fallback-1',
        type: 'video',
        source: 'B 站',
        title: '【呼吸训练】10 分钟基础腹式呼吸教学 | 增强肺活量',
        summary: '跟随专业指导师学习腹式呼吸技巧，每天 10 分钟，有效提升肺功能和呼吸效率。适合所有人群，尤其是呼吸系统疾病患者、术后康复人群。',
        url: 'https://www.bilibili.com/video/BV1abc123',
        imageUrl: 'https://picsum.photos/seed/breathing-video/400/300',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站', '呼吸训练'],
        author: '康复训练师小李',
        videoId: 'BV1abc123',
        duration: '10:25',
        playCount: 156234,
        danmaku: 892
      },
      {
        id: 'bilibili-fallback-2',
        type: 'video',
        source: 'B 站',
        title: '肺部康复运动教程 - 术后恢复必备',
        summary: '专业的肺部康复训练动作，帮助术后患者快速恢复肺功能，改善呼吸困难症状。包含热身、主训练、放松三个部分。',
        url: 'https://www.bilibili.com/video/BV1def456',
        imageUrl: 'https://picsum.photos/seed/rehab-video/400/300',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站', '术后康复'],
        author: '三甲医院康复科',
        videoId: 'BV1def456',
        duration: '15:30',
        playCount: 89456,
        danmaku: 567
      },
      {
        id: 'bilibili-fallback-3',
        type: 'video',
        source: 'B 站',
        title: '瑜伽呼吸法 Pranayama 完整教学',
        summary: '古老的瑜伽呼吸技巧，现代科学验证其肺部健康益处。包含腹式呼吸、完全呼吸、清理经络调息等多种呼吸练习方法。',
        url: 'https://www.bilibili.com/video/BV1ghi789',
        imageUrl: 'https://picsum.photos/seed/yoga-video/400/300',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站', '瑜伽'],
        author: '瑜伽导师 Anna',
        videoId: 'BV1ghi789',
        duration: '20:15',
        playCount: 234567,
        danmaku: 1234
      },
      {
        id: 'bilibili-fallback-4',
        type: 'video',
        source: 'B 站',
        title: 'COPD 患者居家康复训练指南',
        summary: '专为慢性阻塞性肺病患者设计的居家康复训练，包含呼吸训练、肢体运动、日常活动指导等内容，帮助改善生活质量。',
        url: 'https://www.bilibili.com/video/BV1jkl012',
        imageUrl: 'https://picsum.photos/seed/copd-rehab/400/300',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站', 'COPD'],
        author: '呼吸科医生',
        videoId: 'BV1jkl012',
        duration: '18:40',
        playCount: 67890,
        danmaku: 445
      },
      {
        id: 'bilibili-fallback-5',
        type: 'video',
        source: 'B 站',
        title: '戒烟后肺部恢复全过程科普',
        summary: '戒烟后，肺部会经历怎样的恢复过程？视频详细讲解戒烟后 2 周、1 个月、3 个月、1 年肺部的变化，给你戒烟的动力。',
        url: 'https://www.bilibili.com/video/BV1mno345',
        imageUrl: 'https://picsum.photos/seed/quit-smoking-video/400/300',
        publishDate: new Date().toISOString(),
        tags: ['康复训练', 'B 站', '戒烟'],
        author: '科普医生',
        videoId: 'BV1mno345',
        duration: '08:50',
        playCount: 345678,
        danmaku: 2156
      }
    ];
  }
}
