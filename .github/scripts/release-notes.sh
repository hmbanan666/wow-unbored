#!/usr/bin/env bash
# Prints one release body (docs/adr/0022, docs/adr/0026): the Install /
# Download section, then what changed since the previous vX.Y.Z tag.
# Usage: release-notes.sh <tag> [version]
# The dry run passes HEAD and the version it would release (D117).
set -euo pipefail

tag="$1"
version="${2:-${tag#v}}"
root="$(git rev-parse --show-toplevel)"

sed "s/{{VERSION}}/${version}/g" "${root}/.github/release/install.md"
echo
echo "## What's new in ${version}"

previous="$(git tag --list 'v[0-9]*' --sort=-v:refname --merged "$tag" | grep -vx "$tag" | grep -v '^companion-v' | head -n 1 || true)"
range="$tag"
if [ -n "$previous" ]; then
  range="${previous}..${tag}"
fi
notes="$(git cliff --config "${root}/cliff.toml" --strip all "$range")"
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  notes="Maintenance release: no changes players will notice."
fi
printf '%s\n' "$notes"
if [ -n "$previous" ]; then
  echo
  echo "<sub>All changes: [${previous}...${tag}](https://github.com/hmbanan666/wow-unbored/compare/${previous}...${tag})</sub>"
fi
