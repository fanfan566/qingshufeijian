# 医学图像分析后端服务

基于 FastAPI 的肺部 CT 图像分析后端，提供肺部分割、结节检测和病变识别功能。

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置文件
│   ├── api/                 # API 路由
│   │   ├── __init__.py
│   │   ├── segment.py       # 分割接口
│   │   ├── nodule.py        # 结节检测接口
│   │   └── report.py        # 报告生成接口
│   ├── models/              # 深度学习模型
│   │   ├── __init__.py
│   │   ├── unet.py          # U-Net 分割模型
│   │   ├── nodule_detector.py # 结节检测模型
│   │   └── lesion_classifier.py # 病变分类模型
│   ├── services/            # 业务逻辑
│   │   ├── __init__.py
│   │   ├── image_processor.py # 图像预处理
│   │   ├── segmentation_service.py # 分割服务
│   │   ├── nodule_service.py # 结节服务
│   │   └── report_generator.py # 报告生成
│   └── utils/               # 工具函数
│       ├── __init__.py
│       └── dicom_reader.py  # DICOM 读取
├── data/                    # 数据目录
│   ├── raw/                 # 原始数据
│   ├── processed/           # 处理后数据
│   └── models/              # 训练好的模型
├── notebooks/               # Jupyter notebooks
│   └── train_unet.ipynb
├── requirements.txt         # Python 依赖
├── setup.py                 # 安装配置
└── README.md               # 项目说明
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 下载预训练模型

```bash
python scripts/download_models.py
```

### 3. 启动服务

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 访问 API 文档

打开浏览器访问：http://localhost:8000/docs

## API 端点

- `POST /api/segment` - 肺部分割
- `POST /api/nodule/detect` - 结节检测
- `POST /api/lesion/classify` - 病变分类
- `POST /api/report/generate` - 生成诊断报告

## 技术栈

- **Web 框架**: FastAPI
- **深度学习**: PyTorch, MONAI
- **图像处理**: SimpleITK, pydicom, OpenCV
- **数据处理**: NumPy, Pandas
- **API 文档**: Swagger UI / ReDoc
