@echo off
:: Personal AI Assistant — Windows launcher
cd /d "%~dp0"

:: Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: Check for API key
if "%ANTHROPIC_API_KEY%"=="" (
    if exist ".env" (
        echo Loading .env...
    ) else (
        echo [WARNING] ANTHROPIC_API_KEY is not set.
        echo Create a .env file or run: set ANTHROPIC_API_KEY=sk-ant-...
        echo.
    )
)

:: Install/upgrade deps silently on first run
if not exist ".deps_installed" (
    echo Installing dependencies...
    python -m pip install -q -r requirements.txt
    echo. > .deps_installed
)

python agent.py %*
