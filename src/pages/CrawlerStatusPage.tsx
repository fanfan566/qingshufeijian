import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  RefreshCw,
  CheckCircle,
  Clock,
  Database,
  Activity,
  Play,
  AlertCircle
} from 'lucide-react';

interface CrawlerStatus {
  interval: number;
  intervalHours: number;
  lastRun: string | null;
  nextRun: string | null;
  running: boolean;
}

interface ContentItem {
  url: string;
  imageUrl?: string;
  title: string;
  summary?: string;
  source?: string;
  author?: string;
  duration?: string;
}

interface CrawlerData {
  articles: ContentItem[];
  videos: ContentItem[];
  lastUpdate: string | null;
  nextUpdate: string | null;
}

const EMPTY_DATA: CrawlerData = {
  articles: [],
  videos: [],
  lastUpdate: null,
  nextUpdate: null
};

export const CrawlerStatusPage: React.FC = () => {
  const [status, setStatus] = useState<CrawlerStatus | null>(null);
  const [data, setData] = useState<CrawlerData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/crawler/status?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`状态读取失败（${res.status}）`);
    }

    const result = await res.json();
    setStatus(result);
    return result;
  }, []);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/crawler/recommendations?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`数据读取失败（${res.status}）`);
    }

    const result = await res.json();
    const nextData = {
      articles: Array.isArray(result.articles) ? result.articles : [],
      videos: Array.isArray(result.videos) ? result.videos : [],
      lastUpdate: result.lastUpdate || null,
      nextUpdate: result.nextUpdate || null
    };
    setData(nextData);
    return nextData;
  }, []);

  const refreshAll = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      await Promise.all([loadStatus(), loadData()]);
    } catch (error) {
      console.error('加载爬虫数据失败:', error);
      setError(error instanceof Error ? error.message : '加载爬虫数据失败');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [loadData, loadStatus]);

  const triggerCrawl = async () => {
    try {
      setCrawling(true);
      setError(null);

      const res = await fetch('/api/crawler/crawl', {
        method: 'POST',
        cache: 'no-store'
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || result.message || `爬取失败（${res.status}）`);
      }

      if (result.status) {
        setStatus(result.status);
      }

      if (result.data) {
        setData({
          articles: Array.isArray(result.data.articles) ? result.data.articles : [],
          videos: Array.isArray(result.data.videos) ? result.data.videos : [],
          lastUpdate: result.data.lastUpdate || result.status?.lastRun || null,
          nextUpdate: result.data.nextUpdate || result.status?.nextRun || null
        });
      }

      const [latestStatus, latestData] = await Promise.all([loadStatus(), loadData()]);

      setStatus(latestStatus);
      setData({
        articles: latestData.articles,
        videos: latestData.videos,
        lastUpdate: latestData.lastUpdate || latestStatus?.lastRun || null,
        nextUpdate: latestData.nextUpdate || latestStatus?.nextRun || null
      });

      alert('爬取成功！');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      alert('爬取失败：' + message);
    } finally {
      setCrawling(false);
    }
  };

  useEffect(() => {
    refreshAll();

    const timer = window.setInterval(() => {
      refreshAll(false);
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshAll]);

  const formatDateTime = (value: string | null) => {
    if (!value) return '暂无记录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '暂无记录';
    return date.toLocaleString('zh-CN');
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.72)_0%,rgba(245,247,255,0.52)_100%)] p-8 shadow-[0_30px_80px_rgba(56,28,140,0.18)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(191,140,225,0.2),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(55,133,216,0.15),transparent_30%)]" />
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-night-pink/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-night-sky/20 blur-3xl" />

            <div className="relative z-10">
              <h1 className="text-4xl font-black text-slate-900 mb-2">
                爬虫管理后台 🕷️
              </h1>
              <p className="text-lg text-slate-600 font-medium">
                管理健康内容爬虫系统，查看实时状态和数据
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500 font-medium">
                <span>最近更新：{formatDateTime(data.lastUpdate)}</span>
                <span>下次计划：{formatDateTime(status?.nextRun || data.nextUpdate)}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200/60 bg-red-50/70 px-4 py-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[32px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-6 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl" />
            <div className="relative flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-200/30 backdrop-blur-sm">
                <Activity className="text-indigo-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-700">运行状态</h3>
            </div>
            {status ? (
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  {status.running ? (
                    <>
                      <CheckCircle className="text-green-500" size={18} />
                      <span className="text-green-600 font-semibold">正常运行</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="text-orange-500" size={18} />
                      <span className="text-orange-600 font-semibold">已停止</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-slate-500 font-medium">
                  更新频率：每 {status.intervalHours} 小时
                </p>
              </div>
            ) : (
              <p className="text-slate-400 font-medium">状态读取中...</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-[32px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-6 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-green-500/10 blur-2xl" />
            <div className="relative flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-200/30 backdrop-blur-sm">
                <Clock className="text-green-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-700">上次运行</h3>
            </div>
            {status?.lastRun ? (
              <div className="relative">
                <p className="text-2xl font-black text-slate-800 mb-1">
                  {new Date(status.lastRun).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-sm text-slate-500 font-medium">
                  {new Date(status.lastRun).toLocaleDateString('zh-CN')}
                </p>
              </div>
            ) : (
              <p className="text-slate-400 font-medium">暂无运行记录</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative overflow-hidden rounded-[32px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-6 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="relative flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-200/30 backdrop-blur-sm">
                <Database className="text-blue-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-700">数据量</h3>
            </div>
            <div className="relative space-y-2">
              <p className="text-2xl font-black text-slate-800">
                {data.articles.length} <span className="text-sm font-medium text-slate-500">篇文章</span>
              </p>
              <p className="text-2xl font-black text-slate-800">
                {data.videos.length} <span className="text-sm font-medium text-slate-500">个视频</span>
              </p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-8 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl mb-8"
        >
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-pink-500/10 blur-3xl" />

          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">手动触发爬取</h3>
              <p className="text-slate-600 font-medium">
                立即从知乎、丁香医生、B 站爬取最新健康内容
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => refreshAll()}
                disabled={loading || crawling}
                className="p-4 rounded-2xl border border-white/30 bg-white/50 text-slate-600 hover:bg-white/70 transition-colors disabled:opacity-50"
                title="刷新状态和数据"
              >
                <RefreshCw size={22} className={loading ? 'animate-spin' : ''} />
              </button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={triggerCrawl}
                disabled={crawling}
                className={`relative px-8 py-4 rounded-2xl font-bold flex items-center gap-3 overflow-hidden transition-all ${
                  crawling
                    ? 'bg-slate-200/50 text-slate-400 cursor-not-allowed'
                    : 'bg-[linear-gradient(135deg,rgba(28,29,171,0.88),rgba(55,133,216,0.75),rgba(232,147,197,0.58))] text-white shadow-[0_18px_38px_rgba(46,64,184,0.32)] hover:shadow-[0_22px_42px_rgba(46,64,184,0.38)]'
                }`}
              >
                {crawling ? (
                  <>
                    <RefreshCw className="animate-spin" size={24} />
                    <span>爬取中...</span>
                  </>
                ) : (
                  <>
                    <Play size={24} />
                    <span>立即爬取</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-6 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-pink-500/10 blur-2xl" />
            <div className="relative flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800">最新文章</h3>
              <button
                onClick={() => refreshAll()}
                disabled={loading}
                className="p-2 rounded-xl hover:bg-white/40 transition-colors"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
              </button>
            </div>
            {data.articles.length > 0 ? (
              <div className="relative space-y-3 max-h-[600px] overflow-y-auto scrollbar-hide pr-2">
                {data.articles.slice(0, 10).map((article, idx) => (
                  <motion.a
                    key={`${article.url}-${idx}`}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group block"
                  >
                    <div className="relative overflow-hidden rounded-[24px] bg-white/50 p-4 hover:bg-white/70 transition-all backdrop-blur-sm border border-white/20">
                      <div className="flex items-start gap-3">
                        <img
                          src={article.imageUrl || 'https://picsum.photos/seed/article-default/240/160'}
                          alt={article.title}
                          className="w-24 h-20 rounded-xl object-cover flex-shrink-0 shadow-sm"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-800 mb-1 truncate group-hover:text-indigo-600 transition-colors">{article.title}</h4>
                          <p className="text-sm text-slate-500 mb-2 line-clamp-2 font-medium">{article.summary || '暂无摘要'}</p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded-lg font-semibold backdrop-blur-sm ${
                              article.source === '知乎' ? 'bg-blue-100/70 text-blue-600' :
                              article.source === '丁香医生' ? 'bg-green-100/70 text-green-600' :
                              'bg-slate-100/70 text-slate-600'
                            }`}>
                              {article.source || '内容源'}
                            </span>
                            <span className="text-slate-400 font-medium">{article.author || '未知作者'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.a>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-12 font-medium">
                {loading ? '正在读取文章数据...' : '暂无文章数据'}
              </p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="relative overflow-hidden rounded-[36px] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(243,246,255,0.48)_100%)] p-6 shadow-[0_24px_70px_rgba(76,81,191,0.12)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-orange-500/10 blur-2xl" />
            <div className="relative flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-800">最新视频</h3>
              <button
                onClick={() => refreshAll()}
                disabled={loading}
                className="p-2 rounded-xl hover:bg-white/40 transition-colors"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
              </button>
            </div>
            {data.videos.length > 0 ? (
              <div className="relative space-y-3 max-h-[600px] overflow-y-auto scrollbar-hide pr-2">
                {data.videos.slice(0, 10).map((video, idx) => (
                  <motion.a
                    key={`${video.url}-${idx}`}
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group block"
                  >
                    <div className="relative overflow-hidden rounded-[24px] bg-white/50 p-4 hover:bg-white/70 transition-all backdrop-blur-sm border border-white/20">
                      <div className="flex items-start gap-3">
                        <img
                          src={video.imageUrl || 'https://picsum.photos/seed/video-default/320/180'}
                          alt={video.title}
                          className="w-32 h-20 rounded-xl object-cover flex-shrink-0 shadow-sm"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-800 mb-1 truncate group-hover:text-pink-600 transition-colors">{video.title}</h4>
                          <p className="text-sm text-slate-500 mb-2 line-clamp-2 font-medium">{video.summary || '暂无简介'}</p>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="px-2 py-1 rounded-lg bg-pink-100/70 text-pink-600 font-semibold backdrop-blur-sm">
                              {video.source || '视频'}
                            </span>
                            <span className="text-slate-400 font-medium">{video.author || '未知作者'}</span>
                            <span className="text-slate-400 font-medium">{video.duration || '--:--'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.a>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-12 font-medium">
                {loading ? '正在读取视频数据...' : '暂无视频数据'}
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
