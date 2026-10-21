"""
Quick Training Script for Lung Segmentation
This is a minimal training script to verify the pipeline works.
"""

import os
import sys
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
import cv2
from tqdm import tqdm


class SimpleDataset(Dataset):
    def __init__(self, images_dir, image_size=256):
        self.images_dir = Path(images_dir)
        self.image_size = image_size
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
        image = image.astype(np.float32) / 255.0
        return torch.from_numpy(image).unsqueeze(0)


class SimpleUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.enc1 = nn.Sequential(nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.ReLU())
        self.pool = nn.MaxPool2d(2)
        self.enc2 = nn.Sequential(nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.Conv2d(64, 64, 3, padding=1), nn.ReLU())
        self.bottleneck = nn.Sequential(nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.Conv2d(128, 128, 3, padding=1), nn.ReLU())
        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec2 = nn.Sequential(nn.Conv2d(128, 64, 3, padding=1), nn.ReLU(), nn.Conv2d(64, 64, 3, padding=1), nn.ReLU())
        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.dec1 = nn.Sequential(nn.Conv2d(64, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.ReLU())
        self.final = nn.Conv2d(32, 1, 1)
    
    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        b = self.bottleneck(self.pool(e2))
        d2 = self.dec2(torch.cat([self.up2(b), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))
        return torch.sigmoid(self.final(d1))


def main():
    print("=" * 60)
    print("Quick Training Test")
    print("=" * 60)
    
    train_dir = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed\images'
    output_dir = r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\lung_segmentation'
    
    device = torch.device('cpu')  # Force CPU to avoid CUDA issues
    print(f"Device: {device}")
    
    # Dataset
    dataset = SimpleDataset(train_dir, image_size=256)
    loader = DataLoader(dataset, batch_size=16, shuffle=True, num_workers=0)
    
    # Model
    model = SimpleUNet().to(device)
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    print(f"\nTraining for 5 epochs (quick test)...")
    
    for epoch in range(5):
        model.train()
        total_loss = 0
        
        pbar = tqdm(loader, desc=f'Epoch {epoch+1}/5')
        for batch in pbar:
            images = batch.to(device)
            
            # Forward
            outputs = model(images)
            
            # Generate pseudo labels
            masks = []
            for img in images.cpu().numpy():
                img_uint8 = (img[0] * 255).astype(np.uint8)
                _, mask = cv2.threshold(img_uint8, 60, 255, cv2.THRESH_BINARY_INV)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
                mask = (mask > 127).astype(np.float32)
                masks.append(mask)
            masks = torch.from_numpy(np.array(masks)).unsqueeze(1).to(device)
            
            # Loss
            loss = criterion(outputs, masks)
            
            # Backward
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            pbar.set_postfix({'loss': f'{loss.item():.4f}'})
        
        avg_loss = total_loss / len(loader)
        print(f"Epoch {epoch+1} average loss: {avg_loss:.4f}")
    
    # Save model
    torch.save(model.state_dict(), Path(output_dir) / 'quick_test_model.pth')
    print(f"\nModel saved to: {Path(output_dir) / 'quick_test_model.pth'}")
    print("Training completed!")


if __name__ == '__main__':
    try:
        import torch, cv2, numpy
        print("Dependencies OK")
        main()
    except ImportError as e:
        print(f"Missing: {e}")
