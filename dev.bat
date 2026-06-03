@echo off
REM TTS Copilot - Development Server Script

echo.
echo 🚀 Starting TTS Copilot Development Server...
echo.

npm install
if errorlevel 1 (
    echo ❌ npm install failed
    exit /b 1
)

echo ✅ Starting Tauri dev server...
npm run dev
