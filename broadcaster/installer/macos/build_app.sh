#!/bin/bash
# Build macOS .app with PyInstaller and merge custom Info.plist permissions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
BUILD_DIR="$BROADCASTER_DIR/build"
BUILD_VENV="$ROOT_DIR/.build-venv-macos"
APP_NAME="VeriSonic Broadcaster"

cd "$ROOT_DIR"

python_has_shared_lib() {
  local py="$1"
  "$py" - <<'PY'
import glob
import sys
from pathlib import Path

prefix = Path(sys.base_prefix)
candidates = list((prefix / "lib").glob("libpython*.dylib"))
candidates.extend(
    Path(p) for p in glob.glob(
        str(prefix / "Frameworks/Python.framework/Versions/*/lib/libpython*.dylib")
    )
)
raise SystemExit(0 if any(p.exists() for p in candidates) else 1)
PY
}

find_build_python() {
  local candidate py
  for candidate in \
    "${VERISONIC_BUILD_PYTHON:-}" \
    "$BUILD_VENV/bin/python" \
    "/opt/homebrew/opt/python@3.10/bin/python3.10" \
    "/usr/local/opt/python@3.10/bin/python3.10" \
    "/opt/homebrew/opt/python@3.11/bin/python3.11" \
    "/usr/local/opt/python@3.11/bin/python3.11" \
    "$(command -v python3)" \
    "$(command -v python)"
  do
    [ -n "$candidate" ] || continue
    [ -x "$candidate" ] || continue
    if python_has_shared_lib "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_build_venv() {
  local base_py="$1"
  if [ -x "$BUILD_VENV/bin/python" ] && python_has_shared_lib "$BUILD_VENV/bin/python"; then
    return 0
  fi

  echo "Creating build virtualenv at $BUILD_VENV using $base_py"
  rm -rf "$BUILD_VENV"
  "$base_py" -m venv "$BUILD_VENV"
}

install_build_deps() {
  "$BUILD_VENV/bin/python" -m pip install --upgrade pip
  "$BUILD_VENV/bin/python" -m pip install pyinstaller
  "$BUILD_VENV/bin/python" -m pip install -r broadcaster/requirements.txt
}

BUILD_PY="$(find_build_python || true)"
if [ -z "$BUILD_PY" ]; then
  BASE_PY=""
  for candidate in \
    "/opt/homebrew/opt/python@3.10/bin/python3.10" \
    "/usr/local/opt/python@3.10/bin/python3.10" \
    "/opt/homebrew/opt/python@3.11/bin/python3.11" \
    "/usr/local/opt/python@3.11/bin/python3.11"
  do
    [ -x "$candidate" ] && BASE_PY="$candidate" && break
  done

  if [ -z "$BASE_PY" ]; then
    echo "No Python with a shared library was found for PyInstaller." >&2
    echo "Install Homebrew Python: brew install python@3.10" >&2
    echo "Or rebuild pyenv Python: env PYTHON_CONFIGURE_OPTS=\"--enable-framework\" pyenv install -f 3.10.1" >&2
    exit 1
  fi

  ensure_build_venv "$BASE_PY"
  install_build_deps
  BUILD_PY="$BUILD_VENV/bin/python"
fi

if ! "$BUILD_PY" -m PyInstaller --version >/dev/null 2>&1; then
  ensure_build_venv "$BUILD_PY"
  install_build_deps
  BUILD_PY="$BUILD_VENV/bin/python"
fi

echo "Using Python: $BUILD_PY"
"$BUILD_PY" --version

if [ ! -f "broadcaster/assets/icon.icns" ]; then
  "$BUILD_PY" broadcaster/generate_icons.py
fi

PYI_WORKPATH="$BUILD_DIR/pyinstaller"
SPEC_FILE="$BUILD_DIR/$APP_NAME.spec"
if ! rm -rf "$DIST_DIR" "$PYI_WORKPATH" "$SPEC_FILE" 2>/dev/null; then
  echo "Cannot clear $DIST_DIR (often root-owned after a previous install)." >&2
  echo "Run once: sudo rm -rf \"$DIST_DIR\"" >&2
  echo "Or build elsewhere: VERISONIC_DIST_DIR=$BROADCASTER_DIR/dist-user $0" >&2
  exit 1
fi
mkdir -p "$DIST_DIR" "$BUILD_DIR"

"$BUILD_PY" -m PyInstaller --noconsole --onedir --windowed \
  --workpath "$PYI_WORKPATH" \
  --distpath "$DIST_DIR" \
  --specpath "$BUILD_DIR" \
  --icon="$BROADCASTER_DIR/assets/icon.icns" \
  --paths "$BROADCASTER_DIR" \
  --hidden-import=AVFoundation \
  --hidden-import=installer.macos.audio_permission \
  --hidden-import=PyQt5.QtNetwork \
  --hidden-import=_sounddevice \
  --hidden-import=sounddevice \
  --hidden-import=lameenc \
  --hidden-import=websockets \
  --hidden-import=websockets.legacy.client \
  --collect-all sounddevice \
  --osx-bundle-identifier com.verisonic.broadcaster \
  --osx-entitlements-file="broadcaster/installer/macos/entitlements.plist" \
  --name="$APP_NAME" \
  broadcaster/verisonic_broadcaster.py

chmod +x "$SCRIPT_DIR/merge_info_plist.sh" "$SCRIPT_DIR/sign_app.sh"
"$SCRIPT_DIR/merge_info_plist.sh" "$DIST_DIR/$APP_NAME.app"
"$SCRIPT_DIR/sign_app.sh" "$DIST_DIR/$APP_NAME.app"

echo "Built: broadcaster/dist/$APP_NAME.app"
