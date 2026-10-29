#!/usr/bin/env bash
# The BigWigs packager only packages a TOC at the checkout root, and it
# skips untracked files. Copy the addon there and stage it for this job.
# Nothing here is committed (docs/adr/0023).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
cp -a addon/Unbored.toc addon/Bindings.xml addon/Core addon/Data addon/Providers addon/UI addon/Media addon/Companion .
git add -f Unbored.toc Bindings.xml Core Data Providers UI Media Companion
