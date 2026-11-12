#!/bin/bash
# Android APK kiadása GitHub Releasesbe – innen frissít az app ("Frissítés" gomb).
# Használat: scripts/release-android.sh path/to/app-release.apk "Mi változott"
# A verziót az app.json "expo.version" mezőjéből veszi (tag: v<verzió>).
set -euo pipefail
APK="$1"
NOTES="${2:-}"
REPO="Adammagyar00/koltesfigyelo"
VERSION=$(node -p "require('./app.json').expo.version")
TAG="v$VERSION"
NAME="Koltesfigyelo-$VERSION.apk"

echo "Kiadás: $TAG ($APK)"
RELEASE_ID=$(gh api "repos/$REPO/releases" -f tag_name="$TAG" -f target_commitish="$(git rev-parse HEAD)" \
  -f name="Költésfigyelő $VERSION" -f body="$NOTES" --jq .id)
gh api -X POST "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$NAME" \
  -H "Content-Type: application/vnd.android.package-archive" --input "$APK" --jq .browser_download_url
