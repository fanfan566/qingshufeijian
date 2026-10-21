"""
Lung Segmentation Model Training Script

This script trains a lung segmentation model using the preprocessed LIDC-IDRI dataset.
It uses pseudo-labels generated from traditional image processing techniques.
"""

import os
import sys
# Set UTF-8 encoding for Windows
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
import json


# ==================== Dataset Definition ====================

class LungSegmentationDataset(Dataset):
    """Lung Segmentation Dataset"""
    
    def __init__(self, images_dir: str, image_size: int = 512, augment: bool = False):
        """
        Args:
            images_dir: Directory with images
            image_size: Image size
            augment: Whether to use data augmentation
        """
        self.images_dir = Path(images_dir)
        self.image_size = image_size
        self.augment = augment
        
        # Load image list
        self.image_paths = sorted(self.images_dir.glob('*.png'))
        
        print(f"Loaded {len(self.image_paths)} images")
    
    def __len__(self):
        return len(self.image_paths)
    
    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        
        # Load image
        image = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            print(f"Warning: Failed to load {img_path}")
            # Return a blank image as fallback
            image = np.zeros((self.image_size, self.image_size), dtype=np.uint8)
        
        image = cv2.resize(image, (self.image_size, self.image_size))
        
        # Data augmentation
        if self.augment:
            image = self.augment_image(image)
        
        # Normalize
        image = image.astype(np.float32) / 255.0
        image = torch.from_numpy(image).unsqueeze(0)  # (1, H, W)
        
        return image
    
    def augment_image(self, image):
        """Simple data augmentation"""
        # Random horizontal flip
        if np.random.random() > 0.5:
            image = cv2.flip(image, 1)
        
        # Random rotation (-10 to 10 degrees)
        angle = np.random.uniform(-10, 10)
        h, w = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        image = cv2.warpAffine(image, M, (w, h), borderMode=cv2.BORDER_REFLECT)
        
        return image


# ==================== Model Definition ====================

class UNet(nn.Module):
    """Simple U-Net for segmentation"""
    
    def __init__(self, n_channels=1, n_classes=1):
        super(UNet, self).__init__()
        
        def double_conv(in_channels, out_channels):
            return nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(out_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True)
            )
        
        self.enc1 = double_conv(n_channels, 64)
        self.enc2 = double_conv(64, 128)
        self.enc3 = double_conv(128, 256)
        self.enc4 = double_conv(256, 512)
        
        self.pool = nn.MaxPool2d(2)
        
        self.bottleneck = double_conv(512, 1024)
        
        self.upconv4 = nn.ConvTranspose2d(1024, 512, 2, stride=2)
        self.dec4 = double_conv(1024, 512)
        
        self.upconv3 = nn.ConvTranspose2d(512, 256, 2, stride=2)
        self.dec3 = double_conv(512, 256)
        
        self.upconv2 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.dec2 = double_conv(256, 128)
        
        self.upconv1 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec1 = double_conv(128, 64)
        
        self.conv_final = nn.Conv2d(64, n_classes, 1)
    
    def forward(self, x):
        # Encoder
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        
        # Bottleneck
        b = self.bottleneck(self.pool(e4))
        
        # Decoder
        d4 = self.upconv4(b)
        d4 = torch.cat([d4, e4], dim=1)
        d4 = self.dec4(d4)
        
        d3 = self.upconv3(d4)
        d3 = torch.cat([d3, e3], dim=1)
        d3 = self.dec3(d3)
        
        d2 = self.upconv2(d3)
        d2 = torch.cat([d2, e2], dim=1)
        d2 = self.dec2(d2)
        
        d1 = self.upconv1(d2)
        d1 = torch.cat([d1, e1], dim=1)
        d1 = self.dec1(d1)
        
        return torch.sigmoid(self.conv_final(d1))


# ==================== Trainer ====================

