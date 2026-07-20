#!/bin/bash
# Install VeriSonic Broadcaster.pkg to /Applications (no manual copy).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DIST_DIR="${VERISONIC_DIST_DIR:-$ROOT_DIR/broadcaster/dist}"
PKG="$DIST_DIR/VeriSonic Broadcaster.pkg"
APP="/Applications/VeriSonic Broadcaster.app"

if [ ! -f "$PKG" ]; then
  echo "Missing installer: $PKG" >&2
  echo "Build first:" >&2
  echo "  VERISONIC_PKG_VERSION=1.0.5 broadcaster/installer/macos/build_macos_pkg.sh" >&2
  exit 1
fi

echo "Quitting any running VeriSonic Broadcaster..."
pkill -f "VeriSonic Broadcaster.app/Contents/MacOS/VeriSonic Broadcaster" 2>/dev/null || true
sleep 1

echo "Installing $PKG ..."
echo "(You may be prompted for your Mac password.)"
sudo installer -pkg "$PKG" -target / -verbose

if [ ! -d "$APP" ]; then
  echo "Install finished but $APP is missing." >&2
  echo "Check /var/log/verisonic-broadcaster-install.log" >&2
  exit 1
fi

xattr -cr "$APP" 2>/dev/null || true

echo "Resetting stale microphone permissions for this bundle id..."
tccutil reset Microphone com.verisonic.broadcaster 2>/dev/null || true

echo "Installed: $APP"
echo "On first Connect Live, allow Microphone access when macOS prompts."
open "$APP"
