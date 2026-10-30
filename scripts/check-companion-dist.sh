#!/usr/bin/env bash
# Fails when the built Companion window misses a Wisp picture or links a file
# that is not in dist/. Run after `vp build` in apps/companion.
set -euo pipefail

dist="${1:-apps/companion/dist}"
[ -f "$dist/index.html" ] || { echo "no $dist/index.html, run vp build first" >&2; exit 1; }

fail=0
for name in wisp-idle wisp-happy wisp-thinking; do
  if ! find "$dist" -type f -name "${name}*.png" | grep -q .; then
    echo "missing picture: $name in $dist" >&2
    fail=1
  fi
done

while read -r ref; do
  case "$ref" in
    http:* | https:* | data:* | "#"* | "") continue ;;
  esac
  path="${ref%%[?#]*}"
  path="${path#./}"
  path="${path#/}"
  if [ ! -f "$dist/$path" ]; then
    echo "index.html links a missing file: $ref" >&2
    fail=1
  fi
done < <(grep -oE '(src|href)="[^"]*"' "$dist/index.html" | sed -E 's/^(src|href)="//; s/"$//')

exit "$fail"
