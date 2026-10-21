// 推荐内容 API 代理 - 处理第三方 API 请求

const express = require('express');
const axios = require('axios');
const router = express.Router();

// API 密钥（从环境变量读取）
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || 'YOUR_NEWSAPI_KEY';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'YOUR_YOUTUBE_API_KEY';

// 获取健康新闻
router.get('/news', async (req, res) => {
  try {
    const { topics = 'lung health', limit = 5 } = req.query;
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: `(health OR medical) AND (${topics})`,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: limit,
        apiKey: NEWSAPI_KEY,
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('NewsAPI error:', error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// 获取 PubMed 论文
router.get('/pubmed', async (req, res) => {
  try {
    const { topics = 'lung health respiratory', limit = 5 } = req.query;
    
    // 搜索论文 ID
    const searchResponse = await axios.get(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
      {
        params: {
          db: 'pubmed',
          term: topics,
          retmax: limit,
          retmode: 'json',
          sort: 'pubdate',
        },
      }
    );
    
    const ids = searchResponse.data.esearchresult?.idlist || [];
    
    if (ids.length === 0) {
      return res.json({ result: [] });
    }
    
    // 获取论文详情
    const detailsResponse = await axios.get(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
      {
        params: {
          db: 'pubmed',
          id: ids.join(','),
          retmode: 'json',
        },
      }
    );
    
    res.json(detailsResponse.data);
  } catch (error) {
    console.error('PubMed error:', error.message);
    res.status(500).json({ error: 'Failed to fetch papers' });
  }
});

// 获取 YouTube 视频
router.get('/youtube', async (req, res) => {
  try {
    const { topics = 'lung health breathing exercise', limit = 5 } = req.query;
    
    const response = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          part: 'snippet',
          maxResults: limit,
          q: topics,
          type: 'video',
          videoEmbeddable: 'true',
          videoLicense: 'creativeCommon',
          key: YOUTUBE_API_KEY,
        },
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('YouTube error:', error.message);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// 获取知乎健康话题（需要使用知乎 API）
router.get('/zhihu', async (req, res) => {
  try {
    const { topics = '健康 肺部' } = req.query;
    
    // 注意：知乎 API 需要 OAuth 认证，这里仅示例
    // 实际使用时需要申请知乎开发者账号
    res.json({
      data: [],
      message: 'Zhihu API requires OAuth authentication',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch zhihu content' });
  }
});

module.exports = router;
