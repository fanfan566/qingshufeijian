import express from 'express';
import { KNOWLEDGE_CATEGORIES, loadKnowledgeCatalog } from '../knowledgeCatalog.js';

export function createKnowledgeRouter(getCatalog = loadKnowledgeCatalog) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/metadata', (_req, res, next) => {
    try { res.json(getCatalog().metadata); } catch (error) { next(error); }
  });
  router.get('/', (req, res, next) => {
    const { q = '', category = '全部', scope = 'all', sort = 'relevance', page = '1', pageSize = '24' } = req.query;
    if ([q, category, scope, sort, page, pageSize].some(value => typeof value !== 'string') ||
      q.length > 256 || !['全部', ...KNOWLEDGE_CATEGORIES].includes(category) ||
      !['all', 'respiratory'].includes(scope) || !['relevance', 'name'].includes(sort) ||
      !/^\d+$/.test(page) || !/^\d+$/.test(pageSize) || !Number.isSafeInteger(Number(page)) ||
      Number(page) < 1 || Number(pageSize) < 1 || Number(pageSize) > 100) {
      return res.status(400).json({ message: '检索参数无效，请检查分类、页码或关键词长度。' });
    }
    try { res.json(getCatalog().search({ q, category, scope, sort, page: Number(page), pageSize: Number(pageSize) })); } catch (error) { next(error); }
  });
  router.get('/:code', (req, res, next) => {
    try {
      const entry = getCatalog().detail(req.params.code);
      if (!entry) return res.status(404).json({ message: '未找到该医学词条。' });
      res.json(entry);
    } catch (error) { next(error); }
  });
  router.use((error, _req, res, _next) => {
    console.error('Knowledge catalog unavailable:', error.message);
    res.status(503).json({ message: '知识数据暂不可用，请确认数据文件完整并重试。' });
  });
  return router;
}
