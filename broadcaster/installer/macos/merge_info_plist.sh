#!/bin/bash
# Merge custom Info.plist keys (mic/audio permissions) into the PyInstaller .app bundle.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="$BROADCASTER_DIR/dist"
APP_NAME="VeriSonic Broadcaster"
APP_PATH="${1:-$DIST_DIR/$APP_NAME.app}"
CUSTOM_PLIST="$SCRIPT_DIR/Info.plist"
TARGET_PLIST="$APP_PATH/Contents/Info.plist"

if [ ! -d "$APP_PATH" ]; then
  echo "Missing app bundle: $APP_PATH" >&2
  exit 1
fi

if [ ! -f "$TARGET_PLIST" ]; then
  echo "Missing bundle Info.plist: $TARGET_PLIST" >&2
  exit 1
fi

python3 - "$TARGET_PLIST" "$CUSTOM_PLIST" <<'PY'
import plistlib
import sys
from pathlib import Path

app_plist = Path(sys.argv[1])
custom_plist = Path(sys.argv[2])

with app_plist.open("rb") as f:
    info = plistlib.load(f)
with custom_plist.open("rb") as f:
    info.update(plistlib.load(f))
with app_plist.open("wb") as f:
    plistlib.dump(info, f)

print(f"Merged audio permission keys into {app_plist}")
PY
