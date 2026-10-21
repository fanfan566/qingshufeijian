# 🫁 医学图像分析系统 - 完整部署指南

## 📋 目录

1. [系统架构](#系统架构)
2. [快速开始](#快速开始)
3. [后端部署](#后端部署)
4. [模型训练](#模型训练)
5. [前端集成](#前端集成)
6. [API 使用](#api 使用)
7. [常见问题](#常见问题)

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React)                        │
│  - 图像上传                                             │
│  - 结果可视化                                           │
│  - 报告展示                                             │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTP/REST API
                         ▼
┌─────────────────────────────────────────────────────────┐
│               后端 (FastAPI + PyTorch)                  │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │ 肺部分割 │ 结节检测 │ 病变识别 │ 报告生成 │         │
│  │  U-Net   │ ResNet   │ EfficientNet│ 模板   │         │
│  └────────────────────┴────────────────────┘         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  模型仓库                               │
│  - lung_unet_best.pth      (肺部分割)                  │
│  - nodule_detector.pth     (结节检测)                  │
│  - lesion_classifier.pth   (病变识别)                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1. 环境要求

- Python 3.8+
- Node.js 16+
- GPU (推荐，用于加速推理)
- 8GB+ RAM

### 2. 一键启动（开发模式）

```bash
# 克隆项目
cd d:\Lang P\Lang-Protector-main

# 安装后端依赖
cd backend
pip install -r requirements.txt

# 启动后端服务
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 新开终端，启动前端
cd ..
npm run dev
```

访问：
- 前端：http://localhost:5174
- 后端 API 文档：http://localhost:8000/docs

---

## 🖥️ 后端部署

### 步骤 1：安装 Python 依赖

```bash
cd backend
pip install -r requirements.txt
```

### 步骤 2：下载预训练模型

我们提供两种方式的模型：

#### 方案 A：使用演示模型（立即可用）

```bash
# 无需下载，系统会自动使用模拟模式
# 适合快速测试和演示
```

#### 方案 B：使用真实 AI 模型（推荐生产环境）

```bash
# 1. 下载预训练模型（提供百度网盘链接）
# 链接：https://pan.baidu.com/s/1xxxxx
# 提取码：abcd

# 2. 或使用 HuggingFace
# huggingface-cli download your-username/lung-segmentation-model

# 3. 将模型文件放到 data/models/ 目录
mkdir -p data/models
mv lung_unet_best.pth data/models/
mv nodule_detector.pth data/models/
mv lesion_classifier.pth data/models/
```

### 步骤 3：启动服务

```bash
# 开发模式（自动重载）
python -m uvicorn app.main:app --reload

# 生产模式
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 步骤 4：验证服务

```bash
# 健康检查
curl http://localhost:8000/health

# 测试 API
curl -X POST http://localhost:8000/api/segment/analyze \
  -F "image=@test_image.png" \
  -F "enhance_contrast=true" \
  -F "reduce_noise=true"
```

---

## 🧠 模型训练

### 步骤 1：准备数据集

#### 公开数据集推荐

1. **LIDC-IDRI** (肺部 CT + 标注)
   - 网址：https://wiki.cancerimagingarchive.net/display/Public/LIDC-IDRI
   - 需要申请访问权限
   - 包含 1018 例患者的胸部 CT 和专家标注

2. **LUNA16** (肺结节检测)
   - 网址：https://luna16.grand-challenge.org/
   - 包含 888 例 CT 扫描和结节标注
   - 适合结节检测任务

3. **COVID-19-CT** (免费开放)
   - GitHub: https://github.com/UCSD-AI4H/COVID-CT
   - 包含 349 例 COVID-19 患者的 CT 图像

#### 数据预处理

```bash
# 运行数据预处理脚本
python scripts/preprocess_data.py \
  --input data/raw/LIDC-IDRI \
  --output data/processed \
  --split 0.8
```

### 步骤 2：训练 U-Net 模型

```bash
# 开始训练
python train_unet.py \
  --data-dir data/processed \
  --epochs 100 \
  --batch-size 8 \
  --lr 0.0001
```

训练完成后，模型保存在 `data/models/lung_unet_best.pth`

### 步骤 3：训练结节检测模型

```bash
# 使用 YOLOv5 或 Faster R-CNN
python train_nodule_detector.py \
  --data data/processed/luna16.yaml \
  --epochs 50 \
  --batch-size 16
```

### 步骤 4：评估模型

```bash
# 在测试集上评估
python evaluate.py \
  --model data/models/lung_unet_best.pth \
  --test-data data/processed/test
```

预期指标：
- 肺部分割 IoU: > 0.95
- 结节检测敏感度：> 0.90
- 病变分类准确率：> 0.85

---

## 🎨 前端集成

### 步骤 1：配置后端 API 地址

修改前端配置文件，设置后端 API 地址：

```typescript
// src/config/api.ts
export const API_BASE_URL = 'http://localhost:8000/api';
// 生产环境改为：
// export const API_BASE_URL = 'https://your-api-domain.com/api';
```

### 步骤 2：更新肺部分割服务

修改 `src/services/lungSegmentationService.ts`，调用真实后端 API：

```typescript
async segment(imageElement: HTMLImageElement, config: SegmentationConfig) {
  // 转换为 Blob
  const canvas = document.createElement('canvas');
  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, 0, 0);
  
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(resolve));
  const formData = new FormData();
  formData.append('image', blob, 'ct-scan.png');
  formData.append('enhance_contrast', String(config.contrastEnhancement));
  formData.append('reduce_noise', String(config.noiseReduction));
  
  // 调用后端 API
  const response = await fetch(`${API_BASE_URL}/segment/analyze`, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('分割失败');
  }
  
  const result = await response.json();
  return result.data;
}
```

### 步骤 3：测试功能

1. 启动后端：`cd backend && uvicorn app.main:app --reload`
2. 启动前端：`npm run dev`
3. 访问 http://localhost:5174/segmentation
4. 上传 CT 图像，点击"开始 AI 分割"

---

## 📡 API 使用

### 1. 肺部分割

```bash
curl -X POST http://localhost:8000/api/segment/analyze \
  -F "image=@chest_ct.png" \
  -F "enhance_contrast=true" \
  -F "reduce_noise=true"
```

响应示例：

```json
{
  "success": true,
  "message": "分割成功",
  "data": {
    "original_image": "base64...",
    "segmented_image": "base64...",
    "mask": "base64...",
    "stats": {
      "lung_area": 125000,
      "lung_percentage": 45.2,
      "left_lung_area": 62000,
      "right_lung_area": 63000,
      "suspicious_nodules": 2,
      "confidence": 0.95
    }
  },
  "processing_time": 1.23
}
```

### 2. 结节检测

```bash
curl -X POST http://localhost:8000/api/nodule/detect \
  -F "image=@chest_ct.png"
```

### 3. 病变识别

```bash
curl -X POST http://localhost:8000/api/lesion/classify \
  -F "image=@chest_ct.png"
```

### 4. 生成报告

```bash
curl -X POST http://localhost:8000/api/report/generate \
  -H "Content-Type: application/json" \
  -d '{
    "patient_info": {
      "patient_id": "P001",
      "patient_name": "张三",
      "patient_age": 55,
      "patient_gender": "男"
    },
    "segmentation": {...},
    "nodules": {...},
    "lesions": {...}
  }'
```

---

## ❓ 常见问题

### Q1: CUDA out of memory

**解决方案**：
```bash
# 减小 batch size
python train_unet.py --batch-size 4

# 或使用梯度累积
python train_unet.py --accumulate 4
```

### Q2: 模型加载失败

**检查**：
1. 模型文件路径是否正确
2. 模型文件是否完整（检查文件大小）
3. PyTorch 版本是否兼容

### Q3: API 响应慢

**优化方案**：
1. 使用 GPU 推理
2. 启用模型量化：`torch.quantization.quantize_dynamic`
3. 使用 TensorRT 加速
4. 增加后端 worker 数量

### Q4: 前端跨域问题

**解决方案**：
后端已配置 CORS，如果还有问题，检查：
```python
# app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174"],  # 改为你的前端地址
    ...
)
```

---

## 📞 技术支持

如有问题，请：
1. 查看日志文件：`logs/app_*.log`
2. 提交 Issue 时附上错误日志
3. 检查系统资源使用情况（GPU 内存、CPU、磁盘空间）

---

## 📄 许可证

本项目仅供学术研究和医疗辅助使用。
