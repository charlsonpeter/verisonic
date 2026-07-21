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
OUTPUT="$DIST_DIR/verisonic-broadcaster_amd64.deb"
TEMPLATE="$SCRIPT_DIR/debian"

if [ ! -f "$BINARY" ]; then
  echo "Missing PyInstaller binary: $BINARY" >&2
  exit 1
fi

rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$TEMPLATE/." "$STAGING/"
sed -i "s/^Version: .*/Version: $DEB_VERSION/" "$STAGING/DEBIAN/control"

mkdir -p "$STAGING/usr/bin" \
  "$STAGING/usr/share/doc/verisonic-broadcaster" \
  "$STAGING/usr/share/pixmaps" \
  "$STAGING/usr/share/applications" \
  "$STAGING/usr/share/icons/hicolor/48x48/apps" \
  "$STAGING/usr/share/icons/hicolor/128x128/apps" \
  "$STAGING/usr/share/icons/hicolor/256x256/apps" \
  "$STAGING/usr/share/icons/hicolor/512x512/apps"
cp "$BINARY" "$STAGING/usr/bin/verisonic-broadcaster"
chmod 755 "$STAGING/usr/bin/verisonic-broadcaster"
cp "$SCRIPT_DIR/../assets/audio-permissions.txt" "$STAGING/usr/share/doc/verisonic-broadcaster/audio-permissions.txt"

ICON_SRC="$BROADCASTER_DIR/assets/icon.png"
if [ ! -f "$ICON_SRC" ]; then
  python3 "$BROADCASTER_DIR/generate_icons.py"
fi
if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$STAGING/usr/share/pixmaps/verisonic-broadcaster.png"
  # GNOME/Ubuntu resolve Icon= name from the hicolor theme more reliably than pixmaps alone.
  if command -v convert >/dev/null 2>&1; then
    convert "$ICON_SRC" -resize 48x48 "$STAGING/usr/share/icons/hicolor/48x48/apps/verisonic-broadcaster.png"
    convert "$ICON_SRC" -resize 128x128 "$STAGING/usr/share/icons/hicolor/128x128/apps/verisonic-broadcaster.png"
    convert "$ICON_SRC" -resize 256x256 "$STAGING/usr/share/icons/hicolor/256x256/apps/verisonic-broadcaster.png"
    convert "$ICON_SRC" -resize 512x512 "$STAGING/usr/share/icons/hicolor/512x512/apps/verisonic-broadcaster.png"
  else
    # Fallback without ImageMagick: install the source PNG at each size path.
    cp "$ICON_SRC" "$STAGING/usr/share/icons/hicolor/48x48/apps/verisonic-broadcaster.png"
    cp "$ICON_SRC" "$STAGING/usr/share/icons/hicolor/128x128/apps/verisonic-broadcaster.png"
    cp "$ICON_SRC" "$STAGING/usr/share/icons/hicolor/256x256/apps/verisonic-broadcaster.png"
    cp "$ICON_SRC" "$STAGING/usr/share/icons/hicolor/512x512/apps/verisonic-broadcaster.png"
  fi
fi

# Ensure applications launcher entry exists (template may already include it).
if [ ! -f "$STAGING/usr/share/applications/verisonic-broadcaster.desktop" ]; then
  cat > "$STAGING/usr/share/applications/verisonic-broadcaster.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Version=1.0
Name=VeriSonic Broadcaster
GenericName=Live Audio Broadcaster
Comment=Secure RJ & Administrator live audio broadcaster for VeriSonic
Exec=/usr/bin/verisonic-broadcaster
Icon=verisonic-broadcaster
Terminal=false
Categories=AudioVideo;Audio;Network;
StartupNotify=true
StartupWMClass=verisonic-broadcaster
Keywords=radio;broadcast;microphone;stream;
EOF
fi

chmod 755 "$STAGING/DEBIAN/postinst" "$STAGING/DEBIAN/prerm"
find "$STAGING/etc" "$STAGING/usr" -type f ! -path "$STAGING/usr/bin/*" -exec chmod 644 {} \;
chmod 755 "$STAGING/usr/bin/verisonic-broadcaster"
chmod 755 "$STAGING/etc/xdg/autostart" 2>/dev/null || true

dpkg-deb --build --root-owner-group "$STAGING" "$OUTPUT"
echo "Created installer: $OUTPUT (version $DEB_VERSION)"
