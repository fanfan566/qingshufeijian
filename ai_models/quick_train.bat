@echo off
chcp 65001 > nul
echo ========================================
echo   快速训练肺部图像分割模型
echo ========================================
echo.
echo 这将训练一个轻量级的 U-Net 模型
echo 预计时间：约 25 分钟（CPU）
echo.

cd /d "%~dp0"

python quick_train.py

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   训练完成！
    echo   模型保存在：trained_models\lung_segmentation\
    echo ========================================
) else (
    echo.
    echo ========================================
    echo   训练失败，请检查错误信息
    echo ========================================
)
echo.
pause
