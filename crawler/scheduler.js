// 定时任务调度器
import { healthCrawler } from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEDULE_FILE = path.join(__dirname, '..', 'data', 'crawler', 'schedule.json');

export class Scheduler {
  constructor() {
    this.interval = 6 * 60 * 60 * 1000; // 6 小时
    this.timer = null;
    this.lastRun = null;
    this.nextRun = null;

    const savedSchedule = this.loadSchedule();
    if (savedSchedule) {
      this.lastRun = savedSchedule.lastRun ? new Date(savedSchedule.lastRun) : null;
      this.nextRun = savedSchedule.nextRun ? new Date(savedSchedule.nextRun) : null;
      this.interval = savedSchedule.interval || this.interval;
    }
  }

  // 启动定时任务
  start() {
    if (this.timer) {
      return;
    }

    console.log('\n🕐 启动定时爬虫任务...');
    console.log(`   更新频率：每 6 小时一次`);

    this.nextRun = new Date(Date.now() + this.interval);

    // 立即执行一次
    this.run();

    // 设置定时器
    this.timer = setInterval(() => {
      this.run();
    }, this.interval);

    // 保存调度信息
    this.saveSchedule();
  }

  // 停止定时任务
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.saveSchedule();
      console.log('⏸️  定时任务已停止');
    }
  }

  // 执行爬取任务
  async run() {
    console.log('\n' + '='.repeat(60));
    console.log(`⏰ 定时任务执行时间：${new Date().toLocaleString('zh-CN')}`);
    console.log('='.repeat(60));
    
    this.lastRun = new Date();
    this.nextRun = new Date(Date.now() + this.interval);
    this.saveSchedule();
    
    try {
      await healthCrawler.crawlAll();
      this.saveSchedule();
    } catch (error) {
      this.saveSchedule();
      console.error('❌ 定时任务执行失败:', error.message);
    }
  }

  // 保存调度信息
  saveSchedule() {
    try {
      const dataDir = path.join(__dirname, '..', 'data', 'crawler');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const schedule = {
        interval: this.interval,
        lastRun: this.lastRun ? this.lastRun.toISOString() : null,
        nextRun: this.nextRun ? this.nextRun.toISOString() : null,
        status: this.timer ? 'running' : 'stopped'
      };

      fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存调度信息失败:', error.message);
    }
  }

  // 加载调度信息
  loadSchedule() {
    try {
      if (fs.existsSync(SCHEDULE_FILE)) {
        const data = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('加载调度信息失败:', error.message);
    }
    return null;
  }

  // 手动触发爬取
  async triggerNow() {
    console.log('\n⚡ 手动触发爬取任务...');
    await this.run();
  }

  // 获取状态
  getStatus() {
    const savedSchedule = this.loadSchedule();

    return {
      interval: this.interval,
      intervalHours: this.interval / (1000 * 60 * 60),
      lastRun: this.lastRun || (savedSchedule?.lastRun ? new Date(savedSchedule.lastRun) : null),
      nextRun: this.nextRun || (savedSchedule?.nextRun ? new Date(savedSchedule.nextRun) : null),
      running: this.timer !== null || savedSchedule?.status === 'running'
    };
  }
}

// 导出单例
export const scheduler = new Scheduler();
