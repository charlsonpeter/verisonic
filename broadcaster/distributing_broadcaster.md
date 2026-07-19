# Distributing & Running the VeriSonic Broadcaster

This document outlines how to compile the VeriSonic desktop broadcaster into **platform installers** (Windows, macOS, Linux) with admin permissions, login auto-start, and **full audio input capture** permissions (microphone, line-in, USB interfaces, loopback/system audio).

---

## Important: Cross-Compilation Rule

PyInstaller **does not support cross-compilation**. Build on each target OS, or use GitHub Actions (`.github/workflows/build-broadcaster.yml`).

---

## GitHub Actions (Recommended)

### Trigger

1. Push changes under `broadcaster/`
2. **Actions → Build Broadcaster → Run workflow**

### Installer artifacts

| Platform | Artifact name | File |
|----------|---------------|------|
| Windows | `verisonic-broadcaster-windows-installer` | `VeriSonic_Broadcaster_Setup.exe` |
| macOS | `verisonic-broadcaster-macos-installer` | `VeriSonic Broadcaster.pkg` |
| Linux | `verisonic-broadcaster-linux-installer` | `verisonic-broadcaster_1.0.0_amd64.deb` |

Host these files at `/downloads/broadcaster/` on your web server (or set `VITE_BROADCASTER_DOWNLOAD_BASE` for the frontend download page).

---

## Icon Asset Generation

```bash
python broadcaster/generate_icons.py
```

Generates `broadcaster/assets/icon.png`, `.ico`, and `.icns`.

---

## Local Build Pipeline

All platforms follow the same two steps:

1. **PyInstaller** — bundle the Python app
2. **Platform installer** — admin install + background auto-start + permissions

### Shared prerequisites

```bash
pip install pyinstaller
pip install -r broadcaster/requirements.txt
python broadcaster/generate_icons.py
```

---

### Windows

**1. Build executable**

```cmd
pyinstaller --noconsole --onefile --windowed ^
  --distpath broadcaster/dist ^
  --workpath broadcaster/build/pyinstaller ^
  --specpath broadcaster/build ^
  --icon="broadcaster/assets/icon.ico" ^
  --name="VeriSonic Broadcaster" ^
  broadcaster/verisonic_broadcaster.py
```

**2. Build installer** (requires [Inno Setup 6](https://jrsoftware.org/isinfo.php))

```cmd
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" broadcaster/installer/windows/setup.iss
```

**Output:** `broadcaster/dist/VeriSonic_Broadcaster_Setup.exe`

**Installer configures:**

- Admin install to `Program Files`
- Wizard page explaining **all audio input sources** (mic, line-in, USB, loopback)
- Optional desktop shortcut
- **Task Scheduler** job at user logon (background tray service)
- Opens **Microphone privacy** and **Sound → Input** settings after install (optional task)
- Bundled `audio-permissions.txt` reference guide
- Uninstall removes the scheduled task

**Audio input on Windows:** Allow desktop apps under **Settings → Privacy & security → Microphone**, and enable your capture device under **Settings → System → Sound → Input**. For system audio, enable Stereo Mix or a virtual cable and select it in the app.

---

### macOS

**Build the `.pkg` installer** (builds the app internally, output is the pkg only):

```bash
chmod +x broadcaster/installer/macos/build_macos_pkg.sh
broadcaster/installer/macos/build_macos_pkg.sh
```

Optional: set package version (recommended when reinstalling):

```bash
VERISONIC_PKG_VERSION=1.0.6 broadcaster/installer/macos/build_macos_pkg.sh
```

Keep the `.app` in `dist/` as well (default removes it after pkg is created):

```bash
KEEP_APP=1 broadcaster/installer/macos/build_macos_pkg.sh
```

**Output:** `broadcaster/dist/VeriSonic Broadcaster.pkg`

**Install** (no manual copy to `/Applications`):

```bash
broadcaster/installer/macos/install_pkg.sh
# or: open "broadcaster/dist/VeriSonic Broadcaster.pkg"
```

<details>
<summary>Advanced: build .app and .pkg separately</summary>

```bash
broadcaster/installer/macos/build_app.sh
VERISONIC_PKG_VERSION=1.0.6 broadcaster/installer/macos/build_pkg.sh
```

</details>

**Installer configures:**

- Admin install to `/Applications`
- **LaunchAgent** (`com.verisonic.broadcaster`) for the installing user
- `NSMicrophoneUsageDescription` for all audio input devices (mic, line-in, USB, BlackHole loopback)
- `NSScreenCaptureUsageDescription` when system/desktop audio capture is needed
- `com.apple.security.device.audio-input` entitlement in the app bundle
- Opens **Microphone** and **Screen & System Audio Recording** privacy panes after install
- Shared guide at `/Library/Application Support/VeriSonic/audio-permissions.txt`

**Code signing (production):**

```bash
codesign --deep --force --sign "Developer ID Application: Your Name (TeamID)" "broadcaster/dist/VeriSonic Broadcaster.app"
```

---

### Linux

**1. Build executable**

```bash
pyinstaller --noconsole --onefile \
  --distpath broadcaster/dist \
  --workpath broadcaster/build/pyinstaller \
  --specpath broadcaster/build \
  --icon="broadcaster/assets/icon.png" \
  --name="verisonic-broadcaster" \
  broadcaster/verisonic_broadcaster.py
```

**2. Build `.deb` installer**

```bash
chmod +x broadcaster/installer/linux/build_deb.sh
broadcaster/installer/linux/build_deb.sh
```

**Output:** `broadcaster/dist/verisonic-broadcaster_1.0.0_amd64.deb`

**Installer configures:**

- Binary at `/usr/bin/verisonic-broadcaster`
- Application menu entry
- **XDG autostart** for login background launch
- **systemd user unit** at `/usr/lib/systemd/user/verisonic-broadcaster.service`
- Audio permissions guide at `/usr/share/doc/verisonic-broadcaster/audio-permissions.txt`
- Recommends PipeWire/PulseAudio for input capture

**Audio input on Linux:** Ensure your user can access capture devices (`sudo usermod -aG audio $USER`, then re-login). Allow input access when PipeWire/PulseAudio prompts on first launch.

**Install:**

```bash
sudo dpkg -i broadcaster/dist/verisonic-broadcaster_1.0.0_amd64.deb
sudo apt-get install -f
```

---

## Background Service Behavior

The broadcaster runs as a **user-session background tray app** (not a headless OS daemon), which is required for PyQt UI, login, and microphone capture.

| Platform | Auto-start mechanism |
|----------|---------------------|
| Windows | Task Scheduler (`ONLOGON`) |
| macOS | `LaunchAgent` in `~/Library/LaunchAgents/` |
| Linux | XDG autostart + optional systemd user service |

The app minimizes to the system tray on close (`setQuitOnLastWindowClosed(False)`).

---

## Frontend Download URLs

`frontend/src/config/broadcasterDownloads.ts` defaults to:

```
/downloads/broadcaster/VeriSonic_Broadcaster_Setup.exe
/downloads/broadcaster/VeriSonic Broadcaster.pkg
/downloads/broadcaster/verisonic-broadcaster_1.0.0_amd64.deb
```

Override the base path when building the frontend:

```bash
VITE_BROADCASTER_DOWNLOAD_BASE=https://cdn.example.com/releases/broadcaster npm run build
```

---

## Android support

Android packaging is not supported by this project.
