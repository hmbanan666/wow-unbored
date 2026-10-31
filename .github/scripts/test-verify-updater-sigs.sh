#!/usr/bin/env bash
# Checks verify-updater-sigs.sh with throwaway keys: a matching key passes,
# another key or a changed installer fails.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

make_key() {
  minisign -G -W -f -p "$work/$1.pub" -s "$work/$1.key" > /dev/null
  base64 -w0 < "$work/$1.pub" > "$work/$1.pub.b64"
}
make_key good
make_key other

mkdir "$work/bundle"
printf 'setup' > "$work/bundle/Unbored.Companion_9.9.9_x64-setup.exe"
printf 'msi' > "$work/bundle/Unbored.Companion_9.9.9_x64_en-US.msi"
for file in "$work"/bundle/*.exe "$work"/bundle/*.msi; do
  minisign -S -s "$work/good.key" -m "$file" -x "$work/raw.sig" > /dev/null
  base64 -w0 < "$work/raw.sig" > "$file.sig"
done

bash "$here/verify-updater-sigs.sh" "$work/bundle" "$work/good.pub.b64" > /dev/null
if bash "$here/verify-updater-sigs.sh" "$work/bundle" "$work/other.pub.b64" > /dev/null 2>&1; then
  echo "a signature from another key passed"
  exit 1
fi
printf 'changed' > "$work/bundle/Unbored.Companion_9.9.9_x64_en-US.msi"
if bash "$here/verify-updater-sigs.sh" "$work/bundle" "$work/good.pub.b64" > /dev/null 2>&1; then
  echo "a changed installer passed"
  exit 1
fi
echo "updater signature check ok"
