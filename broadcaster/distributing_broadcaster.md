# Distributing & Running the VeriSonic Broadcaster

This document outlines how to compile the VeriSonic desktop broadcaster application into standalone executables for supported desktop platforms (macOS, Windows, and Linux) and configure background execution.

---

## ⚠️ Important: Cross-Compilation Rule
PyInstaller **does not support cross-compilation**. You cannot build a Windows `.exe` while running on macOS, or a macOS `.app` while on Windows. You must run the build command on the target operating system itself, or use a CI/CD pipeline (such as GitHub Actions) with runners for each OS.


---

## 🚀 Multi-Platform Builds using GitHub Actions (Recommended)

To compile the broadcaster for all target platforms automatically without installing VMs or switching operating systems, you can use the configured GitHub Actions workflow.

### Setup and Trigger:
1. **Push to GitHub**: When you push changes to the `broadcaster/` directory, GitHub Actions will automatically start building.
2. **Manual Dispatch**: Go to the **Actions** tab of your GitHub repository, select the **Build Broadcaster** workflow, and click **Run workflow**.

### Artifacts:
Once completed, the build outputs are uploaded as workflow run artifacts:
* **Windows**: `verisonic-broadcaster-windows` (contains `VeriSonic Broadcaster.exe`)
* **Linux**: `verisonic-broadcaster-linux` (contains `verisonic-broadcaster`)
* **macOS**: `verisonic-broadcaster-macos` (contains `VeriSonic_Broadcaster_macOS.zip` containing the `.app` bundle)

---

## 🎨 Icon Asset Generation

To package the application with high-quality icons matching the live radio waves application theme, run the built-in icon generator before compiling:
```bash
python broadcaster/generate_icons.py
```
This generates:
* `broadcaster/assets/icon.png` (Linux)
* `broadcaster/assets/icon.ico` (Windows)
* `broadcaster/assets/icon.icns` (macOS)

---

## 📦 1. Desktop Platforms (macOS, Windows, Linux)

To package your Python application, we use **PyInstaller**. Install it via:
```bash
pip install pyinstaller
```

### 🍏 macOS (Build `.app` Bundle)
Execute this command on a Mac:
```bash
pyinstaller --noconsole --onefile --windowed \
            --icon="broadcaster/assets/icon.icns" \
            --name="VeriSonic Broadcaster" \
            broadcaster/verisonic_broadcaster.py
```
* **Result**: `dist/VeriSonic Broadcaster.app`
* **Note**: To distribute this to other Mac users without security warnings, you must code-sign the app using an Apple Developer Certificate and notary service:
  ```bash
  codesign --deep --force --sign "Developer ID Application: Your Name (TeamID)" "dist/VeriSonic Broadcaster.app"
  ```

### 🪟 Windows (Build `.exe` Executable)
Execute this command on Windows:
```cmd
pyinstaller --noconsole --onefile --windowed ^
            --icon="broadcaster/assets/icon.ico" ^
            --name="VeriSonic Broadcaster" ^
            broadcaster/verisonic_broadcaster.py
```
* **Result**: `dist/VeriSonic Broadcaster.exe`

### 🐧 Linux (Build ELF Binary & AppImage)
1. Build the standalone ELF executable on Linux:
   ```bash
   pyinstaller --noconsole --onefile \
               --icon="broadcaster/assets/icon.png" \
               --name="verisonic-broadcaster" \
               broadcaster/verisonic_broadcaster.py
   ```
   * **Result**: `dist/verisonic-broadcaster`
2. **Package as AppImage** (for distribution across different Linux distributions without dependency issues):
   - Use `appimagetool` to package the executable along with an AppDir folder containing a desktop entry and the launcher script. This creates a portable `.AppImage` file that runs on any Linux distribution.

---

## Android support

Android packaging is not supported by this project. There is no Android-specific application code, build configuration, or CI artifact. Do not treat the exploratory Buildozer steps below as a supported release path.

## ⚙️ 2. Background Setup (Run on Login)

### 🍏 On macOS
1. Open **System Settings > General > Login Items**.
2. Under **Open at Login**, click the **`+`** icon and select the compiled `VeriSonic Broadcaster.app`.

### 🪟 On Windows
1. Press `Win + R`, type `shell:startup`, and press Enter to open the startup folder.
2. Drag a shortcut to `VeriSonic Broadcaster.exe` into this folder.

***
