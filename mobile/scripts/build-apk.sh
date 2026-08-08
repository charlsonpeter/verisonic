#!/usr/bin/env bash
# Build a release APK for VeriSonic mobile (Android).
# Usage (from mobile/):
#   ./scripts/build-apk.sh
#   npm run build:apk
#   ./scripts/build-apk.sh --no-daemon   # one-shot / CI

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APK_OUT="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"

if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "error: android/ not found at $ANDROID_DIR" >&2
  echo "Run 'npx expo prebuild --platform android' first." >&2
  exit 1
fi

# Prefer Android Studio JBR (needs JDK 17+). Don't use Homebrew openjdk@8.
if [[ -z "${JAVA_HOME:-}" ]] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -Eq '"1[1-9]|"2[0-9]'; then
  STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [[ -x "$STUDIO_JBR/bin/java" ]]; then
    export JAVA_HOME="$STUDIO_JBR"
  fi
fi

if [[ -z "${JAVA_HOME:-}" ]] || [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "error: JAVA_HOME must point to JDK 11+ (Android Studio JBR recommended)." >&2
  exit 1
fi

export PATH="$JAVA_HOME/bin:$PATH"
export NODE_ENV="${NODE_ENV:-production}"

echo "==> JAVA_HOME=$JAVA_HOME"
echo "==> NODE_ENV=$NODE_ENV"
java -version
echo "==> Building release APK..."

cd "$ANDROID_DIR"
# Use the Gradle daemon for faster incremental builds.
# Pass --no-daemon for one-shot/CI: ./scripts/build-apk.sh --no-daemon
GRADLE_ARGS=("assembleRelease")
if [[ "${1:-}" == "--no-daemon" ]]; then
  GRADLE_ARGS+=("--no-daemon")
fi
./gradlew "${GRADLE_ARGS[@]}"

if [[ ! -f "$APK_OUT" ]]; then
  echo "error: APK not found at $APK_OUT" >&2
  exit 1
fi

SIZE="$(du -h "$APK_OUT" | awk '{print $1}')"
echo ""
echo "BUILD OK"
echo "APK: $APK_OUT ($SIZE)"
if [[ "${1:-}" != "--no-daemon" ]]; then
  echo "(Gradle daemon left running for faster next builds)"
fi
