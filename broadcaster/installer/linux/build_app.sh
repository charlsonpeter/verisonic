#!/bin/bash
# Build Linux executable with PyInstaller (shared hidden imports with macOS build).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
BUILD_DIR="$BROADCASTER_DIR/build"
APP_NAME="verisonic-broadcaster"
BUILD_PY="${VERISONIC_BUILD_PYTHON:-python3}"

cd "$ROOT_DIR"

if ! command -v "$BUILD_PY" >/dev/null 2>&1; then
  BUILD_PY="python"
fi

echo "Using Python: $BUILD_PY"
"$BUILD_PY" --version

if [ ! -f "$BROADCASTER_DIR/assets/icon.png" ]; then
  "$BUILD_PY" broadcaster/generate_icons.py
fi

PYI_WORKPATH="$BUILD_DIR/pyinstaller"
SPEC_FILE="$BUILD_DIR/$APP_NAME.spec"

rm -rf "$PYI_WORKPATH" "$SPEC_FILE"
rm -f "$DIST_DIR/$APP_NAME"
mkdir -p "$DIST_DIR" "$BUILD_DIR"

"$BUILD_PY" -m PyInstaller --noconsole --onefile \
  --workpath "$PYI_WORKPATH" \
  --distpath "$DIST_DIR" \
  --specpath "$BUILD_DIR" \
  --icon="$BROADCASTER_DIR/assets/icon.png" \
  --add-data "$BROADCASTER_DIR/assets/icon.png:assets" \
  --paths "$BROADCASTER_DIR" \
  --hidden-import=installer.linux.audio_permission \
  --hidden-import=PyQt5.QtNetwork \
  --hidden-import=_sounddevice \
  --hidden-import=sounddevice \
  --hidden-import=lameenc \
  --hidden-import=websockets \
  --hidden-import=websockets.legacy.client \
  --collect-all sounddevice \
  --name="$APP_NAME" \
  broadcaster/verisonic_broadcaster.py

echo "Built: $DIST_DIR/$APP_NAME"
