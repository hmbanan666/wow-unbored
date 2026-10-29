#!/usr/bin/env bash
# Print latest.json in the shape installed Companions already read
# (version, notes, pub_date, platforms.windows-x86_64 / -nsis / -msi).
# The nsis setup.exe is the file windows-x86_64 points at.
# Usage: updater-json.sh <version> <repo> <nsis-exe> <nsis-sig> <msi> <msi-sig>
set -euo pipefail
version="$1"
repo="$2"
nsis="$3"
nsis_sig="$4"
msi="$5"
msi_sig="$6"
export VERSION="$version"
export REPO="$repo"
export NSIS_NAME="$(basename "$nsis")"
export MSI_NAME="$(basename "$msi")"
export NSIS_SIG="$(cat "$nsis_sig")"
export MSI_SIG="$(cat "$msi_sig")"
export PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 - <<'PY'
import json, os
version = os.environ["VERSION"]
base = f"https://github.com/{os.environ['REPO']}/releases/download/v{version}"
nsis = {
    "signature": os.environ["NSIS_SIG"].strip(),
    "url": f"{base}/{os.environ['NSIS_NAME']}",
}
msi = {
    "signature": os.environ["MSI_SIG"].strip(),
    "url": f"{base}/{os.environ['MSI_NAME']}",
}
print(json.dumps({
    "version": version,
    "notes": "Download the file ending in -setup.exe.",
    "pub_date": os.environ["PUB_DATE"],
    "platforms": {
        "windows-x86_64": nsis,
        "windows-x86_64-nsis": nsis,
        "windows-x86_64-msi": msi,
    },
}, indent=2))
print()
PY
