r"""
LIDC-IDRI Lung CT Dataset Loader and Preprocessor

This script is used for:
1. Loading LIDC-IDRI dataset
2. Extracting CT images and nodule annotations
3. Generating training data
4. Saving in training-ready format

Dataset location: D:\Lang P\manifest-1764759073893\LIDC-IDRI
"""

import os
import sys
# Set UTF-8 encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import numpy as np
import pandas as pd
import pydicom
from pathlib import Path
from typing import List, Dict, Tuple
import cv2
import json
from tqdm import tqdm


class LIDCDataLoader:
    """LIDC-IDRI 数据集加载器"""
    
    def __init__(self, data_root: str):
        """
        Args:
            data_root: Root directory of LIDC-IDRI dataset
        """
        self.data_root = Path(data_root)
        self.metadata_file = self.data_root.parent / 'metadata.csv'
        self.patients = []
        self.series_info = {}
        
    def load_metadata(self) -> pd.DataFrame:
        """Load metadata CSV"""
        print("Loading metadata...")
        df = pd.read_csv(self.metadata_file)
        print(f"Loaded {len(df)} records")
        return df
    
    def find_ct_series(self) -> Dict[str, List[Path]]:
        """
        Find all CT series
        
        Returns:
            {patient_id: [dicom_file_paths]}
        """
        print("Scanning CT series...")
        
        ct_series = {}
        found_count = 0
        
        # Iterate through all patient directories
        for patient_dir in self.data_root.glob('LIDC-IDRI-*'):
            patient_id = patient_dir.name
            patient_files = []
            
            # Recursively traverse all subdirectories to find .dcm files
            for root, dirs, files in os.walk(patient_dir):
                for file in files:
                    if file.endswith('.dcm'):
                        patient_files.append(Path(root) / file)
            
            if len(patient_files) > 0:
                # Verify if the first file is CT and has pixel data
                try:
                    ds = pydicom.dcmread(patient_files[0])
                    
                    # Check if it's CT and has pixel data
                    if ds.Modality != 'CT':
                        continue
                    
                    # Check if has pixel data
                    if not hasattr(ds, 'pixel_array') or ds.get('PixelData') is None:
                        print(f"  WARNING: {patient_id}: First file has no pixel data, skipping")
                        continue
                    
                    # Sort by filename
                    sorted_files = sorted(
                        patient_files,
                        key=lambda x: x.stem.split('.')[0] if '.' in x.stem else x.stem
                    )
                    ct_series[patient_id] = sorted_files
                    found_count += 1
                    print(f"  OK: {patient_id}: {len(sorted_files)} CT images")
                except Exception as e:
                    print(f"  WARNING: {patient_id}: Read failed ({e})")
                    continue
        
        print(f"Found CT series for {found_count} patients")
        return ct_series
    
    def load_ct_volume(self, dicom_paths: List[Path]) -> Tuple[np.ndarray, dict]:
        """
        Load CT volume data
        
        Args:
            dicom_paths: List of DICOM file paths
            
        Returns:
            (volume_array, metadata)
        """
        slices = []
        metadata = {}
        skipped_count = 0
        
        for path in tqdm(dicom_paths, desc='Loading CT slices', leave=False):
            try:
                ds = pydicom.dcmread(path)
                
                # Check again for pixel data (some files may be annotations, SR, etc.)
                if not hasattr(ds, 'pixel_array') or ds.get('PixelData') is None:
                    skipped_count += 1
                    continue
                
                # Convert to Hounsfield units
                pixel_array = ds.pixel_array.astype(np.float32)
                if hasattr(ds, 'RescaleSlope') and hasattr(ds, 'RescaleIntercept'):
                    pixel_array = pixel_array * ds.RescaleSlope + ds.RescaleIntercept
                
                slices.append(pixel_array)
                
                # Save metadata
                metadata['patient_id'] = ds.PatientID
                metadata['slice_thickness'] = getattr(ds, 'SliceThickness', 1.0)
                metadata['pixel_spacing'] = getattr(ds, 'PixelSpacing', [1.0, 1.0])
            except Exception as e:
                # Skip problematic files
                skipped_count += 1
                continue
        
        if len(slices) == 0:
            raise ValueError(f"No valid CT slices found")
        
        # Unify all slice dimensions (force standard size 512x512)
        target_height, target_width = 512, 512
        uniform_slices = []
        
        print(f"\nProcessing {len(slices)} CT slices...")
        for i, slice_img in enumerate(slices):
            try:
                # Ensure it's a 2D array
                if slice_img.ndim > 2:
                    # If multi-channel, take first channel or convert to grayscale
                    if slice_img.shape[-1] == 3:
                        slice_img = cv2.cvtColor(slice_img, cv2.COLOR_RGB2GRAY)
                    else:
                        slice_img = slice_img[:, :, 0]
                
                # Resize to standard size
                if slice_img.shape != (target_height, target_width):
                    slice_resized = cv2.resize(slice_img, (target_width, target_height), 
                                              interpolation=cv2.INTER_LINEAR)
                    uniform_slices.append(slice_resized)
                else:
                    uniform_slices.append(slice_img)
                    
            except Exception as e:
                print(f"  Skipping slice {i} (shape: {slice_img.shape}, error: {e})")
                continue
        
        if len(uniform_slices) == 0:
            raise ValueError(f"All slices failed to process")
        
        # Stack along Z-axis
        volume = np.stack(uniform_slices, axis=0)
        
        # Normalize to 0-255 (for visualization)
        volume_normalized = self.normalize_to_uint8(volume)
        
        if skipped_count > 0:
            print(f"  Skipped {skipped_count} invalid files")
        
        return volume_normalized, metadata
    
    def normalize_to_uint8(self, volume: np.ndarray, window_center: int = 40, 
                          window_width: int = 400) -> np.ndarray:
        """
        Normalize CT values to 0-255
        
        Args:
            volume: CT volume data (Hounsfield units)
            window_center: Window center
            window_width: Window width
        """
        # Lung window: center -600, width 1500
        # Mediastinal window: center 40, width 400
        
        min_val = window_center - window_width / 2
        max_val = window_center + window_width / 2
        
        volume_clipped = np.clip(volume, min_val, max_val)
        volume_scaled = (volume_clipped - min_val) / (max_val - min_val) * 255
        
        return volume_scaled.astype(np.uint8)
    
    def extract_lung_roi(self, volume: np.ndarray) -> np.ndarray:
        """
        Extract lung ROI (simple version)
        
        Use threshold segmentation to extract lung regions
        """
        # Take middle slice
        mid_slice_idx = volume.shape[0] // 2
        mid_slice = volume[mid_slice_idx]
        
        # Threshold segmentation (lungs are low-density regions)
        _, mask = cv2.threshold(mid_slice, 60, 255, cv2.THRESH_BINARY_INV)
        mask = mask.astype(np.uint8)
        
        # Morphological operations
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
        
        # Find largest contour (lungs)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if len(contours) == 0:
            # No contours found, return original volume
            print(f"  Warning: No lung contours found, returning original volume")
            return volume
        
        largest_contour = max(contours, key=cv2.contourArea)
        
        # Create mask with same size as a single slice
        lung_mask = np.zeros_like(mid_slice, dtype=np.uint8)
        cv2.drawContours(lung_mask, [largest_contour], -1, 255, -1)
        lung_mask = (lung_mask > 0).astype(bool)
        
        # Apply to all slices
        volume_masked = volume.copy()
        # Expand mask to 3D and apply
        for i in range(volume.shape[0]):
            volume_masked[i][~lung_mask] = 0
        
        return volume_masked
    
    def save_training_data(self, output_dir: str, ct_series: Dict[str, List[Path]]):
        """
        Save as training data format
        
        Output directory structure:
        output_dir/
        ├── images/          # CT images (PNG format)
        │   ├── LIDC-IDRI-0001_slice_001.png
        │   └── ...
        ├── masks/           # Segmentation masks (if available)
        │   └── ...
        └── metadata.json    # Metadata
        """
        output_path = Path(output_dir)
        images_dir = output_path / 'images'
        masks_dir = output_path / 'masks'
        
        images_dir.mkdir(parents=True, exist_ok=True)
        masks_dir.mkdir(parents=True, exist_ok=True)
        
        all_metadata = []
        
        for patient_id, dicom_paths in tqdm(ct_series.items(), desc='Processing patients'):
            # Load CT volume
            volume, meta = self.load_ct_volume(dicom_paths)
            
            # Extract lung ROI
            volume_lung = self.extract_lung_roi(volume)
            
            # Save each slice
            for i, slice_img in enumerate(volume_lung):
                # Save image
                img_path = images_dir / f'{patient_id}_slice_{i:03d}.png'
                cv2.imwrite(str(img_path), slice_img)
                
                # Save metadata
                slice_meta = {
                    'patient_id': patient_id,
                    'slice_index': i,
                    'image_path': str(img_path),
                    'total_slices': len(volume_lung),
                    'pixel_spacing': str(meta.get('pixel_spacing', [1.0, 1.0])),
                    'slice_thickness': meta.get('slice_thickness', 1.0)
                }
                
                all_metadata.append(slice_meta)
        
        # Save metadata
        with open(output_path / 'metadata.json', 'w', encoding='utf-8') as f:
            json.dump(all_metadata, f, indent=2, ensure_ascii=False)
        
        print(f"Saved {len(all_metadata)} images to {output_path}")


