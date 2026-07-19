#!/bin/bash
# Build the macOS .pkg installer (builds the .app internally, then packages it).
# Output: broadcaster/dist/VeriSonic Broadcaster.pkg
#
# Usage:
#   broadcaster/installer/macos/build_macos_pkg.sh
#   VERISONIC_PKG_VERSION=1.0.6 broadcaster/installer/macos/build_macos_pkg.sh
#   KEEP_APP=1 broadcaster/installer/macos/build_macos_pkg.sh   # keep .app in dist/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
APP_NAME="VeriSonic Broadcaster"
PKG_OUTPUT="$DIST_DIR/VeriSonic Broadcaster.pkg"

cd "$ROOT_DIR"

chmod +x "$SCRIPT_DIR/build_app.sh" "$SCRIPT_DIR/build_pkg.sh" "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR/scripts/"*

echo "==> Building VeriSonic Broadcaster.app (PyInstaller)..."
"$SCRIPT_DIR/build_app.sh"

echo "==> Building VeriSonic Broadcaster.pkg..."
"$SCRIPT_DIR/build_pkg.sh"

if [ ! -f "$PKG_OUTPUT" ]; then
  echo "PKG build failed: missing $PKG_OUTPUT" >&2
  exit 1
fi

if [ "${KEEP_APP:-0}" != "1" ]; then
  echo "==> Removing intermediate build artifacts (keeping .pkg only)..."
  rm -rf "$DIST_DIR/$APP_NAME.app" "$DIST_DIR/$APP_NAME" 2>/dev/null || true
fi

echo ""
echo "Done. macOS installer:"
echo "  $PKG_OUTPUT"
ls -lh "$PKG_OUTPUT"
