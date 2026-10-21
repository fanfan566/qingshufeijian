@echo off
cd /d "%~dp0"
chcp 65001 >nul

echo ========================================
echo   Lung AI Model Training Tool
echo ========================================
echo.

echo Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python 3.8+ not found. Please install Python first.
    pause
    exit /b 1
)

echo [OK] Python found
echo.

echo Checking dependencies...
python -c "import torch" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing PyTorch...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
)

python -c "import timm" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing timm...
    pip install timm
)

python -c "import cv2, pydicom, pandas, tqdm" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing other dependencies...
    pip install opencv-python pydicom pandas tqdm scikit-image
)

echo [OK] All dependencies installed
echo.

echo ========================================
echo   Step 1/2: Preprocess Dataset
echo ========================================
echo.
echo Source: D:\Lang P\manifest-1764759073893\LIDC-IDRI
echo Output: ai_models\datasets\lidc_processed
echo.

python train_lung_segmentation.py

if %errorlevel% neq 0 (
    echo ERROR: Data preprocessing failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Step 2/2: Training Model
echo ========================================
echo.

python train_model.py

if %errorlevel% neq 0 (
    echo ERROR: Model training failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   SUCCESS: Training Complete!
echo ========================================
echo.
echo Model saved to: ai_models\models\lung_segmentation\
echo   - best_model.pth (best model)
echo   - checkpoint_epoch_X.pth (checkpoint)
echo.
echo Next steps:
echo   1. Test model: python test_model.py
echo   2. Integrate to project: See TRAINING_GUIDE.md
echo ========================================

pause
