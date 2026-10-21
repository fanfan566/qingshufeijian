"""
U-Net 肺部分割模型训练脚本

使用公开数据集（如 LIDC-IDRI、LUNA16）训练肺部分割模型
"""
import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import numpy as np
from pathlib import Path
from tqdm import tqdm
from loguru import logger
import matplotlib.pyplot as plt

from app.models.unet import UNet2D
from app.config import settings


class LungSegmentationDataset(Dataset):
    """
    肺部分割数据集
    
    支持格式：
    - PNG/JPG 图像 + 对应的掩码文件
    - 目录结构：
      data/
        images/
          img1.png
          img2.png
        masks/
          img1.png
          img2.png
    """
    
    def __init__(self, root_dir, transform=None):
        self.root_dir = Path(root_dir)
        self.transform = transform
        self.image_dir = self.root_dir / 'images'
        self.mask_dir = self.root_dir / 'masks'
        
        # 获取所有图像文件
        self.images = list(self.image_dir.glob('*.png')) + \
                     list(self.image_dir.glob('*.jpg'))
        
        logger.info(f"📊 加载数据集：{len(self.images)} 张图像")
    
    def __len__(self):
        return len(self.images)
    
    def __getitem__(self, idx):
        img_path = self.images[idx]
        mask_path = self.mask_dir / img_path.name
        
        # 读取图像和掩码
        from PIL import Image
        image = Image.open(img_path).convert('L')
        mask = Image.open(mask_path).convert('L')
        
        # 调整大小
        image = image.resize((512, 512))
        mask = mask.resize((512, 512))
        
        # 转换为数组
        image = np.array(image, dtype=np.float32) / 255.0
        mask = np.array(mask, dtype=np.float32)
        mask[mask > 0] = 1  # 二值化
        
        # 添加通道维度
        image = np.expand_dims(image, axis=0)
        mask = np.expand_dims(mask, axis=0)
        
        return torch.from_numpy(image), torch.from_numpy(mask)


class Trainer:
    """U-Net 训练器"""
    
    def __init__(self, model, train_loader, val_loader, device, lr=1e-4):
        self.model = model.to(device)
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.device = device
        self.lr = lr
        
        # 损失函数和优化器
        self.criterion = nn.BCEWithLogitsLoss()
        self.optimizer = optim.Adam(model.parameters(), lr=lr)
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', factor=0.5, patience=5, verbose=True
        )
        
        # 训练历史
        self.history = {
            'train_loss': [],
            'val_loss': [],
            'train_iou': [],
            'val_iou': []
        }
    
    def train_epoch(self):
        """训练一个 epoch"""
        self.model.train()
        running_loss = 0.0
        running_iou = 0.0
        
        for images, masks in tqdm(self.train_loader, desc="Training"):
            images = images.to(self.device)
            masks = masks.to(self.device)
            
            # 前向传播
            self.optimizer.zero_grad()
            outputs = self.model(images)
            loss = self.criterion(outputs, masks)
            
            # 反向传播
            loss.backward()
            self.optimizer.step()
            
            running_loss += loss.item()
            running_iou += calculate_iou(outputs, masks)
        
        epoch_loss = running_loss / len(self.train_loader)
        epoch_iou = running_iou / len(self.train_loader)
        
        return epoch_loss, epoch_iou
    
    @torch.no_grad()
    def validate(self):
        """验证"""
        self.model.eval()
        running_loss = 0.0
        running_iou = 0.0
        
        for images, masks in tqdm(self.val_loader, desc="Validating"):
            images = images.to(self.device)
            masks = masks.to(self.device)
            
            outputs = self.model(images)
            loss = self.criterion(outputs, masks)
            
            running_loss += loss.item()
            running_iou += calculate_iou(outputs, masks)
        
        epoch_loss = running_loss / len(self.val_loader)
        epoch_iou = running_iou / len(self.val_loader)
        
        return epoch_loss, epoch_iou
    
    def train(self, num_epochs, save_path='best_model.pth'):
        """完整训练"""
        logger.info(f"🚀 开始训练，{num_epochs} 个 epochs")
        
        best_iou = 0.0
        
        for epoch in range(num_epochs):
            logger.info(f"\n{'='*50}")
            logger.info(f"Epoch {epoch+1}/{num_epochs}")
            logger.info(f"{'='*50}")
            
            # 训练
            train_loss, train_iou = self.train_epoch()
            
            # 验证
            val_loss, val_iou = self.validate()
            
            # 记录历史
            self.history['train_loss'].append(train_loss)
            self.history['val_loss'].append(val_loss)
            self.history['train_iou'].append(train_iou)
            self.history['val_iou'].append(val_iou)
            
            # 打印结果
            logger.info(f"Train Loss: {train_loss:.4f} | Train IoU: {train_iou:.4f}")
            logger.info(f"Val Loss: {val_loss:.4f} | Val IoU: {val_iou:.4f}")
            
            # 学习率调整
            self.scheduler.step(val_loss)
            
            # 保存最佳模型
            if val_iou > best_iou:
                best_iou = val_iou
                torch.save({
                    'epoch': epoch,
                    'model_state_dict': self.model.state_dict(),
                    'optimizer_state_dict': self.optimizer.state_dict(),
                    'loss': val_loss,
                    'iou': val_iou,
                }, save_path)
                logger.info(f"✅ 保存最佳模型：{save_path} (IoU: {val_iou:.4f})")
        
        # 绘制训练曲线
        self.plot_history()
        
        logger.info(f"\n🎉 训练完成！最佳验证 IoU: {best_iou:.4f}")
        
        return self.history
    
    def plot_history(self):
        """绘制训练历史曲线"""
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 5))
        
        # Loss 曲线
        ax1.plot(self.history['train_loss'], label='Train Loss')
        ax1.plot(self.history['val_loss'], label='Val Loss')
        ax1.set_xlabel('Epoch')
        ax1.set_ylabel('Loss')
        ax1.set_title('Training and Validation Loss')
        ax1.legend()
        ax1.grid(True)
        
        # IoU 曲线
        ax2.plot(self.history['train_iou'], label='Train IoU')
        ax2.plot(self.history['val_iou'], label='Val IoU')
        ax2.set_xlabel('Epoch')
        ax2.set_ylabel('IoU')
        ax2.set_title('Training and Validation IoU')
        ax2.legend()
        ax2.grid(True)
        
        plt.tight_layout()
        plt.savefig('training_history.png', dpi=300)
        logger.info(f"📊 训练曲线已保存：training_history.png")


