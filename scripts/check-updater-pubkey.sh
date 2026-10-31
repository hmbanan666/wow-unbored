#!/usr/bin/env bash
# D151: the pubkey the Companion embeds (tauri.conf.json) must be the
# committed new public key, so a revert to the old key cannot ship.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
embedded="$(bash "$root/scripts/print-updater-pubkey.sh")"
expected="$(tr -d '[:space:]' < "$root/apps/companion/src-tauri/updater-pubkey-v2.pub")"
if [ "$embedded" != "$expected" ]; then
  echo "::error::the updater pubkey in tauri.conf.json is not apps/companion/src-tauri/updater-pubkey-v2.pub"
  exit 1
fi
echo "The embedded updater pubkey is updater-pubkey-v2.pub."
