#!/usr/bin/env bash
# The minisign public key embedded in the Companion (tauri.conf.json).
# The release dry run prints it so a tag is not cut with the wrong key.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
jq -r '.plugins.updater.pubkey' "$root/apps/companion/src-tauri/tauri.conf.json"
