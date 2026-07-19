#!/bin/bash
# Re-sign the .app after Info.plist merge so macOS TCC sees a valid bundle + mic usage string.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="${1:?Usage: sign_app.sh /path/to/App.app}"
ENTITLEMENTS="$SCRIPT_DIR/entitlements.plist"

if [ ! -d "$APP_PATH" ]; then
  echo "Missing app bundle: $APP_PATH" >&2
  exit 1
fi

# Sign nested binaries/frameworks first, then the bundle (avoid --deep race conditions).
find "$APP_PATH/Contents/MacOS" -type f -perm +111 2>/dev/null | while read -r bin; do
  codesign --force --sign - --entitlements "$ENTITLEMENTS" "$bin" 2>/dev/null || \
    codesign --force --sign - "$bin" 2>/dev/null || true
done

codesign --force --sign - \
  --entitlements "$ENTITLEMENTS" \
  --identifier com.verisonic.broadcaster \
  "$APP_PATH"

if ! codesign --verify --deep --strict "$APP_PATH" 2>/dev/null; then
  codesign --verify --deep "$APP_PATH"
fi

echo "Signed: $APP_PATH"
