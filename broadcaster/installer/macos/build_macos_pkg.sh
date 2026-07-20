#!/bin/bash
# Build the macOS .pkg installer (builds the .app in a temp dir, packages it).
# Output: broadcaster/dist/VeriSonic Broadcaster.pkg (no .app left in dist/)
#
# Usage:
#   broadcaster/installer/macos/build_macos_pkg.sh
#   VERISONIC_PKG_VERSION=1.0.6 broadcaster/installer/macos/build_macos_pkg.sh
#   KEEP_APP=1 broadcaster/installer/macos/build_macos_pkg.sh   # also copy .app to dist/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
FINAL_DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
APP_NAME="VeriSonic Broadcaster"
PKG_OUTPUT="$FINAL_DIST_DIR/VeriSonic Broadcaster.pkg"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/verisonic-pkg-staging.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"
mkdir -p "$FINAL_DIST_DIR"

chmod +x "$SCRIPT_DIR/build_app.sh" "$SCRIPT_DIR/build_pkg.sh" "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR/scripts/"*

echo "==> Building VeriSonic Broadcaster.app (PyInstaller, staging)..."
VERISONIC_DIST_DIR="$STAGING_DIR" "$SCRIPT_DIR/build_app.sh"

echo "==> Building VeriSonic Broadcaster.pkg..."
VERISONIC_DIST_DIR="$STAGING_DIR" "$SCRIPT_DIR/build_pkg.sh"

STAGING_PKG="$STAGING_DIR/VeriSonic Broadcaster.pkg"
if [ ! -f "$STAGING_PKG" ]; then
  echo "PKG build failed: missing $STAGING_PKG" >&2
  exit 1
fi

mv -f "$STAGING_PKG" "$PKG_OUTPUT"

if [ "${KEEP_APP:-0}" = "1" ]; then
  echo "==> KEEP_APP=1: copying $APP_NAME.app to $FINAL_DIST_DIR for inspection."
  rm -rf "$FINAL_DIST_DIR/$APP_NAME.app" 2>/dev/null || true
  ditto --noextattr --norsrc "$STAGING_DIR/$APP_NAME.app" "$FINAL_DIST_DIR/$APP_NAME.app"
else
  rm -rf "$FINAL_DIST_DIR/$APP_NAME.app" "$FINAL_DIST_DIR/$APP_NAME" 2>/dev/null || true
fi

echo ""
echo "Done. macOS installer:"
echo "  $PKG_OUTPUT"
ls -lh "$PKG_OUTPUT"
