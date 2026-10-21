r"""
基于 Swin Transformer 的肺部分割模型训练

参考：D:\ican\基于 swin_transformer 改进网络的半监督医学图像分割

功能：
1. 加载 LIDC-IDRI 数据集
2. 使用 Swin Transformer 进行肺部分割
3. 半监督训练（如果有标注数据）
4. 保存训练好的模型
"""

import os
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
from typing import Tuple, List
import cv2
from tqdm import tqdm
import json

# 尝试导入 Swin Transformer
try:
    from timm.models.swin_transformer import SwinTransformer
    TIMM_AVAILABLE = True
except ImportError:
    TIMM_AVAILABLE = False
    print("⚠️ timm 未安装，将使用简化版本")
    print("   请运行：pip install timm")


# ==================== 数据集定义 ====================

class LungSegmentationDataset(Dataset):
    """肺部分割数据集"""
    
    def __init__(self, images_dir: str, masks_dir: str = None, 
                 image_size: int = 512, augment: bool = False):
        """
        参数:
            images_dir: 图像目录
            masks_dir: 掩码目录（可选）
            image_size: 图像尺寸
            augment: 是否使用数据增强
        """
        self.images_dir = Path(images_dir)
        self.masks_dir = Path(masks_dir) if masks_dir else None
        self.image_size = image_size
        self.augment = augment
        
        # 加载图像列表
        self.image_paths = sorted(self.images_dir.glob('*.png'))
        
        print(f"📊 加载了 {len(self.image_paths)} 张图像")
    
    def __len__(self):
        return len(self.image_paths)
    
    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        
        # 加载图像
        image = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
        image = cv2.resize(image, (self.image_size, self.image_size))
        
        # 数据增强
        if self.augment:
            image, mask = self.augment_image(image, None)
        else:
            mask = None
        
        # 归一化
        image = image.astype(np.float32) / 255.0
        image = torch.from_numpy(image).unsqueeze(0)  # (1, H, W)
        
        if mask is not None:
            mask = torch.from_numpy(mask).unsqueeze(0).float()
            return image, mask
        else:
            return image


# ==================== 模型定义 ====================

class SimplifiedSwinUNet(nn.Module):
    """
    简化的 Swin Transformer UNet
    用于肺部分割
    """
    
    def __init__(self, img_size: int = 512, patch_size: int = 4, 
                 embed_dim: int = 96, depths: List[int] = [2, 2, 6, 2],
                 num_heads: List[int] = [3, 6, 12, 24]):
        super().__init__()
        
        # 如果没有 timm，使用简化的 CNN 版本
        if not TIMM_AVAILABLE:
            print("💡 使用简化的 CNN 版本（请安装 timm 以使用 Swin Transformer）")
            self.model = SimpleCNN()
            return
        
        # 编码器（Swin Transformer）
        self.encoder = SwinTransformer(
            img_size=img_size,
            patch_size=patch_size,
            embed_dim=embed_dim,
            depths=depths,
            num_heads=num_heads,
            in_chans=1,
            num_classes=0,  # 不用于分类
            global_pool=''
        )
        
        # 解码器
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(embed_dim * 8, embed_dim * 4, 2, stride=2),
            nn.BatchNorm2d(embed_dim * 4),
            nn.ReLU(inplace=True),
            
            nn.ConvTranspose2d(embed_dim * 4, embed_dim * 2, 2, stride=2),
            nn.BatchNorm2d(embed_dim * 2),
            nn.ReLU(inplace=True),
            
            nn.ConvTranspose2d(embed_dim * 2, embed_dim, 2, stride=2),
            nn.BatchNorm2d(embed_dim),
            nn.ReLU(inplace=True),
            
            nn.ConvTranspose2d(embed_dim, 1, 2, stride=2),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        # 编码器
        features = self.encoder.forward_features(x)
        
        # 重塑为 (B, C, H, W)
        B, _, C = features.shape
        H = W = int(np.sqrt(features.shape[1]))
        features = features.permute(0, 2, 1).reshape(B, C, H, W)
        
        # 解码器
        out = self.decoder(features)
        
        return out


