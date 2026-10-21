@echo off
chcp 65001 > nul
echo ========================================
echo   Swin Transformer UNet 训练
echo ========================================
echo.
echo 使用您提供的 Swin Transformer 架构
echo 预计时间：约 1-2 小时（CPU）
echo.
echo 优势:
echo   - Swin Transformer 自注意力机制
echo   - 更好的全局上下文理解
echo   - 已在心脏数据集验证
echo.

cd /d "%~dp0"

python train_swin_unet.py

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   训练完成！
    echo   模型保存在：trained_models\swin_unet\
    echo ========================================
) else (
    echo.
    echo ========================================
    echo   训练失败，请检查错误信息
    echo ========================================
)
echo.
pause
