#!/usr/bin/env bash
# One version across the addon, Companion, and Server (docs/adr/0026).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
want="$(node -p "require('${root}/package.json').version")"
fail=0
check() {
  if ! grep -q "$want" "$1"; then
    echo "expected ${want} in $1" >&2
    fail=1
  fi
}
check "${root}/addon/Unbored.toc"
check "${root}/addon/Core/Namespace.lua"
check "${root}/apps/companion/package.json"
check "${root}/apps/companion/src-tauri/Cargo.toml"
check "${root}/apps/companion/src-tauri/tauri.conf.json"
check "${root}/apps/companion/src-tauri/src/plan.rs"
check "${root}/apps/server/package.json"
check "${root}/packages/contracts/package.json"
check "${root}/apps/server/src/mcp.ts"
locked="$(awk '/^name = "unbored-companion"$/ { getline; print; exit }' "${root}/apps/companion/src-tauri/Cargo.lock")"
if [ "$locked" != "version = \"${want}\"" ]; then
  echo "expected ${want} for unbored-companion in Cargo.lock, found: ${locked}" >&2
  fail=1
fi
endpoint="https://github.com/hmbanan666/wow-unbored/releases/download/companion-updater/latest.json"
if ! grep -q "$endpoint" "${root}/apps/companion/src-tauri/tauri.conf.json"; then
  echo "the Companion updater endpoint changed; installed 0.5 and 0.6 apps would stop updating" >&2
  fail=1
fi
exit "$fail"
