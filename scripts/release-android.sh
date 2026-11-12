#!/bin/bash
# Android APK kiadása a repó `releases` ágára – innen frissít az app ("Frissítés" gomb).
# Az ágon mindig csak a legutolsó verzió van (az előzményt felülírjuk), így a repó nem hízik.
# Használat: scripts/release-android.sh path/to/app-release.apk "Mi változott"
# A verziót az app.json "expo.version" mezőjéből veszi.
set -euo pipefail
APK="$(realpath "$1")"
NOTES="${2:-}"
ROOT="$(git rev-parse --show-toplevel)"
VERSION=$(node -p "require('$ROOT/app.json').expo.version")
NAME="Koltesfigyelo-$VERSION.apk"
SIZE=$(stat -c %s "$APK")
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
git init -q -b releases
cp "$APK" "$NAME"
node -e 'const [v,n,a,s]=process.argv.slice(1); require("fs").writeFileSync("latest.json", JSON.stringify({version:v, notes:n, apk:a, size:Number(s)}, null, 2)+"\n")' \
  "$VERSION" "$NOTES" "$NAME" "$SIZE"
printf '# Költésfigyelő – kiadások\n\nLegutolsó verzió: **%s** – [%s](%s)\n' "$VERSION" "$NAME" "$NAME" > README.md
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -qm "Release $VERSION"
git push -f "$(git -C "$ROOT" remote get-url origin)" releases:releases
echo "Kiadva: $VERSION"
