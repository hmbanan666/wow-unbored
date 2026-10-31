#!/usr/bin/env bash
# D216: the release build restores the Windows Rust cache that the Companion
# workflow saves on main, so both must name the same shared key.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
failed=0
for workflow in release.yml companion.yml; do
  if ! grep -q "shared-key: companion-windows" "$root/.github/workflows/$workflow"; then
    echo "::error::$workflow has no rust-cache shared-key: companion-windows"
    failed=1
  fi
done
if ! grep -q "save-if: \${{ github.ref == 'refs/heads/main' }}" "$root/.github/workflows/companion.yml"; then
  echo "::error::companion.yml must save the Windows cache on main only"
  failed=1
fi
[ "$failed" -eq 0 ] && echo "rust cache key shared"
exit "$failed"
