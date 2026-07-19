#!/bin/bash
# Copy the built .app into /Applications (manual install when .pkg did not land correctly).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="$BROADCASTER_DIR/dist"
APP_NAME="VeriSonic Broadcaster"
SRC_APP="$DIST_DIR/$APP_NAME.app"
DEST_APP="/Applications/$APP_NAME.app"

if [ ! -d "$SRC_APP" ]; then
  echo "Build the app first: broadcaster/installer/macos/build_app.sh" >&2
  exit 1
fi

echo "Installing $APP_NAME to /Applications ..."
if [ -d "$DEST_APP" ]; then
  rm -rf "$DEST_APP"
fi

COPYFILE_DISABLE=1 cp -R "$SRC_APP" "$DEST_APP"
xattr -cr "$DEST_APP" 2>/dev/null || true

if [ ! -d "$DEST_APP" ]; then
  echo "Install failed." >&2
  exit 1
fi

echo "Installed: $DEST_APP"
echo "Open Finder → Applications, or run:"
echo "  open \"$DEST_APP\""
