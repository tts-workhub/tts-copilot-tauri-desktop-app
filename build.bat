@echo off
REM TTS Copilot - Windows x64 Build Script

echo.
echo 🔨 Building TTS Copilot for Windows x64...
echo.

REM Check for Rust
rustc --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Rust not found. Install from https://rustup.rs/
    exit /b 1
)

REM Check for Node.js
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Install from https://nodejs.org/
    exit /b 1
)

REM Install dependencies
echo 📦 Installing dependencies...
call npm install
if errorlevel 1 (
    echo ❌ npm install failed
    exit /b 1
)

REM Build
echo 🏗️  Building application...
call npm run build:win
if errorlevel 1 (
    echo ❌ Build failed
    exit /b 1
)

echo.
echo ✅ Build successful!
echo 📁 Installer location: src-tauri\target\release\bundle\msi\
echo.
pause
