#!/bin/bash
# TTS Copilot - Windows x64 Build Script

echo "🔨 Building TTS Copilot for Windows x64..."

# Check for required tools
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found. Install from https://rustup.rs/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org/"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🏗️  Building application..."
npm run build:win

# Check result
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📁 Installer location: src-tauri/target/release/bundle/msi/"
    ls -lh src-tauri/target/release/bundle/msi/*.msi 2>/dev/null || echo "   (Check directory for MSI files)"
else
    echo "❌ Build failed. Check errors above."
    exit 1
fi
