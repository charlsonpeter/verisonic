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

## Project layout

```
broadcaster/
  verisonic_broadcaster.py   # Entry point (PyQt5 app)
  requirements.txt
  generate_icons.py
  assets/                      # icon.png, .ico, .icns
  installer/
    macos/                     # .pkg, PyInstaller, entitlements, mic permission helper
    linux/                     # .deb
    windows/                   # Inno Setup
    assets/                    # Shared install docs
```

Shared streaming logic lives in `verisonic_broadcaster.py`. macOS microphone permission helpers live under `installer/macos/` alongside the macOS packaging scripts.

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

### Connect Live (all platforms)

The Connect Live page has **no input dropdown**. When you click **Connect Live**, the app reads your system **default sound output** and picks a matching **input** automatically:

| System output | Input chosen |
|---------------|--------------|
| Loopback/virtual (BlackHole, VB-Cable, etc.) | Matching loopback input |
| Linux monitor route | `Monitor of …` when names align |
| Speakers / headphones / default playback | Default microphone (non-loopback) |

You can still change input on the **live** screen while broadcasting. Silent-input notices do not stop the stream.

**Installed app logs (macOS `.pkg` / PyInstaller):** `~/Library/Logs/VeriSonic/broadcaster.log` — use this when Connect Live crashes and Terminal shows no output.

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

**Audio input on Windows:** Allow desktop apps under **Settings → Privacy & security → Microphone**, and enable your capture device under **Settings → System → Sound → Input**. For system audio, enable **Stereo Mix** or a virtual cable — Connect Live matches loopback input when your output device name aligns (see **Connect Live (all platforms)** above).

---

### macOS

**Build the `.pkg` installer** (builds the app in a temp directory; only the `.pkg` is written to `dist/`):

```bash
chmod +x broadcaster/installer/macos/build_macos_pkg.sh
broadcaster/installer/macos/build_macos_pkg.sh
```

Optional: set package version (recommended when reinstalling):

```bash
VERISONIC_PKG_VERSION=1.0.6 broadcaster/installer/macos/build_macos_pkg.sh
```

Optional: also copy the `.app` into `dist/` for local testing (not installed by default):

```bash
KEEP_APP=1 broadcaster/installer/macos/build_macos_pkg.sh
```

**Output:** `broadcaster/dist/VeriSonic Broadcaster.pkg` only (unless `KEEP_APP=1`).

**Build the `.app` alone** (without pkg — for development):

```bash
broadcaster/installer/macos/build_app.sh
```

**Install** (no manual copy to `/Applications`):

```bash
broadcaster/installer/macos/install_pkg.sh
# or: open "broadcaster/dist/VeriSonic Broadcaster.pkg"
```

**Reinstalling:** If VeriSonic Broadcaster is already installed, run the new `.pkg` again — macOS replaces `/Applications/VeriSonic Broadcaster.app` in place. The pkg `preinstall` script quits any running copy automatically; no manual cleanup is needed for a normal upgrade.

**Clean reinstall (failed or partial install only):** Use this when a previous install failed, the app is missing or broken, or the installer reports a receipt conflict. Bump `VERISONIC_PKG_VERSION` before rebuilding.

```bash
# 1. Quit any running copy
pkill -f "VeriSonic Broadcaster" 2>/dev/null || true
# 2. Remove failed/partial installs
sudo rm -rf "/Applications/VeriSonic Broadcaster.app"
sudo pkgutil --forget com.verisonic.broadcaster 2>/dev/null || true
# 3. Install again
open "broadcaster/dist/VeriSonic Broadcaster.pkg"
```

Install logs: `/var/log/verisonic-broadcaster-install.log`

**Connect Live crashes when opened from Applications (but works from Terminal):** An older install may have auto-started a background copy at login while you also opened the app from Applications — two processes fighting for the microphone. Quit all copies, disable the old auto-start agent, then reopen once:

```bash
pkill -f "VeriSonic Broadcaster" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.verisonic.broadcaster" 2>/dev/null || true
open "/Applications/VeriSonic Broadcaster.app"
```

**Connect Live crashes with microphone while BlackHole is the system output:** macOS can crash when Sound → Output is set to **BlackHole only** but the broadcaster input is the **microphone**. For mic streaming, set Sound → Output to speakers/headphones. For system-audio streaming, keep BlackHole as output and select **BlackHole 2ch** as the input in the app (optionally via Multi-Output Device so you can still hear audio).

Rebuild/reinstall with a current `.pkg` for the single-instance fix and updated LaunchAgent (no login auto-start).

<details>
<summary>Advanced: build .app and .pkg separately</summary>

```bash
broadcaster/installer/macos/build_app.sh
VERISONIC_PKG_VERSION=1.0.6 broadcaster/installer/macos/build_pkg.sh
```

</details>

**Installer configures:**

- Admin install to `/Applications`
- **LaunchAgent** plist (`com.verisonic.broadcaster`) installed but **not** auto-started at login (avoids duplicate instances fighting for the microphone)
- **Single-instance guard** — opening the app again focuses the existing copy instead of starting a second process
- `NSMicrophoneUsageDescription` for all audio input devices (mic, line-in, USB, BlackHole loopback)
- `com.apple.security.device.audio-input` entitlement in the app bundle
- Opens **Microphone** privacy pane after install
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
