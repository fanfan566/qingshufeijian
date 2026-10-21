"""
AI Service API for Node.js Backend

This module provides a simple API for the Node.js backend to call Python AI models.
Usage:
    python ai_service.py --image <input_image> --output <output_mask>
    
Or import as a module:
    from ai_service import segment_lung
    result = segment_lung('input.png', 'output.png')
"""

import sys
import json
import numpy as np
import cv2
from pathlib import Path

# Import model integration
from model_integration import LungSegmentationModel, segment_lung


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='AI Service API')
    parser.add_argument('--image', type=str, required=True, help='Input image path')
    parser.add_argument('--output', type=str, help='Output mask path (optional)')
    parser.add_argument('--json', action='store_true', help='Output JSON only (no image)')
    
    args = parser.parse_args()
    
    try:
        # Load image
        image = cv2.imread(args.image, cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(f"Failed to load image: {args.image}")
        
        # Create model
        model = LungSegmentationModel()
        
        if model.model is None:
            # No trained model available, use fallback segmentation
            print("Warning: No trained model found, using fallback segmentation", file=sys.stderr)
            mask = fallback_segmentation(image)
            results = {
                'lung_area_pixels': int(np.sum(mask > 0)),
                'lung_ratio': float(np.sum(mask > 0) / (mask.shape[0] * mask.shape[1])),
                'bounding_box': [0, 0, image.shape[1], image.shape[0]],
                'fallback': True
            }
        else:
            # Use trained model
            results = model.analyze(image)
        
        # Save mask if output path provided
        if args.output and not args.json:
            cv2.imwrite(args.output, results['mask'])
        
        # Remove mask from JSON output (not serializable)
        del results['mask']
        
        # Output JSON
        print(json.dumps(results, indent=2))
        
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)


def fallback_segmentation(image: np.ndarray) -> np.ndarray:
    """
    Fallback segmentation using traditional image processing
    Used when no trained model is available
    """
    # Threshold segmentation
    _, mask = cv2.threshold(image, 60, 255, cv2.THRESH_BINARY_INV)
    mask = mask.astype(np.uint8)
    
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
    
    return mask


if __name__ == '__main__':
    main()
