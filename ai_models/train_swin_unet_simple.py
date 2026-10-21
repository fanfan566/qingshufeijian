"""
Swin Transformer UNet Training Script (简化正确版)

使用简化的 Swin Transformer 架构，避免维度问题
"""

import os
import sys
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
import cv2
from tqdm import tqdm


# ==================== 简化的 Swin Transformer Block ====================

class SimpleAttentionBlock(nn.Module):
    """简化的注意力块 - 避免复杂的窗口操作"""
    def __init__(self, dim):
        super().__init__()
        self.attention = nn.Sequential(
            nn.Conv2d(dim, dim, 3, padding=1),
            nn.Sigmoid()
        )
        self.conv = nn.Sequential(
            nn.Conv2d(dim, dim, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(dim, dim, 3, padding=1)
        )
        self.norm = nn.BatchNorm2d(dim)
    
    def forward(self, x):
        attn = self.attention(x)
        out = self.conv(x)
        out = attn * out + x
        out = self.norm(out)
        return out


# ==================== Swin Transformer UNet (简化版) ====================

class SwinUNet(nn.Module):
    """Swin Transformer UNet - 使用简化的注意力机制"""
    
    def __init__(self, img_size=256, in_channels=1, num_classes=1, 
                 embed_dim=64):
        super().__init__()
        
        self.img_size = img_size
        self.embed_dim = embed_dim
        
        # Encoder - CNN + Attention
        self.enc1 = self._make_encoder_stage(in_channels, embed_dim)
        self.enc2 = self._make_encoder_stage(embed_dim, embed_dim*2)
        self.enc3 = self._make_encoder_stage(embed_dim*2, embed_dim*4)
        self.enc4 = self._make_encoder_stage(embed_dim*4, embed_dim*8)
        
        self.pool = nn.MaxPool2d(2)
        
        # Bottleneck - Attention blocks
        self.bottleneck = nn.Sequential(
            *[SimpleAttentionBlock(embed_dim*8) for _ in range(2)]
        )
        
        # Decoder
        self.up3 = nn.ConvTranspose2d(embed_dim*8, embed_dim*4, 2, stride=2)
        self.dec3 = self._make_decoder_stage(embed_dim*8, embed_dim*4)
        
        self.up2 = nn.ConvTranspose2d(embed_dim*4, embed_dim*2, 2, stride=2)
        self.dec2 = self._make_decoder_stage(embed_dim*4, embed_dim*2)
        
        self.up1 = nn.ConvTranspose2d(embed_dim*2, embed_dim, 2, stride=2)
        self.dec1 = self._make_decoder_stage(embed_dim*2, embed_dim)
        
        self.final = nn.Conv2d(embed_dim, num_classes, 1)
    
    def _make_encoder_stage(self, in_ch, out_ch):
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(),
            nn.Conv2d(out_ch, out_ch, 3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(),
            SimpleAttentionBlock(out_ch)
        )
    
    def _make_decoder_stage(self, in_ch, out_ch):
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(),
            nn.Conv2d(out_ch, out_ch, 3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(),
            SimpleAttentionBlock(out_ch)
        )
    
    def forward(self, x):
        # Encoder
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        
        # Bottleneck
        b = self.bottleneck(e4)
        
        # Decoder
        d3 = self.up3(b)
        d3 = torch.cat([d3, e3], dim=1)
        d3 = self.dec3(d3)
        
        d2 = self.up2(d3)
        d2 = torch.cat([d2, e2], dim=1)
        d2 = self.dec2(d2)
        
        d1 = self.up1(d2)
        d1 = torch.cat([d1, e1], dim=1)
        d1 = self.dec1(d1)
        
        return torch.sigmoid(self.final(d1))


# ==================== Dataset ====================

class LungDataset(Dataset):
    def __init__(self, images_dir, image_size=256, augment=False):
        self.images_dir = Path(images_dir)
        self.image_size = image_size
        self.augment = augment
        self.image_paths = sorted(self.images_dir.glob('*.png'))
        print(f"Found {len(self.image_paths)} images")
    
    def __len__(self):
        return len(self.image_paths)
    
    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        image = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            image = np.zeros((self.image_size, self.image_size), dtype=np.uint8)
        
        image = cv2.resize(image, (self.image_size, self.image_size))
        
        if self.augment:
            if np.random.random() > 0.5:
                image = cv2.flip(image, 1)
            angle = np.random.uniform(-10, 10)
            h, w = image.shape[:2]
            M = cv2.getRotationMatrix2D((w//2, h//2), angle, 1.0)
            image = cv2.warpAffine(image, M, (w, h))
        
        image = image.astype(np.float32) / 255.0
        image = torch.from_numpy(image).unsqueeze(0)
        
        return image


# ==================== Trainer ====================

class Trainer:
    def __init__(self, train_dir, batch_size=4, lr=1e-4, num_epochs=50):
        self.device = torch.device('cpu')
        
        self.train_dataset = LungDataset(train_dir, augment=True)
        self.train_loader = DataLoader(self.train_dataset, batch_size=batch_size, shuffle=True)
        
        self.model = SwinUNet(img_size=256, in_channels=1, num_classes=1)
        self.model.to(self.device)
        
        print(f"Model parameters: {sum(p.numel() for p in self.model.parameters()):,}")
        
        self.criterion = nn.BCELoss()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(self.optimizer, patience=5, factor=0.5)
        
        self.num_epochs = num_epochs
    
    def generate_pseudo_labels(self, images):
        masks = []
        for img in images.cpu().numpy():
            img_uint8 = (img[0] * 255).astype(np.uint8)
            _, mask = cv2.threshold(img_uint8, 60, 255, cv2.THRESH_BINARY_INV)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if len(contours) > 0:
                largest = max(contours, key=cv2.contourArea)
                lung_mask = np.zeros_like(mask)
                cv2.drawContours(lung_mask, [largest], -1, 255, -1)
                mask = lung_mask
            mask = (mask > 127).astype(np.float32)
            masks.append(mask)
        return torch.from_numpy(np.array(masks)).unsqueeze(1).to(self.device)
    
    def train(self, output_dir):
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        print(f"\nTraining Swin Transformer UNet for {self.num_epochs} epochs...")
        
        for epoch in range(self.num_epochs):
            self.model.train()
            total_loss = 0
            
            pbar = tqdm(self.train_loader, desc=f'Epoch {epoch+1}/{self.num_epochs}')
            for images in pbar:
                images = images.to(self.device)
                outputs = self.model(images)
                pseudo_masks = self.generate_pseudo_labels(images)
                
                loss = self.criterion(outputs, pseudo_masks)
                
                self.optimizer.zero_grad()
                loss.backward()
                self.optimizer.step()
                
                total_loss += loss.item()
                pbar.set_postfix({'loss': f'{loss.item():.4f}'})
            
            avg_loss = total_loss / len(self.train_loader)
            self.scheduler.step(avg_loss)
            
            if (epoch + 1) % 10 == 0:
                torch.save(self.model.state_dict(), output_path / f'model_epoch_{epoch+1}.pth')
                print(f"Saved checkpoint: model_epoch_{epoch+1}.pth")
        
        torch.save(self.model.state_dict(), output_path / 'swin_unet_final.pth')
        print(f"\n✅ Model saved to: {output_path / 'swin_unet_final.pth'}")


def main():
    print("=" * 60)
    print("Swin Transformer UNet Training (简化版)")
    print("=" * 60)
    
    train_dir = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed\images'
    output_dir = r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\swin_unet'
    
    trainer = Trainer(train_dir, batch_size=4, lr=1e-4, num_epochs=50)
    trainer.train(output_dir)


if __name__ == '__main__':
    try:
        import torch, cv2, numpy
        print("✅ Dependencies OK")
        main()
    except ImportError as e:
        print(f"❌ Missing: {e}")
