# TTS Copilot Windows x64 Distribution Package

## Build Instructions

### Quick Start
```bash
# Windows
build.bat

# Linux/macOS
bash build.sh
```

### Manual Build Steps

1. **Install Rust** (one-time)
   ```bash
   https://rustup.rs/
   ```

2. **Add Windows x64 target**
   ```bash
   rustup target add x86_64-pc-windows-msvc
   ```

3. **Install Node dependencies**
   ```bash
   npm install
   ```

4. **Run development server** (optional)
   ```bash
   npm run dev
   ```

5. **Build MSI installer**
   ```bash
   npm run build:win
   ```

6. **Output location**
   ```
   src-tauri/target/release/bundle/msi/tts-copilot_1.0.0_x64_en-US.msi
   ```

---

## Distribution Checklist

Before packaging for distribution:

- [ ] Update `tauri.conf.json` version number
- [ ] Update `package.json` version number
- [ ] Change default admin password in `src-tauri/src/main.rs`
- [ ] Remove debug credentials from `public/js/app.js`
- [ ] Add actual logo.png to `public/assets/`
- [ ] Review README.md for accuracy
- [ ] Test installer on clean Windows system
- [ ] Code sign the MSI (optional but recommended)
- [ ] Create GitHub release with installer
- [ ] Test auto-update mechanism

---

## System Requirements

**Minimum:**
- Windows 10 Version 1607+
- Intel Core i3 or equivalent
- 256 MB RAM
- 100 MB disk space

**Recommended:**
- Windows 10/11 Latest
- Intel Core i5+ or equivalent
- 4 GB RAM
- SSD with 500 MB space

---

## Installation for Users

1. Download `tts-copilot_1.0.0_x64_en-US.msi`
2. Run the installer
3. Accept the license
4. Choose installation directory
5. Finish installation
6. Launch from Start Menu

---

## Uninstallation

Users can uninstall via:
- Windows Settings → Apps → Apps & Features → TTS Copilot → Uninstall
- Control Panel → Programs & Features → TTS Copilot → Uninstall

---

## Troubleshooting Installation

### "SmartScreen Protection" Warning
- Click "More info" → "Run anyway"
- This is normal for new applications
- Code signing eliminates this

### "MSVC Runtime Not Found"
- Ensure Windows is updated with latest patches
- Install Visual C++ Redistributable from Microsoft

### Installer Won't Start
- Ensure you have admin rights
- Disable antivirus temporarily during installation
- Try reinstalling in different directory

---

## Post-Installation

First run will:
1. Create `%APPDATA%/tts-copilot/` directory
2. Initialize localStorage database
3. Create configuration files

---

## Support

For issues:
1. Check README.md troubleshooting section
2. Enable logs: Set `RUST_BACKTRACE=1`
3. Check Windows Event Viewer for application errors
4. Contact: support@techtandentalsolutions.com

---

Generated: 2026-06-03