def main():
    """Main function"""
    # Dataset paths
    data_root = r'D:\Lang P\manifest-1764759073893\LIDC-IDRI'
    output_root = r'D:\Lang P\Lang-Protector-main\ai_models\datasets\lidc_processed'
    
    print("=" * 60)
    print("LIDC-IDRI Dataset Preprocessing Tool")
    print("=" * 60)
    
    # Create loader
    loader = LIDCDataLoader(data_root)
    
    # Load metadata
    df = loader.load_metadata()
    
    # Find all CT series
    ct_series = loader.find_ct_series()
    
    if len(ct_series) == 0:
        print("ERROR: No CT series found. Please check the dataset path.")
        return
    
    # Save training data
    print(f"\nSaving training data to: {output_root}")
    loader.save_training_data(output_root, ct_series)
    
    print("\n" + "=" * 60)
    print("Preprocessing completed!")
    print("=" * 60)
    print(f"\nOutput directory: {output_root}")
    print("Next step: Train lung segmentation model using these data")


if __name__ == '__main__':
    # Required dependencies:
    # pip install pydicom pandas opencv-python tqdm
    
    print("Checking dependencies...")
    try:
        import pydicom
        import pandas
        import cv2
        print("All dependencies installed")
        main()
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("\nPlease run: pip install pydicom pandas opencv-python tqdm")
