#!/usr/bin/env bash
# The packaged TOC must keep every Interface value of addon/Unbored.toc,
# so one zip loads in Retail and in WoW Forever (16001). docs/adr/0100
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
src="${1:-$root/addon/Unbored.toc}"
packed="${2:-$root/.release/Unbored/Unbored.toc}"
interfaces() {
  awk -F: '/^## Interface:/ { gsub(/[ \t\r]/, "", $2); print $2; exit }' "$1" | tr ',' '\n' | sort -u
}
want="$(interfaces "$src")"
have="$(interfaces "$packed")"
echo "Source Interface: $(echo $want)"
echo "Packaged Interface: $(echo $have)"
missing="$(comm -23 <(echo "$want") <(echo "$have"))"
if [ -n "$missing" ]; then
  echo "::error::the packaged TOC lost Interface values: $(echo $missing)"
  exit 1
fi
grep -qx '16001' <<< "$have" || { echo "::error::the packaged TOC has no Forever interface 16001"; exit 1; }
