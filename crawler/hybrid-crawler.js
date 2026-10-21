// 健康内容爬虫 - 混合方案（推荐）
// 1. 手动维护核心推荐库（保证质量）
// 2. 定期从 B 站 API 获取最新视频（保证时效）
// 3. 预留官方 API 接口（未来扩展）

import { getManualRecommendations } from './manual-recommendations.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data', 'crawler');
const CACHE_FILE = path.join(DATA_DIR, 'recommendations_cache.json');

export class HybridCrawler {
  constructor() {
    this.cache = this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      }
    } catch (error) {
      console.error('加载缓存失败:', error.message);
    }
    return { articles: [], videos: [], lastUpdate: null, nextUpdate: null };
  }

  saveCache(data) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log('✓ 缓存已保存');
    } catch (error) {
      console.error('保存缓存失败:', error.message);
    }
  }

  async crawlAll() {
    console.log('\n🚀 开始获取健康内容（混合方案）...\n');
    const startTime = Date.now();

    try {
      // 1. 获取手动维护的推荐（核心内容，质量保证）
      const manual = getManualRecommendations(10);
      console.log(`✓ 手动推荐库：${manual.articles.length} 篇文章，${manual.videos.length} 个视频`);

      // 2. 从 B 站 API 获取最新视频（保证时效性）
      const freshVideos = await this.fetchBilibiliFresh();
      console.log(`✓ B 站实时获取：${freshVideos.length} 个视频`);

      // 3. 合并数据
      const results = {
        articles: manual.articles,
        videos: [...freshVideos, ...manual.videos].slice(0, 10),
        lastUpdate: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
      };

      // 4. 保存缓存
      this.cache = results;
      this.saveCache(results);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ 获取完成！总耗时：${duration}秒`);
      console.log(`📊 总计：${results.articles.length} 篇文章，${results.videos.length} 个视频\n`);

      return results;
    } catch (error) {
      console.error('获取失败:', error.message);
      return getManualRecommendations(10);
    }
  }

  async fetchBilibiliFresh() {
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
            keyword: '呼吸训练 肺部健康',
            page: 1,
            page_size: 5,
            order: 'pubdate' // 按发布时间排序，获取最新
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
    return [];
  }

  formatDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getCache() {
    return this.cache;
  }

  needsUpdate() {
    if (!this.cache.lastUpdate) return true;
    const lastUpdate = new Date(this.cache.lastUpdate);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    return hoursSinceUpdate >= 6;
  }
}

export const hybridCrawler = new HybridCrawler();
