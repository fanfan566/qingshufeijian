// 健康内容爬虫主服务 - 混合方案（推荐）
import { hybridCrawler } from './hybrid-crawler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据文件路径
const DATA_DIR = path.join(__dirname, '..', 'data', 'crawler');
const CACHE_FILE = path.join(DATA_DIR, 'recommendations_cache.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 重新导出 hybridCrawler 的方法
export class HealthCrawler {
  async crawlAll() {
    return await hybridCrawler.crawlAll();
  }

  getCache() {
    return hybridCrawler.getCache();
  }

  needsUpdate() {
    return hybridCrawler.needsUpdate();
  }
}

export const healthCrawler = new HealthCrawler();