def calculate_iou(outputs, masks):
    """计算 IoU (Intersection over Union)"""
    outputs = torch.sigmoid(outputs) > 0.5
    intersection = (outputs & masks).float().sum()
    union = (outputs | masks).float().sum()
    
    if union == 0:
        return 0.0
    
    iou = (intersection / union).item()
    return iou


def download_public_dataset():
    """
    下载公开数据集
    可选数据集：
    1. LIDC-IDRI (需要申请)
    2. LUNA16 (https://luna16.grand-challenge.org/)
    3. COVID-19-CT (GitHub)
    """
    logger.info("📥 下载公开数据集...")
    
    # 这里提供数据集下载的框架
    # 实际使用时需要根据具体数据集的 API 或下载链接实现
    
    dataset_urls = {
        'LUNA16': 'https://luna16.grand-challenge.org/Data/',
        'COVID-19-CT': 'https://github.com/UCSD-AI4H/COVID-CT',
        'LIDC-IDRI': 'https://wiki.cancerimagingarchive.net/display/Public/LIDC-IDRI'
    }
    
    logger.info("请访问以下数据集网站下载数据：")
    for name, url in dataset_urls.items():
        logger.info(f"  - {name}: {url}")
    
    logger.info("\n下载后请将数据放置在 data/raw/ 目录")


def main():
    """主函数"""
    logger.info("🚀 开始训练 U-Net 肺部分割模型")
    
    # 配置
    DATA_DIR = Path('data/processed')
    MODEL_SAVE_PATH = Path('data/models/lung_unet_best.pth')
    BATCH_SIZE = 8
    NUM_EPOCHS = 100
    LEARNING_RATE = 1e-4
    
    # 检查数据集
    if not DATA_DIR.exists():
        logger.warning("⚠️ 数据集不存在，请先下载数据")
        download_public_dataset()
        return
    
    # 设备
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"使用设备：{device}")
    
    # 创建数据集
    train_dataset = LungSegmentationDataset(DATA_DIR / 'train')
    val_dataset = LungSegmentationDataset(DATA_DIR / 'val')
    
    # 数据加载器
    train_loader = DataLoader(
        train_dataset, 
        batch_size=BATCH_SIZE, 
        shuffle=True,
        num_workers=4
    )
    val_loader = DataLoader(
        val_dataset, 
        batch_size=BATCH_SIZE, 
        shuffle=False,
        num_workers=4
    )
    
    # 创建模型
    model = UNet2D(in_channels=1, out_channels=2)
    
    # 创建训练器
    trainer = Trainer(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device,
        lr=LEARNING_RATE
    )
    
    # 开始训练
    history = trainer.train(
        num_epochs=NUM_EPOCHS,
        save_path=str(MODEL_SAVE_PATH)
    )
    
    logger.info("✅ 训练完成！")


if __name__ == '__main__':
    main()
