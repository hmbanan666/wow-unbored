#!/usr/bin/env bash
# D218: every installer signature in <dir> must verify against the committed
# updater public key, so a build signed with the wrong key never reaches the
# feed that installed Companions trust. Tauri writes both the .sig and the
# .pub as base64 of the minisign text; minisign reads the decoded text.
# Usage: verify-updater-sigs.sh <dir> [pubkey-file]
set -euo pipefail
shopt -s nullglob

dir="$1"
root="$(cd "$(dirname "$0")/../.." && pwd)"
pubkey="${2:-$root/apps/companion/src-tauri/updater-pubkey-v2.pub}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

base64 -d < "$pubkey" > "$work/key.pub"
sigs=("$dir"/*.sig)
if [ "${#sigs[@]}" -eq 0 ]; then
  echo "::error::no .sig files in $dir"
  exit 1
fi
failed=0
for sig in "${sigs[@]}"; do
  file="${sig%.sig}"
  name="$(basename "$file")"
  if [ ! -f "$file" ]; then
    echo "::error::$name.sig has no $name next to it"
    failed=1
    continue
  fi
  base64 -d < "$sig" > "$work/file.minisig"
  if minisign -V -q -p "$work/key.pub" -x "$work/file.minisig" -m "$file"; then
    echo "$name: signed with the updater key"
  else
    echo "::error::$name is not signed with $(basename "$pubkey")"
    failed=1
  fi
done
exit "$failed"
