#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
APP_NAME="VeriSonic Broadcaster"
APP_PATH="$DIST_DIR/$APP_NAME.app"
PKG_VERSION="${VERISONIC_PKG_VERSION:-1.0.0}"
PKG_OUTPUT="$DIST_DIR/VeriSonic Broadcaster.pkg"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"
ASSETS_DIR="$SCRIPT_DIR/../assets"

if [ ! -d "$APP_PATH" ]; then
  echo "Missing PyInstaller app bundle: $APP_PATH" >&2
  echo "Build the app first: broadcaster/installer/macos/build_app.sh" >&2
  exit 1
fi

chmod +x "$SCRIPT_DIR/merge_info_plist.sh" "$SCRIPT_DIR/sign_app.sh"
"$SCRIPT_DIR/merge_info_plist.sh" "$APP_PATH"
"$SCRIPT_DIR/sign_app.sh" "$APP_PATH"

chmod +x "$SCRIPTS_DIR/postinstall" "$SCRIPTS_DIR/postupgrade" "$SCRIPTS_DIR/preinstall"

PAYLOAD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/verisonic-pkg-root.XXXXXX")"
SCRIPTS_STAGING="$(mktemp -d "${TMPDIR:-/tmp}/verisonic-pkg-scripts.XXXXXX")"
trap 'rm -rf "$PAYLOAD_DIR" "$SCRIPTS_STAGING"' EXIT

# Install directly into /Applications (app at payload root — avoids ._Applications sidecars).
ditto --noextattr --norsrc "$APP_PATH" "$PAYLOAD_DIR/$APP_NAME.app"
find "$PAYLOAD_DIR" -name '._*' -delete
find "$PAYLOAD_DIR" -name '.DS_Store' -delete
chmod +x "$PAYLOAD_DIR/$APP_NAME.app/Contents/MacOS/$APP_NAME" 2>/dev/null || true

if [ ! -d "$PAYLOAD_DIR/$APP_NAME.app/Contents/MacOS" ]; then
  echo "Package payload is incomplete." >&2
  exit 1
fi

cp "$SCRIPTS_DIR/preinstall" "$SCRIPTS_DIR/postinstall" "$SCRIPTS_DIR/postupgrade" "$SCRIPTS_STAGING/"
if [ -f "$ASSETS_DIR/audio-permissions.txt" ]; then
  cp "$ASSETS_DIR/audio-permissions.txt" "$SCRIPTS_STAGING/"
fi

pkgbuild \
  --root "$PAYLOAD_DIR" \
  --identifier com.verisonic.broadcaster \
  --version "$PKG_VERSION" \
  --install-location /Applications \
  --scripts "$SCRIPTS_STAGING" \
  "$PKG_OUTPUT"

echo "Created installer: $PKG_OUTPUT (version $PKG_VERSION)"
