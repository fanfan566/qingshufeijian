@echo off
cd /d "%~dp0"
chcp 65001 >nul

echo ========================================
echo   Data Preprocessing
echo ========================================
echo.

python train_lung_segmentation.py

pause
