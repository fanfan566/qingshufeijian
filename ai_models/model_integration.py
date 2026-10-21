"""
Lung Segmentation Model Integration

This module integrates the trained lung segmentation model into the backend API.
It provides functions for:
1. Loading the trained model
2. Performing lung segmentation on CT images
3. Generating segmentation masks and analysis results
"""

import os
import sys
import numpy as np
import torch
import torch.nn as nn
import cv2
from pathlib import Path
from PIL import Image
import io


# ==================== Model Definition (same as training) ====================

class SimpleUNet(nn.Module):
    """Simple U-Net for segmentation (matches quick_train.py)"""
    
    def __init__(self):
        super().__init__()
        self.enc1 = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(),
            nn.Conv2d(32, 32, 3, padding=1), nn.ReLU()
        )
        self.pool = nn.MaxPool2d(2)
        self.enc2 = nn.Sequential(
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=1), nn.ReLU()
        )
        self.bottleneck = nn.Sequential(
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(),
            nn.Conv2d(128, 128, 3, padding=1), nn.ReLU()
        )
        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec2 = nn.Sequential(
            nn.Conv2d(128, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=1), nn.ReLU()
        )
        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.dec1 = nn.Sequential(
            nn.Conv2d(64, 32, 3, padding=1), nn.ReLU(),
            nn.Conv2d(32, 32, 3, padding=1), nn.ReLU()
        )
        self.final = nn.Conv2d(32, 1, 1)
    
    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        b = self.bottleneck(self.pool(e2))
        d2 = self.dec2(torch.cat([self.up2(b), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))
        return torch.sigmoid(self.final(d1))


class LungSegmentationModel:
    """Lung Segmentation Model Wrapper"""
    
    def __init__(self, model_path: str = None, device: str = 'cpu'):
        """
        Args:
            model_path: Path to trained model weights
            device: Device to run inference on ('cpu' or 'cuda')
        """
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.model_path = model_path
        
        # Default model paths to check
        self.default_paths = [
            r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\swin_unet\swin_unet_final.pth',  # Swin Transformer (优先)
            r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\lung_segmentation\quick_test_model.pth',  # Simple U-Net
            r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\lung_segmentation\best_model.pth',
            r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\lung_segmentation\final_model.pth',
        ]
        
        if model_path is None:
            # Try to find any trained model
            self.model_path = self._find_model()
        
        if self.model_path and os.path.exists(self.model_path):
            self.load_model()
        else:
            print(f"Warning: No trained model found at {self.model_path}")
            print("Model will be initialized but not loaded.")
    
    def _find_model(self) -> str:
        """Find available model file"""
        for path in self.default_paths:
            if os.path.exists(path):
                print(f"Found model: {path}")
                # Determine model type
                if 'swin_unet' in path:
                    self.model_type = 'swin_unet'
                    print("Using Swin Transformer UNet (推荐)")
                else:
                    self.model_type = 'simple_unet'
                    print("Using Simple U-Net")
                return path
        
        # Search in directory
        model_dir = r'D:\Lang P\Lang-Protector-main\ai_models\trained_models\lung_segmentation'
        if os.path.exists(model_dir):
            for file in Path(model_dir).glob('*.pth'):
                print(f"Found model: {file}")
                return str(file)
        
        return None
    
    def load_model(self):
        """Load trained model weights"""
        if not self.model_path:
            raise ValueError("No model path specified")
        
        print(f"Loading model from: {self.model_path}")
        
        # Initialize model
        self.model = SimpleUNet().to(self.device)
        
        # Load weights
        checkpoint = torch.load(self.model_path, map_location=self.device)
        self.model.load_state_dict(checkpoint)
        self.model.eval()
        
        print(f"Model loaded successfully on {self.device}")
    
    def preprocess_image(self, image: np.ndarray, target_size: int = 256) -> torch.Tensor:
        """
        Preprocess image for model input
        
        Args:
            image: Input image (numpy array)
            target_size: Target size for resizing
            
        Returns:
            Preprocessed tensor
        """
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            image = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # Resize
        image = cv2.resize(image, (target_size, target_size))
        
        # Normalize
        image = image.astype(np.float32) / 255.0
        
        # Add batch and channel dimensions
        image = np.expand_dims(np.expand_dims(image, 0), 0)
        
        return torch.from_numpy(image).to(self.device)
    
    def predict(self, image: np.ndarray) -> np.ndarray:
        """
        Perform lung segmentation
        
        Args:
            image: Input CT image
            
        Returns:
            Segmentation mask (same size as input)
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Please provide a valid model path.")
        
        original_shape = image.shape[:2]
        
        # Preprocess
        input_tensor = self.preprocess_image(image)
        
        # Inference
        with torch.no_grad():
            output = self.model(input_tensor)
        
        # Post-process
        mask = output.cpu().numpy()[0, 0]
        mask = (mask > 0.5).astype(np.uint8) * 255
        
        # Resize back to original size
        mask = cv2.resize(mask, (original_shape[1], original_shape[0]))
        
        return mask
    
    def analyze(self, image: np.ndarray) -> dict:
        """
        Perform segmentation and analysis
        
        Args:
            image: Input CT image
            
        Returns:
            Dictionary with segmentation results
        """
        # Get segmentation mask
        mask = self.predict(image)
        
        # Calculate statistics
        total_pixels = mask.shape[0] * mask.shape[1]
        lung_pixels = np.sum(mask > 0)
        lung_ratio = lung_pixels / total_pixels
        
        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Calculate bounding box
        if len(contours) > 0:
            all_points = np.vstack(contours)
            x, y, w, h = cv2.boundingRect(all_points)
            bbox = [int(x), int(y), int(w), int(h)]
        else:
            bbox = [0, 0, 0, 0]
        
        return {
            'mask': mask,
            'lung_area_pixels': int(lung_pixels),
            'lung_ratio': float(lung_ratio),
            'bounding_box': bbox,
            'num_contours': len(contours)
        }


# ==================== API Integration Functions ====================

def segment_lung(image_path: str, output_path: str = None) -> dict:
    """
    Segment lung from CT image
    
    Args:
        image_path: Path to input CT image
        output_path: Optional path to save segmentation mask
        
    Returns:
        Dictionary with results
    """
    # Load image
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"Failed to load image: {image_path}")
    
    # Create model and predict
    model = LungSegmentationModel()
    results = model.analyze(image)
    
    # Save mask if output path provided
    if output_path:
        cv2.imwrite(output_path, results['mask'])
        results['mask_path'] = output_path
    
    # Remove mask from results (not JSON serializable)
    del results['mask']
    
    return results


def process_dicom_series(dicom_paths: list, output_dir: str) -> dict:
    """
    Process a series of DICOM images
    
    Args:
        dicom_paths: List of DICOM file paths
        output_dir: Directory to save results
        
    Returns:
        Dictionary with processing results
    """
    import pydicom
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    model = LungSegmentationModel()
    results = []
    
    for i, dicom_path in enumerate(dicom_paths):
        try:
            # Read DICOM
            ds = pydicom.dcmread(dicom_path)
            
            # Skip if no pixel data
            if not hasattr(ds, 'pixel_array') or ds.get('PixelData') is None:
                continue
            
            # Get image
            image = ds.pixel_array
            image = ((image - image.min()) / (image.max() - image.min()) * 255).astype(np.uint8)
            
            # Segment
            analysis = model.analyze(image)
            
            # Save mask
            mask_path = output_path / f'slice_{i:03d}_mask.png'
            cv2.imwrite(str(mask_path), analysis['mask'])
            
            results.append({
                'slice_index': i,
                'dicom_path': str(dicom_path),
                'mask_path': str(mask_path),
                'lung_area': analysis['lung_area_pixels'],
                'lung_ratio': analysis['lung_ratio']
            })
            
        except Exception as e:
            print(f"Error processing {dicom_path}: {e}")
            continue
    
    return {
        'total_slices': len(results),
        'results': results
    }


# ==================== CLI Interface ====================

if __name__ == '__main__':
    import argparse
    import json
    
    parser = argparse.ArgumentParser(description='Lung Segmentation Model Integration')
    parser.add_argument('--image', type=str, help='Path to input CT image')
    parser.add_argument('--output', type=str, help='Path to save segmentation mask')
    parser.add_argument('--model', type=str, help='Path to trained model')
    parser.add_argument('--test', action='store_true', help='Run test inference')
    
    args = parser.parse_args()
    
    if args.test:
        # Test with a sample image
        print("Running test inference...")
        model = LungSegmentationModel(args.model)
        
        if model.model is None:
            print("No model available. Please train a model first.")
        else:
            # Create test image
            test_image = np.random.randint(0, 255, (512, 512), dtype=np.uint8)
            mask = model.predict(test_image)
            print(f"Test successful! Mask shape: {mask.shape}")
            print(f"Mask stats: min={mask.min()}, max={mask.max()}, mean={mask.mean()}")
    
    elif args.image:
        # Process single image
        results = segment_lung(args.image, args.output)
        print(json.dumps(results, indent=2))
    
    else:
        parser.print_help()
