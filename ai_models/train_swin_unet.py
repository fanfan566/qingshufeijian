"""
Swin Transformer UNet Training Script

使用您提供的 Swin Transformer UNet 架构训练肺部图像分割模型
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


# ==================== Swin Transformer UNet (简化版) ====================

class WindowAttention(nn.Module):
    """Window Multi-head Self-Attention"""
    def __init__(self, dim, window_size, num_heads=4):
        super().__init__()
        self.dim = dim
        self.window_size = window_size
        self.num_heads = num_heads
        head_dim = dim // num_heads
        self.scale = head_dim ** -0.5
        
        self.qkv = nn.Linear(dim, dim * 3)
        self.proj = nn.Linear(dim, dim)
        self.softmax = nn.Softmax(dim=-1)
    
    def forward(self, x):
        B, H, W, C = x.shape
        
        # Reshape to windows
        x = x.view(B, H // self.window_size, self.window_size, W // self.window_size, self.window_size, C)
        x = x.permute(0, 1, 3, 2, 4, 5).contiguous()
        x = x.view(B * (H // self.window_size) * (W // self.window_size), self.window_size * self.window_size, C)
        
        # QKV
        qkv = self.qkv(x).reshape(-1, self.window_size * self.window_size, 3, self.num_heads, C // self.num_heads).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]
        
        # Attention
        attn = (q @ k.transpose(-2, -1)) * self.scale
        attn = self.softmax(attn)
        
        # Output
        x = (attn @ v).transpose(1, 2).reshape(-1, self.window_size * self.window_size, C)
        x = self.proj(x)
        
        # Reshape back
        x = x.view(B, H // self.window_size, W // self.window_size, self.window_size, self.window_size, C)
        x = x.permute(0, 1, 3, 2, 4, 5).contiguous()
        x = x.view(B, H, W, C)
        
        return x


class SwinTransformerBlock(nn.Module):
    """Swin Transformer Block"""
    def __init__(self, dim, window_size=8, num_heads=4):
        super().__init__()
        self.window_size = window_size
        self.attn = WindowAttention(dim, window_size, num_heads)
        self.mlp = nn.Sequential(
            nn.Linear(dim, dim * 2),
            nn.GELU(),
            nn.Linear(dim * 2, dim)
        )
        self.norm1 = nn.LayerNorm(dim)
        self.norm2 = nn.LayerNorm(dim)
    
    def forward(self, x):
        # x shape: (B, C, H, W)
        B, C, H, W = x.shape
        
        # Residual connection
        shortcut = x
        # Reshape for LayerNorm: (B, C, H, W) -> (B, H*W, C)
        x = x.permute(0, 2, 3, 1).contiguous()  # (B, H, W, C)
        x = x.view(B, H * W, C)
        x = self.norm1(x)
        x = x.view(B, H, W, C)
        
        # Attention
        x = self.attn(x)  # (B, H, W, C)
        
        # Reshape back
        x = x.permute(0, 3, 1, 2).contiguous()  # (B, C, H, W)
        x = x + shortcut
        
        # MLP
        shortcut = x
        x = x.permute(0, 2, 3, 1).contiguous()  # (B, H, W, C)
        x = x.view(B, H * W, C)
        x = self.norm2(x)
        x = x.view(B, H, W, C)
        x = self.mlp(x)
        
        # Reshape back
        x = x.permute(0, 3, 1, 2).contiguous()  # (B, C, H, W)
        x = x + shortcut
        
        return x


class SwinUNet(nn.Module):
    """Swin Transformer UNet for Medical Image Segmentation"""
    
    def __init__(self, img_size=256, in_channels=1, num_classes=1, 
                 embed_dim=64, depths=[2, 2, 2, 2], num_heads=[4, 8, 16, 32],
                 window_size=8):
        super().__init__()
        
        self.img_size = img_size
        self.embed_dim = embed_dim
        self.window_size = window_size
        
        # Encoder
        self.enc1 = self._make_encoder_stage(in_channels, embed_dim, depths[0], num_heads[0])
        self.enc2 = self._make_encoder_stage(embed_dim, embed_dim*2, depths[1], num_heads[1])
        self.enc3 = self._make_encoder_stage(embed_dim*2, embed_dim*4, depths[2], num_heads[2])
        self.enc4 = self._make_encoder_stage(embed_dim*4, embed_dim*8, depths[3], num_heads[3])
        
        self.pool = nn.MaxPool2d(2)
        
        # Bottleneck
        self.bottleneck = SwinTransformerBlock(embed_dim*8, window_size, num_heads[3])
        
        # Decoder
        self.up3 = nn.ConvTranspose2d(embed_dim*8, embed_dim*4, 2, stride=2)
        self.dec3 = self._make_decoder_stage(embed_dim*8, embed_dim*4, depths[2], num_heads[2])
        
        self.up2 = nn.ConvTranspose2d(embed_dim*4, embed_dim*2, 2, stride=2)
        self.dec2 = self._make_decoder_stage(embed_dim*4, embed_dim*2, depths[1], num_heads[1])
        
        self.up1 = nn.ConvTranspose2d(embed_dim*2, embed_dim, 2, stride=2)
        self.dec1 = self._make_decoder_stage(embed_dim*2, embed_dim, depths[0], num_heads[0])
        
        self.final = nn.Conv2d(embed_dim, num_classes, 1)
    
    def _make_encoder_stage(self, in_ch, out_ch, depth, num_heads):
        layers = []
        layers.append(nn.Conv2d(in_ch, out_ch, 3, padding=1))
        layers.append(nn.ReLU())
        for _ in range(depth):
            layers.append(SwinTransformerBlock(out_ch, self.window_size, num_heads))
        return nn.Sequential(*layers)
    
    def _make_decoder_stage(self, in_ch, out_ch, depth, num_heads):
        layers = []
        layers.append(nn.Conv2d(in_ch, out_ch, 3, padding=1))
        layers.append(nn.ReLU())
        for _ in range(depth):
            layers.append(SwinTransformerBlock(out_ch, self.window_size, num_heads))
        return nn.Sequential(*layers)
    
    def forward(self, x):
        # Encoder
        e1 = self.enc1(x)  # (B, C, H, W) -> (B, H, W, C)
        e1 = e1.permute(0, 2, 3, 1).contiguous()
        e1 = e1.view(e1.shape[0], -1, e1.shape[3])
        e1 = e1.view(e1.shape[0], self.img_size, self.img_size, -1)
        e1 = e1.permute(0, 3, 1, 2).contiguous()
        
        e2 = self.enc2(self.pool(e1))
        e2 = e2.permute(0, 2, 3, 1).contiguous()
        e2 = e2.view(e2.shape[0], -1, e2.shape[3])
        e2 = e2.view(e2.shape[0], self.img_size//2, self.img_size//2, -1)
        e2 = e2.permute(0, 3, 1, 2).contiguous()
        
        e3 = self.enc3(self.pool(e2))
        e3 = e3.permute(0, 2, 3, 1).contiguous()
        e3 = e3.view(e3.shape[0], -1, e3.shape[3])
        e3 = e3.view(e3.shape[0], self.img_size//4, self.img_size//4, -1)
        e3 = e3.permute(0, 3, 1, 2).contiguous()
        
        e4 = self.enc4(self.pool(e3))
        e4 = e4.permute(0, 2, 3, 1).contiguous()
        e4 = e4.view(e4.shape[0], -1, e4.shape[3])
        e4 = e4.view(e4.shape[0], self.img_size//8, self.img_size//8, -1)
        e4 = e4.permute(0, 3, 1, 2).contiguous()
        
        # Bottleneck
        b = self.bottleneck(e4.permute(0, 2, 3, 1).contiguous())
        b = b.permute(0, 3, 1, 2).contiguous()
        
        # Decoder
        d3 = self.up3(b)
        d3 = torch.cat([d3, e3], dim=1)
        d3 = self.dec3(d3.permute(0, 2, 3, 1).contiguous())
        d3 = d3.permute(0, 3, 1, 2).contiguous()
        
        d2 = self.up2(d3)
        d2 = torch.cat([d2, e2], dim=1)
        d2 = self.dec2(d2.permute(0, 2, 3, 1).contiguous())
        d2 = d2.permute(0, 3, 1, 2).contiguous()
        
        d1 = self.up1(d2)
        d1 = torch.cat([d1, e1], dim=1)
        d1 = self.dec1(d1.permute(0, 2, 3, 1).contiguous())
        d1 = d1.permute(0, 3, 1, 2).contiguous()
        
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
        
        torch.save(self.model.state_dict(), output_path / 'swin_unet_final.pth')
        print(f"\nModel saved to: {output_path / 'swin_unet_final.pth'}")


def main():
    print("=" * 60)
    print("Swin Transformer UNet Training")
    print("=" * 60)
    
    train_dir = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed\images'
    output_dir = r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\swin_unet'
    
    trainer = Trainer(train_dir, batch_size=4, lr=1e-4, num_epochs=50)
    trainer.train(output_dir)


if __name__ == '__main__':
    try:
        import torch, cv2, numpy
        print("Dependencies OK")
        main()
    except ImportError as e:
        print(f"Missing: {e}")
