@echo off
chcp 65001 >nul
setlocal

REM 进入脚本所在目录（项目根目录）
cd /d "%~dp0"
echo ==========================================
echo 一键安装项目依赖
echo ==========================================

REM 安装前端依赖
where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 npm，请先安装 Node.js。
) else (
  echo [前端] 安装 npm 依赖...
  npm install
)

REM 安装后端 Python 依赖
set PYTHON_CMD=
where python >nul 2>&1
if not errorlevel 1 (
  set PYTHON_CMD=python
) else (
  where py >nul 2>&1
  if not errorlevel 1 (
    set PYTHON_CMD=py
  )
)

if "%PYTHON_CMD%"=="" (
  echo [错误] 未检测到 Python，请先安装 Python 3。
) else (
  echo [后端] 使用 %PYTHON_CMD% 安装 Python 依赖...
  %PYTHON_CMD% -m pip install --upgrade pip
  if exist backend\requirements.txt (
    %PYTHON_CMD% -m pip install -r backend\requirements.txt
  ) else (
    echo [警告] backend\requirements.txt 未找到。
  )
)

echo ==========================================
echo 依赖安装完成
echo 如果安装过程中出现错误，请根据提示检查 Node.js / Python 环境或网络代理设置。
echo ==========================================
pause