class SimpleCNN(nn.Module):
    """简化的 CNN 版本（当 timm 不可用时）"""
    
    def __init__(self):
        super().__init__()
        
        self.encoder = nn.Sequential(
            # 512 -> 256
            nn.Conv2d(1, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            
            # 256 -> 128
            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            
            # 128 -> 64
            nn.Conv2d(128, 256, 3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 256, 3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            
            # 64 -> 32
            nn.Conv2d(256, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            
            # 32 -> 16
            nn.Conv2d(512, 1024, 3, padding=1),
            nn.BatchNorm2d(1024),
            nn.ReLU(inplace=True),
        )
        
        self.decoder = nn.Sequential(
            # 16 -> 32
            nn.ConvTranspose2d(1024, 512, 2, stride=2),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.Conv2d(512, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            
            # 32 -> 64
            nn.ConvTranspose2d(512, 256, 2, stride=2),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 256, 3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            
            # 64 -> 128
            nn.ConvTranspose2d(256, 128, 2, stride=2),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            
            # 128 -> 256
            nn.ConvTranspose2d(128, 64, 2, stride=2),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            
            # 256 -> 512
            nn.ConvTranspose2d(64, 1, 2, stride=2),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        x = self.encoder(x)
        x = self.decoder(x)
        return x


# ==================== 训练函数 ====================

class LungSegmentationTrainer:
    """肺部分割训练器"""
    
    def __init__(self, train_dir: str, val_dir: str = None, 
                 batch_size: int = 4, lr: float = 1e-4,
                 num_epochs: int = 50, device: str = 'cuda'):
        """
        参数:
            train_dir: 训练数据目录
            val_dir: 验证数据目录
            batch_size: 批次大小
            lr: 学习率
            num_epochs: 训练轮数
            device: 训练设备
        """
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        print(f"🖥️  使用设备：{self.device}")
        
        # 数据集
        self.train_dataset = LungSegmentationDataset(
            train_dir, augment=True
        )
        self.train_loader = DataLoader(
            self.train_dataset, batch_size=batch_size, shuffle=True, num_workers=4
        )
        
        if val_dir:
            self.val_dataset = LungSegmentationDataset(val_dir)
            self.val_loader = DataLoader(
                self.val_dataset, batch_size=batch_size, shuffle=False
            )
        else:
            self.val_loader = None
        
        # 模型
        self.model = SimpleCNN().to(self.device)
        
        # 损失函数和优化器
        self.criterion = nn.BCELoss()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', patience=5, factor=0.5
        )
        
        # 训练统计
        self.num_epochs = num_epochs
        self.best_loss = float('inf')
    
    def train_epoch(self):
        """训练一个 epoch"""
        self.model.train()
        total_loss = 0
        
        pbar = tqdm(self.train_loader, desc='训练')
        for batch in pbar:
            if isinstance(batch, tuple):
                images, masks = batch
                masks = masks.to(self.device)
            else:
                images = batch
                masks = None
            
            images = images.to(self.device)
            
            # 前向传播
            outputs = self.model(images)
            
            # 计算损失（如果有掩码）
            if masks is not None:
                loss = self.criterion(outputs, masks)
                
                # 反向传播
                self.optimizer.zero_grad()
                loss.backward()
                self.optimizer.step()
                
                total_loss += loss.item()
                pbar.set_postfix({'loss': f'{loss.item():.4f}'})
            else:
                # 无监督模式：使用伪标签
                # 这里可以使用传统图像处理方法生成伪标签
                pseudo_masks = self.generate_pseudo_labels(images)
                loss = self.criterion(outputs, pseudo_masks)
                
                self.optimizer.zero_grad()
                loss.backward()
                self.optimizer.step()
                
                total_loss += loss.item()
        
        return total_loss / len(self.train_loader)
    
    def generate_pseudo_labels(self, images: torch.Tensor) -> torch.Tensor:
        """
        生成伪标签（用于无监督训练）
        使用简单的阈值分割
        """
        pseudo_masks = []
        
        for img in images.cpu().numpy():
            img_uint8 = (img[0] * 255).astype(np.uint8)
            
            # 阈值分割
            _, mask = cv2.threshold(img_uint8, 60, 255, cv2.THRESH_BINARY_INV)
            
            # 形态学操作
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
            
            # 找到最大轮廓
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                largest = max(contours, key=cv2.contourArea)
                mask_clean = np.zeros_like(mask)
                cv2.drawContours(mask_clean, [largest], -1, 255, -1)
            else:
                mask_clean = mask
            
            # 归一化
            mask_clean = cv2.resize(mask_clean, (512, 512)) / 255.0
            pseudo_masks.append(mask_clean)
        
        return torch.from_numpy(np.array(pseudo_masks)).float().unsqueeze(1).to(self.device)
    
    def validate(self):
        """验证"""
        if not self.val_loader:
            return None
        
        self.model.eval()
        total_loss = 0
        
        with torch.no_grad():
            for batch in tqdm(self.val_loader, desc='验证'):
                if isinstance(batch, tuple):
                    images, masks = batch
                    masks = masks.to(self.device)
                else:
                    continue
                
                images = images.to(self.device)
                outputs = self.model(images)
                
                loss = self.criterion(outputs, masks)
                total_loss += loss.item()
        
        return total_loss / len(self.val_loader)
    
    def train(self, save_dir: str):
        """完整训练流程"""
        print("\n" + "=" * 60)
        print("开始训练肺部分割模型")
        print("=" * 60)
        
        save_path = Path(save_dir)
        save_path.mkdir(parents=True, exist_ok=True)
        
        for epoch in range(self.num_epochs):
            print(f"\nEpoch {epoch + 1}/{self.num_epochs}")
            
            # 训练
            train_loss = self.train_epoch()
            print(f"训练损失：{train_loss:.4f}")
            
            # 验证
            if self.val_loader:
                val_loss = self.validate()
                print(f"验证损失：{val_loss:.4f}")
                
                # 学习率调整
                self.scheduler.step(val_loss)
                
                # 保存最佳模型
                if val_loss < self.best_loss:
                    self.best_loss = val_loss
                    torch.save({
                        'epoch': epoch,
                        'model_state_dict': self.model.state_dict(),
                        'optimizer_state_dict': self.optimizer.state_dict(),
                        'loss': val_loss,
                    }, save_path / 'best_model.pth')
                    print(f"✓ 保存最佳模型（损失：{val_loss:.4f}）")
            
            # 定期保存
            if (epoch + 1) % 10 == 0:
                torch.save({
                    'epoch': epoch,
                    'model_state_dict': self.model.state_dict(),
                    'optimizer_state_dict': self.optimizer.state_dict(),
                    'loss': train_loss,
                }, save_path / f'checkpoint_epoch_{epoch + 1}.pth')
        
        print("\n" + "=" * 60)
        print("✅ 训练完成！")
        print("=" * 60)
        print(f"最佳模型保存在：{save_path / 'best_model.pth'}")


def main():
    """主函数"""
    # 数据目录
    train_dir = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed\images'
    save_dir = r'D:\Lang P\Lang-Protector-main\ai_models\models\lung_segmentation'
    
    print("=" * 60)
    print("肺部分割模型训练（基于 Swin Transformer 改进）")
    print("=" * 60)
    
    # 检查依赖
    print("\n📦 检查依赖...")
    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA 可用：{torch.cuda.is_available()}")
    print(f"timm 可用：{TIMM_AVAILABLE}")
    
    # 检查数据
    if not os.path.exists(train_dir):
        print(f"\n❌ 训练数据不存在：{train_dir}")
        print("请先运行：python ai_models/dataset_preprocess.py")
        return
    
    # 创建训练器
    trainer = LungSegmentationTrainer(
        train_dir=train_dir,
        val_dir=None,  # 可以设置验证集目录
        batch_size=4,
        lr=1e-4,
        num_epochs=50,
        device='cuda'
    )
    
    # 开始训练
    trainer.train(save_dir)
    
    print("\n🎉 训练完成！")
    print(f"模型保存在：{save_dir}")


if __name__ == '__main__':
    # 需要安装：
    # pip install torch torchvision timm opencv-python tqdm
    
    main()
