#!/usr/bin/env node

/**
 * Pre-flight checks for TTS Copilot build
 * Validates environment and dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = {
    node: () => {
        const version = process.versions.node;
        const major = parseInt(version.split('.')[0]);
        return major >= 16 ? `✅ Node.js ${version}` : `❌ Node.js ${version} (requires 16+)`;
    },

    npm: () => {
        try {
            const version = execSync('npm --version').toString().trim();
            return `✅ npm ${version}`;
        } catch {
            return `❌ npm not found`;
        }
    },

    rust: () => {
        try {
            const version = execSync('rustc --version').toString().trim();
            return `✅ ${version}`;
        } catch {
            return `❌ Rust not found (install from https://rustup.rs/)`;
        }
    },

    cargoTarget: () => {
        try {
            const output = execSync('rustup target list').toString();
            return output.includes('x86_64-pc-windows-msvc (installed)') 
                ? `✅ x86_64-pc-windows-msvc target installed`
                : `⚠️  x86_64-pc-windows-msvc target NOT installed\n     Run: rustup target add x86_64-pc-windows-msvc`;
        } catch {
            return `❌ rustup not found`;
        }
    },

    projectStructure: () => {
        const missing = [];
        if (!fs.existsSync('./tauri.conf.json')) missing.push('tauri.conf.json');
        if (!fs.existsSync('./package.json')) missing.push('package.json');
        if (!fs.existsSync('./src-tauri/Cargo.toml')) missing.push('src-tauri/Cargo.toml');
        if (!fs.existsSync('./src-tauri/src/main.rs')) missing.push('src-tauri/src/main.rs');
        if (!fs.existsSync('./public/index.html')) missing.push('public/index.html');
        if (!fs.existsSync('./public/js/app.js')) missing.push('public/js/app.js');

        return missing.length === 0 
            ? `✅ All required files present` 
            : `❌ Missing: ${missing.join(', ')}`;
    }
};

console.log('\n🔍 TTS Copilot Pre-flight Checks\n');
console.log('═'.repeat(50));

Object.entries(checks).forEach(([name, check]) => {
    console.log(check());
});

console.log('═'.repeat(50));
console.log('\n✨ Ready to build!\n');