class Trainer:
    """Trainer for lung segmentation model"""
    
    def __init__(self, train_dir: str, batch_size: int = 8, 
                 lr: float = 1e-4, num_epochs: int = 50, device: str = 'cuda'):
        """
        Args:
            train_dir: Training data directory
            batch_size: Batch size
            lr: Learning rate
            num_epochs: Number of epochs
            device: Training device
        """
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device}")
        
        # Dataset
        self.train_dataset = LungSegmentationDataset(train_dir, augment=True)
        self.train_loader = DataLoader(
            self.train_dataset, batch_size=batch_size, shuffle=True, num_workers=0
        )
        
        # Model
        self.model = UNet().to(self.device)
        
        # Loss and optimizer
        self.criterion = nn.BCELoss()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', patience=5, factor=0.5
        )
        
        # Training stats
        self.num_epochs = num_epochs
        self.best_loss = float('inf')
    
    def generate_pseudo_labels(self, images: torch.Tensor) -> torch.Tensor:
        """
        Generate pseudo labels using traditional image processing
        """
        pseudo_masks = []
        
        for img in images.cpu().numpy():
            img_uint8 = (img[0] * 255).astype(np.uint8)
            
            # Threshold segmentation
            _, mask = cv2.threshold(img_uint8, 60, 255, cv2.THRESH_BINARY_INV)
            
            # Morphological operations
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
            
            # Find largest contour
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if len(contours) > 0:
                largest_contour = max(contours, key=cv2.contourArea)
                lung_mask = np.zeros_like(mask)
                cv2.drawContours(lung_mask, [largest_contour], -1, 255, -1)
                mask = lung_mask
            
            # Normalize to 0-1
            mask = (mask > 127).astype(np.float32)
            pseudo_masks.append(torch.from_numpy(mask))
        
        return torch.stack(pseudo_masks).unsqueeze(1).to(self.device)
    
    def train_epoch(self):
        """Train one epoch"""
        self.model.train()
        total_loss = 0
        
        pbar = tqdm(self.train_loader, desc='Training')
        for images in pbar:
            images = images.to(self.device)
            
            # Forward pass
            outputs = self.model(images)
            
            # Generate pseudo labels
            pseudo_masks = self.generate_pseudo_labels(images)
            
            # Compute loss
            loss = self.criterion(outputs, pseudo_masks)
            
            # Backward pass
            self.optimizer.zero_grad()
            loss.backward()
            self.optimizer.step()
            
            total_loss += loss.item()
            pbar.set_postfix({'loss': f'{loss.item():.4f}'})
        
        return total_loss / len(self.train_loader)
    
    def save_checkpoint(self, epoch, path):
        """Save checkpoint"""
        torch.save({
            'epoch': epoch,
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'best_loss': self.best_loss,
        }, path)
    
    def train(self, output_dir: str):
        """Train the model"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        print(f"\nStarting training for {self.num_epochs} epochs...")
        print("=" * 60)
        
        for epoch in range(self.num_epochs):
            print(f"\nEpoch {epoch + 1}/{self.num_epochs}")
            
            # Train
            train_loss = self.train_epoch()
            
            # Update learning rate
            self.scheduler.step(train_loss)
            
            # Save best model
            if train_loss < self.best_loss:
                self.best_loss = train_loss
                self.save_checkpoint(epoch, output_path / 'best_model.pth')
                print(f"Saved best model (loss: {train_loss:.4f})")
            
            # Save checkpoint every 10 epochs
            if (epoch + 1) % 10 == 0:
                self.save_checkpoint(epoch, output_path / f'checkpoint_epoch_{epoch + 1}.pth')
        
        # Save final model
        self.save_checkpoint(self.num_epochs - 1, output_path / 'final_model.pth')
        
        print("\n" + "=" * 60)
        print("Training completed!")
        print(f"Best model saved to: {output_path / 'best_model.pth'}")


def main():
    """Main function"""
    # Paths
    train_dir = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed\images'
    output_dir = r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\lung_segmentation'
    
    # Training parameters (optimized for faster training)
    batch_size = 16  # Increased for faster training
    num_epochs = 20  # Reduced for quick testing
    lr = 1e-3  # Higher learning rate for faster convergence
    
    print("=" * 60)
    print("Lung Segmentation Model Training")
    print("=" * 60)
    print(f"\nTraining data: {train_dir}")
    print(f"Output directory: {output_dir}")
    print(f"Batch size: {batch_size}")
    print(f"Number of epochs: {num_epochs}")
    print(f"Learning rate: {lr}")
    print("=" * 60)
    
    # Create trainer
    trainer = Trainer(
        train_dir=train_dir,
        batch_size=batch_size,
        lr=lr,
        num_epochs=num_epochs
    )
    
    # Train
    trainer.train(output_dir)
    
    print("\nNext step: Integrate the trained model into the application")


if __name__ == '__main__':
    print("Checking dependencies...")
    try:
        import torch
        import cv2
        import numpy as np
        print("All dependencies installed")
        main()
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("\nPlease run: pip install torch torchvision opencv-python tqdm")
