@echo off
chcp 65001 > nul
echo ========================================
echo   Swin Transformer UNet 训练 (简化版)
echo ========================================
echo.
echo 使用简化的注意力机制
echo 模型大小：~130MB
echo 预计时间：约 1-2 小时（CPU）
echo.
echo 特点:
echo   - 简化的自注意力机制
echo   - 避免维度问题
echo   - 更好的训练稳定性
echo.

cd /d "%~dp0"

python train_swin_unet_simple.py

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   ✅ 训练完成！
    echo   模型保存在：trained_models\swin_unet\
    echo ========================================
) else (
    echo.
    echo ========================================
    echo   ❌ 训练失败，请检查错误信息
    echo ========================================
)
echo.
pause
