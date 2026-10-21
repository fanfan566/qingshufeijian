@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo   肺部健康系统 - 一键启动
echo ========================================
echo.

echo [步骤 1/6] 停止所有相关进程...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo ✓ 完成
echo.

echo [步骤 2/6] 清理所有占用端口...
echo   清理端口 8000 (FastAPI 后端)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo   清理端口 8001 (Node.js 认证服务)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo   清理端口 5173 (前端 Vite 开发服务器)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo ✓ 端口清理完成
echo.

echo [步骤 3/6] 清除 Vite 缓存...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite" >nul 2>&1
    echo ✓ Vite 缓存已清除
) else (
    echo ℹ 无需清除缓存
)
echo.

REM SegMoTE 分割模型需要 CUDA 版 PyTorch，使用 segmote conda 环境；不存在时回退到默认 python
set "BACKEND_PY=D:\ANA\envs\segmote\python.exe"
if not exist "%BACKEND_PY%" set "BACKEND_PY=python"

echo [步骤 4/6] 启动 FastAPI 后端（端口 8000 - 图像分析）...
start "后端-FastAPI(8000)" cmd /k "cd /d %~dp0backend && echo 正在启动 FastAPI 后端(8000)... && "%BACKEND_PY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo   等待 FastAPI 后端启动...
timeout /t 8 /nobreak >nul
echo ✓ FastAPI 后端已启动（http://localhost:8000）
echo.

echo [步骤 5/6] 启动 Node.js 认证服务（端口 8001 - 登录/注册）...
start "后端-Node.js(8001)" cmd /k "cd /d %~dp0 && echo 正在启动 Node.js 认证服务(8001)... && node server.js"
echo   等待 Node.js 服务启动...
timeout /t 5 /nobreak >nul
echo ✓ Node.js 认证服务已启动（http://localhost:8001）
echo.

echo [步骤 6/6] 启动 Vite 前端开发服务器（端口 5173）...
start "前端-Vite(5173)" cmd /k "cd /d %~dp0 && echo 正在启动前端 Vite 开发服务器(5173)... && npm run dev"
echo   等待前端开发服务器启动...
timeout /t 8 /nobreak >nul
echo ✓ 前端开发服务器已启动（http://localhost:5173）
echo.

echo ========================================
echo   ✅ 启动完成！
echo ========================================
echo.
echo   服务状态:
echo   ├─ 前端（必须通过浏览器访问）： http://localhost:5173
echo   ├─ FastAPI后端：                 http://localhost:8000  (图像分析)
echo   └─ Node.js服务：                 http://localhost:8001  (认证/登录)
echo.
echo   ⚠ 重要说明:
echo   ├─ 不要双击 index.html 或使用 file:/// 打开前端
echo   ├─ 肺部分割页面依赖 Vite 代理转发 /api 请求
echo   ├─ 必须通过 http://localhost:5173 访问，DICOM 上传和 lungmask 接口才会正常工作
echo   └─ 若页面异常，请在浏览器中按 Ctrl+Shift+R 强制刷新
echo.
echo   🔍 API 端点:
echo   ├─ 健康检查：      http://localhost:8000/health
echo   ├─ 肺部分割：      http://localhost:8000/api/segmote/image  (SegMoTE)
echo   ├─ DICOM分割：     http://localhost:8000/api/segmote/dicom
echo   └─ 用户登录：      http://localhost:8001/api/auth/login
echo.
echo ========================================
echo.

timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

echo 已自动打开浏览器到 http://localhost:5173
echo 系统正在运行中... 按任意键查看进程状态
pause >nul

echo.
echo ========================================
echo   当前运行的服务进程:
echo ========================================
netstat -ano | findstr LISTENING | findstr :8000
netstat -ano | findstr LISTENING | findstr :8001
netstat -ano | findstr LISTENING | findstr :5173
echo.
echo 按任意键退出
pause >nul
