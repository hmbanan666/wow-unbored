#!/usr/bin/env bash
# The Companion build artifacts, ready to attach (D117), for both the tag
# release and the dry run: flattens the nsis/ and msi/ folders, turns a space
# in a file name into a dot (GitHub stores asset names that way, and
# latest.json must match), checks the asset names, and writes and validates
# <dir>/latest.json. An unsigned build gets placeholder signatures, so the
# feed can still be checked; it is never published (see release.yml).
# Prints signed=true or signed=false as its last line.
# Usage: collect-bundle.sh <version> <owner/repo> <dir>
set -euo pipefail
shopt -s nullglob

version="$1"
repo="$2"
dir="$3"
here="$(cd "$(dirname "$0")" && pwd)"

find "$dir" -mindepth 2 -type f -exec mv -t "$dir" {} +
find "$dir" -mindepth 1 -type d -empty -delete
for file in "$dir"/*" "*; do
  mv "$file" "${file// /.}"
done

nsis="$dir/Unbored.Companion_${version}_x64-setup.exe"
msi="$dir/Unbored.Companion_${version}_x64_en-US.msi"
missing=0
for file in "$nsis" "$msi"; do
  if [ ! -f "$file" ]; then
    echo "::error::the Companion build has no $(basename "$file")"
    missing=1
  fi
done
installers=("$dir"/*.exe "$dir"/*.msi)
if [ "$missing" -ne 0 ] || [ "${#installers[@]}" -ne 2 ]; then
  echo "expected exactly one setup.exe and one msi for ${version}, found:"
  ls -1 "$dir"
  exit 1
fi

signed="false"
if [ -f "$dir/signed.txt" ]; then
  signed="$(tr -d '[:space:]' < "$dir/signed.txt")"
fi
if [ "$signed" = "true" ]; then
  nsis_sig="$nsis.sig"
  msi_sig="$msi.sig"
  if [ ! -f "$nsis_sig" ] || [ ! -f "$msi_sig" ]; then
    echo "::error::a signed build needs a .sig for the setup.exe and the msi"
    ls -1 "$dir"
    exit 1
  fi
else
  placeholder="$(mktemp -d)"
  nsis_sig="$placeholder/nsis.sig"
  msi_sig="$placeholder/msi.sig"
  echo "unsigned-dry-run" > "$nsis_sig"
  echo "unsigned-dry-run" > "$msi_sig"
fi

bash "$here/updater-json.sh" "$version" "$repo" "$nsis" "$nsis_sig" "$msi" "$msi_sig" > "$dir/latest.json"
base="https://github.com/${repo}/releases/download/v${version}"
jq -e --arg v "$version" --arg base "$base" '
  .version == $v
  and (.platforms | keys == ["windows-x86_64", "windows-x86_64-msi", "windows-x86_64-nsis"])
  and .platforms["windows-x86_64-nsis"].url == "\($base)/Unbored.Companion_\($v)_x64-setup.exe"
  and .platforms["windows-x86_64-msi"].url == "\($base)/Unbored.Companion_\($v)_x64_en-US.msi"
  and .platforms["windows-x86_64"] == .platforms["windows-x86_64-nsis"]
  and ([.platforms[].signature | length > 0] | all)
' "$dir/latest.json" > /dev/null || {
  echo "::error::latest.json does not have the shape installed Companions read"
  cat "$dir/latest.json"
  exit 1
}

echo "signed=${signed}"
