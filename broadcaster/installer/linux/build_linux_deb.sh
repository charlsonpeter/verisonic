#!/bin/bash
# Build the Linux .deb installer (PyInstaller binary + dpkg-deb package).
# Output: broadcaster/dist/verisonic-broadcaster_<version>_amd64.deb
#
# Usage:
#   broadcaster/installer/linux/build_linux_deb.sh
#   VERISONIC_DEB_VERSION=1.0.0 broadcaster/installer/linux/build_linux_deb.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
FINAL_DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
DEB_VERSION="${VERISONIC_DEB_VERSION:-1.0.0}"
PKG_OUTPUT="$FINAL_DIST_DIR/verisonic-broadcaster_${DEB_VERSION}_amd64.deb"

cd "$ROOT_DIR"
mkdir -p "$FINAL_DIST_DIR"

chmod +x "$SCRIPT_DIR/build_app.sh" "$SCRIPT_DIR/build_deb.sh"

echo "==> Building verisonic-broadcaster (PyInstaller)..."
VERISONIC_DIST_DIR="$FINAL_DIST_DIR" "$SCRIPT_DIR/build_app.sh"

echo "==> Building verisonic-broadcaster_${DEB_VERSION}_amd64.deb..."
VERISONIC_DIST_DIR="$FINAL_DIST_DIR" VERISONIC_DEB_VERSION="$DEB_VERSION" "$SCRIPT_DIR/build_deb.sh"

if [ ! -f "$PKG_OUTPUT" ]; then
  echo "Deb build failed: missing $PKG_OUTPUT" >&2
  exit 1
fi

echo ""
echo "Done. Linux installer:"
echo "  $PKG_OUTPUT"
ls -lh "$PKG_OUTPUT"
