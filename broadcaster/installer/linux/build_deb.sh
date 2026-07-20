#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BROADCASTER_DIR="$ROOT_DIR/broadcaster"
DIST_DIR="${VERISONIC_DIST_DIR:-$BROADCASTER_DIR/dist}"
BUILD_DIR="$BROADCASTER_DIR/build"
BINARY="$DIST_DIR/verisonic-broadcaster"
STAGING="$BUILD_DIR/deb-staging"
DEB_VERSION="${VERISONIC_DEB_VERSION:-1.0.0}"
OUTPUT="$DIST_DIR/verisonic-broadcaster_${DEB_VERSION}_amd64.deb"
TEMPLATE="$SCRIPT_DIR/debian"

if [ ! -f "$BINARY" ]; then
  echo "Missing PyInstaller binary: $BINARY" >&2
  exit 1
fi

rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$TEMPLATE/." "$STAGING/"
sed -i "s/^Version: .*/Version: $DEB_VERSION/" "$STAGING/DEBIAN/control"

mkdir -p "$STAGING/usr/bin" "$STAGING/usr/share/doc/verisonic-broadcaster" "$STAGING/usr/share/pixmaps"
cp "$BINARY" "$STAGING/usr/bin/verisonic-broadcaster"
chmod 755 "$STAGING/usr/bin/verisonic-broadcaster"
cp "$SCRIPT_DIR/../assets/audio-permissions.txt" "$STAGING/usr/share/doc/verisonic-broadcaster/audio-permissions.txt"

ICON_SRC="$BROADCASTER_DIR/assets/icon.png"
if [ ! -f "$ICON_SRC" ]; then
  python3 "$BROADCASTER_DIR/generate_icons.py"
fi
if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$STAGING/usr/share/pixmaps/verisonic-broadcaster.png"
fi

chmod 755 "$STAGING/DEBIAN/postinst" "$STAGING/DEBIAN/prerm"
find "$STAGING/etc" "$STAGING/usr" -type f ! -path "$STAGING/usr/bin/*" -exec chmod 644 {} \;
chmod 755 "$STAGING/usr/bin/verisonic-broadcaster"
chmod 755 "$STAGING/etc/xdg/autostart" 2>/dev/null || true

dpkg-deb --build --root-owner-group "$STAGING" "$OUTPUT"
echo "Created installer: $OUTPUT (version $DEB_VERSION)"
