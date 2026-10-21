"""
使用原始 Swin Transformer UNet 训练肺部分割

基于 D:\ican 中的原始代码
"""

import sys
from pathlib import Path

# 添加原始代码到路径
original_code_path = Path(__file__).parent / 'swin_unet_original'
sys.path.insert(0, str(original_code_path))

import torch
from networks.swin_transformer_unet_skip_expand_decoder_sys import SwinTransformerUNet
from torch.utils.data import DataLoader
import cv2
import numpy as np
from tqdm import tqdm
import os

# ==================== 数据集定义 ====================

class LIDCDataset(torch.utils.data.Dataset):
    """LIDC-IDRI 肺部分割数据集"""
    
    def __init__(self, data_dir: str, image_size: int = 224):
        self.data_dir = Path(data_dir)
        self.image_size = image_size
        
        # 加载图像列表
        self.image_paths = list((self.data_dir / 'images').glob('*.png'))
        
        print(f"📊 加载了 {len(self.image_paths)} 张图像")
    
    def __len__(self):
        return len(self.image_paths)
    
    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        
        # 加载图像
        image = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
        
        # 调整大小
        image = cv2.resize(image, (self.image_size, self.image_size))
        
        # 生成伪标签（使用简单阈值）
        _, mask = cv2.threshold(image, 60, 255, cv2.THRESH_BINARY_INV)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
        
        # 找到最大轮廓作为肺部
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            largest = max(contours, key=cv2.contourArea)
            mask_clean = np.zeros_like(mask)
            cv2.drawContours(mask_clean, [largest], -1, 255, -1)
        else:
            mask_clean = mask
        
        # 归一化
        image = image.astype(np.float32) / 255.0
        mask = mask_clean.astype(np.float32) / 255.0
        
        # 转换为 tensor
        image = torch.from_numpy(image).unsqueeze(0).float()
        mask = torch.from_numpy(mask).unsqueeze(0).float()
        
        return image, mask


# ==================== 训练函数 ====================

def train_lung_segmentation(
    data_dir: str = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed',
    save_dir: str = r'D:\Lang P\Lang-Protector-main\ai_models\models\lung_segmentation',
    batch_size: int = 2,
    num_epochs: int = 50,
    lr: float = 1e-4,
    image_size: int = 224
):
    """训练肺部分割模型"""
    
    # 设备
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🖥️  使用设备：{device}")
    
    if device.type == 'cpu':
        print("⚠️  警告：使用 CPU 训练会很慢，建议使用 GPU")
    
    # 数据集
    train_dataset = LIDCDataset(data_dir, image_size=image_size)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    
    # 模型
    print("🏗️  加载 Swin Transformer UNet...")
    model = SwinTransformerUNet(
        img_size=image_size,
        num_classes=1
    ).to(device)
    
    # 损失函数和优化器
    criterion = torch.nn.BCEWithLogitsLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', patience=5, factor=0.5
    )
    
    # 保存目录
    save_path = Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)
    
    # 训练循环
    print("\n" + "=" * 60)
    print("开始训练 Swin Transformer UNet")
    print("=" * 60)
    
    best_loss = float('inf')
    
    for epoch in range(num_epochs):
        model.train()
        total_loss = 0
        
        pbar = tqdm(train_loader, desc=f'Epoch {epoch+1}/{num_epochs}')
        for images, masks in pbar:
            images = images.to(device)
            masks = masks.to(device)
            
            # 前向传播
            outputs = model(images)
            
            # 计算损失
            loss = criterion(outputs, masks)
            
            # 反向传播
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            pbar.set_postfix({'loss': f'{loss.item():.4f}'})
        
        avg_loss = total_loss / len(train_loader)
        print(f"平均训练损失：{avg_loss:.4f}")
        
        # 学习率调整
        scheduler.step(avg_loss)
        
        # 保存最佳模型
        if avg_loss < best_loss:
            best_loss = avg_loss
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'loss': best_loss,
            }, save_path / 'swin_unet_best.pth')
            print(f"✓ 保存最佳模型（损失：{best_loss:.4f}）")
        
        # 定期保存
        if (epoch + 1) % 10 == 0:
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'loss': avg_loss,
            }, save_path / f'swin_unet_epoch_{epoch+1}.pth')
    
    print("\n" + "=" * 60)
    print("✅ 训练完成！")
    print("=" * 60)
    print(f"最佳模型保存在：{save_path / 'swin_unet_best.pth'}")


if __name__ == '__main__':
    print("=" * 60)
    print("使用原始 Swin Transformer UNet 训练肺部分割")
    print("=" * 60)
    
    # 检查依赖
    print("\n📦 检查依赖...")
    try:
        import timm
        print("✓ timm 已安装")
    except ImportError:
        print("❌ timm 未安装，请运行：pip install timm")
        exit(1)
    
    # 检查数据
    data_dir = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed'
    if not os.path.exists(data_dir):
        print(f"\n❌ 数据目录不存在：{data_dir}")
        print("请先运行：train.bat (数据预处理)")
        exit(1)
    
    # 开始训练
    train_lung_segmentation(
        data_dir=data_dir,
        batch_size=2,  # 根据显存调整
        num_epochs=50,
        lr=1e-4,
        image_size=224
    )
