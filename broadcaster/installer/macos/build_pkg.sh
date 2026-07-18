#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_NAME="VeriSonic Broadcaster"
APP_PATH="$ROOT_DIR/dist/$APP_NAME.app"
PKG_OUTPUT="$ROOT_DIR/dist/VeriSonic_Broadcaster.pkg"
PAYLOAD_DIR="$ROOT_DIR/build/pkg-payload"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"

if [ ! -d "$APP_PATH" ]; then
  echo "Missing PyInstaller app bundle: $APP_PATH" >&2
  exit 1
fi

chmod +x "$SCRIPTS_DIR/postinstall" "$SCRIPTS_DIR/postupgrade"

rm -rf "$PAYLOAD_DIR"
mkdir -p "$PAYLOAD_DIR/Applications"
cp -R "$APP_PATH" "$PAYLOAD_DIR/Applications/"

pkgbuild \
  --root "$PAYLOAD_DIR" \
  --identifier com.verisonic.broadcaster \
  --version 1.0.0 \
  --install-location / \
  --scripts "$SCRIPTS_DIR" \
  "$PKG_OUTPUT"

echo "Created installer: $PKG_OUTPUT"
