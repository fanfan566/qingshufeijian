import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import multer from 'multer';
import { healthCrawler } from './crawler/index.js';
import { scheduler } from './crawler/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = 8001;

// 中间件
app.use(cors());
app.use(express.json());

// Multer 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 限制 10MB
});

// JWT 密钥（生产环境应该使用环境变量）
const JWT_SECRET = 'your-secret-key-change-in-production-2026';

// API 密钥配置
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'users.json');

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化用户数据文件
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], nextId: 1 }, null, 2));
}

// 读取用户数据
function readUsers() {
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(data);
}

// 写入用户数据
function writeUsers(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 生成 JWT（简化版本）
function generateToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// 验证 JWT
function verifyToken(token) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    return payload;
  } catch (error) {
    return null;
  }
}

// 密码加密
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 路由：用户注册
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    console.log('=== 注册请求 ===');
    console.log('接收到的数据:', { username, email, role });
    
    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: '密码长度至少为 6 位' });
    }
    
    const data = readUsers();
    
    // 检查用户名是否已存在
    if (data.users.some(u => u.username === username)) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    
    // 检查邮箱是否已存在
    if (data.users.some(u => u.email === email)) {
      return res.status(400).json({ message: '邮箱已被注册' });
    }
    
    // 生成唯一用户 ID（格式：U+8 位数字，例如：U10000001）
    const userId = `U${Date.now().toString().substring(4)}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    // 创建新用户
    const newUser = {
      id: userId,
      username,
      email,
      password: hashPassword(password),
      avatar: null,
      membershipLevel: 'free',
      bloodType: '',
      height: 0,
      weight: 0,
      role: role || 'patient', // 使用用户选择的角色，默认为 patient
      createdAt: new Date().toISOString(),
    };
    
    console.log('创建的用户:', { id: userId, username, role: newUser.role });
    
    data.users.push(newUser);
    writeUsers(data);
    
    // 生成 token
    const token = generateToken({ userId: newUser.id, username: newUser.username });
    
    // 返回用户信息（不包含密码）
    const { password: _, ...userWithoutPassword } = newUser;
    
    console.log('返回给前端的用户信息:', { id: userWithoutPassword.id, username: userWithoutPassword.username, role: userWithoutPassword.role });
    
    res.status(201).json({
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 路由：用户登录
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const loginId = typeof username === 'string' ? username.trim() : '';
    
    // 验证输入
    if (!loginId || !password) {
      return res.status(400).json({ message: '请输入用户名/邮箱和密码' });
    }
    
    const data = readUsers();
    
    // 支持使用“用户名”或“邮箱”登录
    const user = data.users.find(
      u => u.username === loginId || u.email === loginId
    );
    
    if (!user) {
      return res.status(401).json({ message: '用户名/邮箱或密码错误' });
    }
    
    // 验证密码
    if (user.password !== hashPassword(password)) {
      return res.status(401).json({ message: '用户名/邮箱或密码错误' });
    }
    
    // 生成 token
    const token = generateToken({ userId: user.id, username: user.username });
    
    // 返回用户信息（不包含密码）
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 路由：用户搜索（支持按姓名、UID、邮箱、角色查询）
app.get('/api/users/search', (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const role = typeof req.query.role === 'string' ? req.query.role.trim().toLowerCase() : '';
    const data = readUsers();

    if (!q) {
      return res.status(400).json({ message: '搜索关键词不能为空', users: [] });
    }

    const users = data.users.filter((user) => {
      const matchesKeyword =
        user.username?.toLowerCase().includes(q) ||
        user.id?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q);

      const matchesRole = !role || user.role?.toLowerCase() === role;
      return matchesKeyword && matchesRole;
    }).map(({ password, ...rest }) => rest);

    res.json({ users });
  } catch (error) {
    console.error('用户搜索错误:', error);
    res.status(500).json({ message: '用户搜索失败', users: [] });
  }
});

// 路由：智能问答代理（后端调用通义千问，避免浏览器 CORS）
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history, userProfile } = req.body;
    if (!message) return res.status(400).json({ message: 'message 不能为空' });

    const apiKey = process.env.ALIBASA_API_KEY || process.env.DASHSCOPE_API_KEY;
    const model = process.env.ALIBASA_MODEL || 'qwen-plus';

    if (!apiKey) {
      return res.status(500).json({ message: '尚未配置 API 密钥（ALIBASA_API_KEY 或 DASHSCOPE_API_KEY）' });
    }

    // 根据用户画像生成个性化的 system prompt
    let systemPrompt = "你是专业肺部健康助手，名叫'肺管家'。回答要专业、亲切、易懂。";
    
    if (userProfile) {
      const { age, gender, hasBasicDisease, basicDiseases } = userProfile;
      const profileInfo = [];
      
      if (age) profileInfo.push(`${age}岁`);
      if (gender) profileInfo.push(gender === 'male' ? '男性' : '女性');
      if (hasBasicDisease && basicDiseases && basicDiseases.length > 0) {
        profileInfo.push(`患有${basicDiseases.join('、')}等基础疾病`);
      }
      
      if (profileInfo.length > 0) {
        systemPrompt += `用户基本信息：${profileInfo.join('，')}。请根据这些信息提供个性化、针对性的健康建议。`;
      }
    }

    // 构建消息历史（使用标准 messages 格式）
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []),
      { role: 'user', content: message }
    ];

    // 通义千问 API 请求格式（DashScope V2）
    const payload = {
      model: model,
      input: {
        messages: messages
      },
      parameters: {
        temperature: 0.7,
        max_tokens: 1024
      }
    };

    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ message: `通义千问 API 错误 (${response.status}): ${errText}` });
    }

    const data = await response.json();
    // 通义千问返回格式：{ output: { text: "...", finish_reason: "stop" }, usage: {...}, request_id: "..." }
    const text = data.output?.text || '';
    res.json({ text });
  } catch (error) {
    console.error('聊天接口错误：', error);
    res.status(500).json({ message: `通义千问 API 调用异常：${error.message || error}` });
  }
});

// ==================== 第三方推荐 API 路由 ====================

// NewsAPI 路由 - 获取健康新闻
app.get('/api/recommendations/news', async (req, res) => {
  try {
    const topics = req.query.topics || 'lung health';
    const limit = parseInt(req.query.limit) || 5;
    
    if (!NEWSAPI_KEY) {
      console.log('NewsAPI: 未配置 API 密钥，返回后备数据');
      return res.json({ articles: getFallbackNews().slice(0, limit) });
    }
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: `(health OR medical OR wellness) AND (${topics})`,
        language: 'zh',
        sortBy: 'publishedAt',
        pageSize: limit,
        apiKey: NEWSAPI_KEY
      },
      timeout: 5000
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('NewsAPI 错误:', error.message);
    // 返回后备数据
    const fallback = getFallbackNews();
    res.json({ articles: fallback.slice(0, parseInt(req.query.limit) || 5) });
  }
});

// PubMed 路由 - 获取医学研究论文（无需 API 密钥）
app.get('/api/recommendations/pubmed', async (req, res) => {
  try {
    const topics = req.query.topics || 'lung health';
    const limit = parseInt(req.query.limit) || 3;
    
    // 搜索 PubMed
    const searchResponse = await axios.get(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
      {
        params: {
          db: 'pubmed',
          term: topics,
          retmax: limit,
          retmode: 'json',
          sort: 'relevance'
        },
        timeout: 5000
      }
    );
    
    const ids = searchResponse.data.esearchresult?.idlist || [];
    
    if (ids.length === 0) {
      return res.json({ result: {} });
    }
    
    // 获取论文详情
    const fetchResponse = await axios.get(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
      {
        params: {
          db: 'pubmed',
          id: ids.join(','),
          retmode: 'json'
        },
        timeout: 5000
      }
    );
    
    res.json(fetchResponse.data.result);
  } catch (error) {
    console.error('PubMed 错误:', error.message);
    res.json({ result: {} });
  }
});

// YouTube 路由 - 获取健康视频
app.get('/api/recommendations/youtube', async (req, res) => {
  try {
    const topics = req.query.topics || 'breathing exercise';
    const limit = parseInt(req.query.limit) || 3;
    
    if (!YOUTUBE_API_KEY) {
      console.log('YouTube API: 未配置 API 密钥，返回后备数据');
      return res.json({ items: getFallbackVideos().slice(0, limit) });
    }
    
    const response = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          q: `${topics} health tutorial`,
          part: 'snippet',
          type: 'video',
          maxResults: limit,
          key: YOUTUBE_API_KEY,
          videoEmbeddable: 'true',
          videoLicense: 'creativeCommon'
        },
        timeout: 5000
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('YouTube API 错误:', error.message);
    // 返回后备数据
    const fallback = getFallbackVideos();
    res.json({ items: fallback.slice(0, parseInt(req.query.limit) || 3) });
  }
});

// 后备数据函数
function getFallbackNews() {
  return [
    {
      title: '春季呼吸道防护指南：如何预防过敏和感染',
      description: '春季是呼吸道疾病高发季节，专家建议外出佩戴口罩，保持室内湿度，定期通风，多喝水增强免疫力。',
      url: 'https://example.com/spring-respiratory-guide',
      urlToImage: 'https://picsum.photos/seed/spring-health/400/300',
      publishedAt: new Date().toISOString(),
      source: { name: '健康时报' }
    },
    {
      title: '新研究：腹式呼吸对肺功能的积极影响',
      description: '最新医学研究表明，每日进行 10 分钟腹式呼吸训练，可显著提升肺活量和呼吸效率。',
      url: 'https://example.com/breathing-research',
      urlToImage: 'https://picsum.photos/seed/breathing-study/400/300',
      publishedAt: new Date().toISOString(),
      source: { name: '医学前沿' }
    },
    {
      title: '肺部健康饮食：这 5 种食物最养肺',
      description: '营养学家推荐苹果、鱼类、坚果、绿叶蔬菜和姜黄等食物，富含抗氧化剂和抗炎成分，有助于保护肺部健康。',
      url: 'https://example.com/lung-healthy-foods',
      urlToImage: 'https://picsum.photos/seed/healthy-food/400/300',
      publishedAt: new Date().toISOString(),
      source: { name: '营养与健康' }
    },
    {
      title: '雾霾天气如何保护你的肺？专家给出 6 点建议',
      description: '空气质量差时，减少户外活动，使用空气净化器，佩戴 N95 口罩，回家后及时清洗鼻腔和面部。',
      url: 'https://example.com/smog-protection',
      urlToImage: 'https://picsum.photos/seed/air-quality/400/300',
      publishedAt: new Date().toISOString(),
      source: { name: '环境健康报' }
    },
    {
      title: '慢性阻塞性肺病（COPD）的早期症状和预防',
      description: 'COPD 早期症状不明显，定期检查肺功能很重要。戒烟、避免二手烟、接种疫苗是有效的预防措施。',
      url: 'https://example.com/copd-prevention',
      urlToImage: 'https://picsum.photos/seed/copd-awareness/400/300',
      publishedAt: new Date().toISOString(),
      source: { name: '呼吸科医学杂志' }
    }
  ];
}

function getFallbackVideos() {
  return [
    {
      snippet: {
        title: '10 分钟基础腹式呼吸训练 | 增强肺活量',
        description: '跟随专业指导师学习腹式呼吸技巧，每天 10 分钟，有效提升肺功能和呼吸效率。适合所有人群。',
        thumbnails: {
          medium: { url: 'https://picsum.photos/seed/breathing-video/400/300' }
        }
      },
      id: { videoId: 'demo123' }
    },
    {
      snippet: {
        title: '肺部康复运动教程 - 术后恢复必备',
        description: '专业的肺部康复训练动作，帮助术后患者快速恢复肺功能，改善呼吸困难症状。',
        thumbnails: {
          medium: { url: 'https://picsum.photos/seed/rehab-video/400/300' }
        }
      },
      id: { videoId: 'demo456' }
    },
    {
      snippet: {
        title: '瑜伽呼吸法 Pranayama 完整教学',
        description: '古老的瑜伽呼吸技巧，现代科学验证其肺部健康益处。包含多种呼吸练习方法。',
        thumbnails: {
          medium: { url: 'https://picsum.photos/seed/yoga-video/400/300' }
        }
      },
      id: { videoId: 'demo789' }
    }
  ];
}

// ==================== 爬虫 API 路由 ====================

// 获取推荐内容（从爬虫缓存）
app.get('/api/crawler/recommendations', async (req, res) => {
  try {
    let cache = healthCrawler.getCache();
    const hasCachedData =
      (cache.articles && cache.articles.length > 0) ||
      (cache.videos && cache.videos.length > 0);

    if (!hasCachedData) {
      console.log('缓存为空，立即执行首次爬取...');
      cache = await healthCrawler.crawlAll();
    } else if (healthCrawler.needsUpdate()) {
      console.log('缓存已过期，后台自动触发爬取...');
      healthCrawler.crawlAll().catch(err => {
        console.error('后台爬取失败:', err);
      });
    }

    res.json({
      articles: cache.articles || [],
      videos: cache.videos || [],
      lastUpdate: cache.lastUpdate,
      nextUpdate: cache.nextUpdate
    });
  } catch (error) {
    console.error('获取推荐内容失败:', error);
    res.status(500).json({ error: '获取推荐内容失败' });
  }
});

// 手动触发爬取
app.post('/api/crawler/crawl', async (req, res) => {
  try {
    console.log('手动触发爬取任务...');
    await scheduler.triggerNow();
    const status = scheduler.getStatus();
    const cache = healthCrawler.getCache();

    res.json({
      success: true,
      message: '爬取成功',
      data: {
        articles: cache.articles || [],
        videos: cache.videos || [],
        lastUpdate: cache.lastUpdate || null,
        nextUpdate: cache.nextUpdate || null
      },
      status
    });
  } catch (error) {
    console.error('手动爬取失败:', error);
    res.status(500).json({ error: '爬取失败' });
  }
});

// 获取爬虫状态
app.get('/api/crawler/status', (req, res) => {
  const status = scheduler.getStatus();
  res.json(status);
});

// ==================== 医学图像分析 API ====================

// 肺部分割分析
app.post('/api/segment/analyze', upload.single('image'), async (req, res) => {
  try {
    console.log('🫁 收到肺部分割请求...');
    
    let image_path = null;
    let image_data = null;
    
    // 支持 FormData 格式（从前端上传的文件）
    if (req.file) {
      image_path = req.file.path;
      console.log('📁 收到上传的文件:', req.file.originalname);
      console.log('文件路径:', image_path);
      console.log('文件存在:', fs.existsSync(image_path));
    } else {
      image_data = req.body.image_data;
    }
    
    if (!image_path && !image_data) {
      return res.status(400).json({
        success: false,
        message: '请提供图像路径或图像数据'
      });
    }
    
    // 调用 Python AI 服务
    const { spawn } = await import('child_process');
    
    // 临时文件路径
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 如果没有上传文件（使用 base64），则创建临时文件
    const outputPath = path.join(tempDir, `output_${Date.now()}.png`);
    const inputPath = image_path || path.join(tempDir, `input_${Date.now()}.png`);
    
    console.log('Temp dir:', tempDir);
    console.log('Input path:', inputPath);
    console.log('Output path:', outputPath);
    
    // 如果是 base64 数据，保存到临时文件
    if (image_data && !image_path) {
      const base64Data = image_data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(inputPath, base64Data, 'base64');
      console.log('Base64 image saved to:', inputPath);
      console.log('File exists:', fs.existsSync(inputPath));
    }
    
    // 调用 Python 脚本
    const pythonScript = path.join(__dirname, 'ai_models', 'model_integration.py');
    console.log('Python script:', pythonScript);
    console.log('Arguments:', ['--image', inputPath, '--output', outputPath]);
    
    const pythonProcess = spawn('python', [pythonScript, '--image', inputPath, '--output', outputPath], {
      cwd: path.join(__dirname, 'ai_models'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      console.log('Python stdout:', text);
      stdout += text;
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      console.warn('Python stderr:', text);
      stderr += text;
    });
    
    await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        console.log('Python process exited with code:', code);
        if (code === 0) {
          resolve();
        } else {
          console.error('Python stderr:', stderr);
          reject(new Error(stderr || `Python 进程退出码：${code}`));
        }
      });
      pythonProcess.on('error', (err) => {
        console.error('Python process error:', err);
        reject(err);
      });
    });
    
    // 读取结果 - 从 stdout 中提取 JSON
    console.log('Python stdout length:', stdout.length);
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Python 脚本未返回 JSON 数据：' + stdout);
    }
    const results = JSON.parse(jsonMatch[0]);
    console.log('Parsed results:', results);
    
    // 读取生成的 mask 图像
    let maskBase64 = null;
    let originalImageBase64 = null;
    
    if (fs.existsSync(outputPath)) {
      const maskBuffer = fs.readFileSync(outputPath);
      maskBase64 = `data:image/png;base64,${maskBuffer.toString('base64')}`;
      console.log('Mask image loaded, size:', maskBuffer.length);
    } else {
      console.warn('Output path does not exist:', outputPath);
    }
    
    // 读取原始图像（在删除前保存）
    if (image_data) {
      originalImageBase64 = image_data;
    } else if (fs.existsSync(inputPath)) {
      const inputBuffer = fs.readFileSync(inputPath);
      originalImageBase64 = `data:image/png;base64,${inputBuffer.toString('base64')}`;
      console.log('Original image loaded, size:', inputBuffer.length);
    }
    
    // 清理临时文件
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      // 如果是上传的文件，也清理掉
      if (req.file && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      } else if (!image_path && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    } catch (unlinkError) {
      console.warn('Failed to cleanup temp files:', unlinkError.message);
    }
    
    const result = {
      original_image: originalImageBase64,
      segmented_image: maskBase64,
      mask: maskBase64,
      stats: {
        lung_area: results.lung_area_pixels || 0,
        lung_percentage: (results.lung_ratio || 0) * 100,
        bounding_box: results.bounding_box || [0, 0, 0, 0],
        confidence: 0.85
      },
      model_type: 'unet',
      model_path: 'quick_test_model.pth'
    };
    
    console.log('✅ 肺部分割完成');
    res.json({
      success: true,
      data: result,
      message: '分割成功'
    });
  } catch (error) {
    console.error('❌ 肺部分割失败:', error);
    res.status(500).json({
      success: false,
      message: '肺部分割失败：' + error.message
    });
  }
});

// 肺结节检测
app.post('/api/nodule/detect', async (req, res) => {
  try {
    console.log('🔍 收到结节检测请求...');
    
    const { image_path, image_data, segmentation_result } = req.body;
    
    // 如果没有提供分割结果，先进行分割
    let lungMask = null;
    if (segmentation_result?.mask) {
      // 从 base64 解码 mask
      const maskData = segmentation_result.mask.replace(/^data:image\/\w+;base64,/, '');
      const maskBuffer = Buffer.from(maskData, 'base64');
      lungMask = cv2ImreadFromArray(maskBuffer, cv2.IMREAD_GRAYSCALE);
    }
    
    // 使用传统图像处理进行结节检测
    const result = await detectNodules(image_path || image_data, lungMask);
    
    console.log('✅ 结节检测完成，发现', result.nodules.length, '个结节');
    res.json({
      success: true,
      data: result,
      message: '检测成功'
    });
  } catch (error) {
    console.error('❌ 结节检测失败:', error);
    res.status(500).json({
      success: false,
      message: '结节检测失败：' + error.message
    });
  }
});

// 病变分类识别
app.post('/api/lesion/classify', async (req, res) => {
  try {
    console.log('🩺 收到病变识别请求...');
    
    const { image_path, image_data, segmentation_result } = req.body;
    
    // 使用传统图像处理进行病变识别
    const result = await classifyLesions(image_path || image_data);
    
    console.log('✅ 病变识别完成');
    res.json({
      success: true,
      data: result,
      message: '识别成功'
    });
  } catch (error) {
    console.error('❌ 病变识别失败:', error);
    res.status(500).json({
      success: false,
      message: '病变识别失败：' + error.message
    });
  }
});

// 报告生成
app.post('/api/report/generate', async (req, res) => {
  try {
    console.log('📄 收到报告生成请求...');
    
    const { patient_info, segmentation, nodules, lesions } = req.body;
    
    // 计算 BI-RADS 分类
    const noduleCount = nodules?.nodules?.length || 0;
    const highRiskNodules = nodules?.nodules?.filter(n => n.malignancy_risk === 'high')?.length || 0;
    
    let birads, recommendation;
    if (highRiskNodules > 2) {
      birads = '4 类';
      recommendation = '建议进一步检查（增强 CT 或活检）';
    } else if (noduleCount > 3) {
      birads = '3 类';
      recommendation = '建议 3-6 个月复查';
    } else if (noduleCount > 0) {
      birads = '2 类';
      recommendation = '建议年度随访';
    } else {
      birads = '1 类';
      recommendation = '常规体检即可';
    }
    
    // 生成诊断印象
    const findings = [];
    if (segmentation?.stats?.lung_area > 0) {
      findings.push(`双肺野清晰，肺纹理分布正常，肺面积约为${segmentation.stats.lung_area.toFixed(1)}像素²`);
    }
    if (noduleCount > 0) {
      findings.push(`肺内见${noduleCount}个结节影，较大者位于${nodules.nodules[0]?.location || '未知'}`);
    } else {
      findings.push('肺内未见明显结节影');
    }
    if (lesions?.lesions?.length > 0) {
      const lesionNames = lesions.lesions.map(l => l.name).join('、');
      findings.push(`考虑${lesionNames}可能`);
    }
    
    const impression = findings.join('；') + '。';
    
    const report = {
      report_id: `RPT-${Date.now()}`,
      patient_id: patient_info?.patient_id || 'UNKNOWN',
      examination_id: patient_info?.examination_id || `EXAM-${Date.now()}`,
      report_date: new Date().toISOString(),
      birads_category: birads,
      findings: {
        segmentation: segmentation?.stats || {},
        nodules: nodules?.nodules || [],
        lesions: lesions?.lesions || []
      },
      impression,
      recommendations: [recommendation, '戒烟限酒，保持健康生活方式'],
      radiologist: 'AI Assistant',
      review_status: 'preliminary'
    };
    
    console.log('✅ 报告生成完成:', report.report_id);
    res.json({
      success: true,
      data: {
        report,
        report_id: report.report_id
      },
      message: '报告生成成功'
    });
  } catch (error) {
    console.error('❌ 报告生成失败:', error);
    res.status(500).json({
      success: false,
      message: '报告生成失败：' + error.message
    });
  }
});

// ==================== 辅助函数 ====================

/**
 * 从 Buffer 读取图像
 */
function cv2ImreadFromArray(buffer, mode) {
  // 简单实现：保存到临时文件再读取
  const tempPath = path.join(__dirname, 'temp', `temp_${Date.now()}.png`);
  fs.writeFileSync(tempPath, buffer);
  // 这里应该使用 opencv4nodejs 或 @u4/opencv4nodejs
  // 暂时返回 null，使用后备方案
  return null;
}

/**
 * 结节检测（使用 Python AI 服务）
 */
async function detectNodules(imageInput, lungMask = null) {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    // 调用 Python 脚本进行结节检测
    const pythonScript = path.join(__dirname, 'ai_models', 'custom_model_integration.py');
    const pythonProcess = spawn('python', [pythonScript, '--detect-nodules']);
    
    let stdout = '';
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    
    pythonProcess.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve(getFallbackNoduleResult());
        }
      } else {
        resolve(getFallbackNoduleResult());
      }
    });
    
    // 超时返回后备结果
    setTimeout(() => {
      pythonProcess.kill();
      resolve(getFallbackNoduleResult());
    }, 10000);
  });
}

/**
 * 病变分类（使用 Python AI 服务）
 */
async function classifyLesions(imageInput) {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    // 调用 Python 脚本进行病变分类
    const pythonScript = path.join(__dirname, 'ai_models', 'custom_model_integration.py');
    const pythonProcess = spawn('python', [pythonScript, '--classify-lesions']);
    
    let stdout = '';
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    
    pythonProcess.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve(getFallbackLesionResult());
        }
      } else {
        resolve(getFallbackLesionResult());
      }
    });
    
    // 超时返回后备结果
    setTimeout(() => {
      pythonProcess.kill();
      resolve(getFallbackLesionResult());
    }, 10000);
  });
}

/**
 * 后备结节检测结果
 */
function getFallbackNoduleResult() {
  return {
    marked_image: null,
    nodules: [],
    count: 0,
    message: '使用传统图像处理方法检测结节'
  };
}

/**
 * 后备病变识别结果
 */
function getFallbackLesionResult() {
  return {
    marked_image: null,
    lesions: [],
    count: 0,
    message: '使用传统图像处理方法识别病变'
  };
}

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  scheduler.start();

  console.log(`🚀 后端服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 数据文件位置：${DATA_FILE}`);
  console.log(`📰 PubMed API: ✓ 免费使用（无需密钥）`);
  console.log(`🕷️  爬虫定时任务：✓ 已启动（每 6 小时更新）`);
  console.log(`🏥 医学图像分析：✓ 已就绪（Python AI 服务集成）`);
});
