#!/usr/bin/env bash
# Renders the release notes for a past release and checks they are for
# players (D116): no bullet twice, no dependency bumps, no formatting
# commits, and the Install section on top. Needs the tags (fetch-depth 0)
# and git-cliff 2.14.2.
# Usage: scripts/test-release-notes.sh [tag]   (default v0.7.0)
set -euo pipefail

tag="${1:-v0.7.0}"
root="$(git rev-parse --show-toplevel)"
notes="$(bash "${root}/.github/scripts/release-notes.sh" "$tag")"
fail=0

bullets="$(printf '%s\n' "$notes" | grep '^- ' | sed -E 's/ \(\[[0-9a-f]{7}\]\(.*\)\)$//' \
  | tr '[:upper:]' '[:lower:]' | sed -E 's/[.[:space:]]+$//')"
if [ -z "$bullets" ]; then
  echo "no bullets in the notes for ${tag}"
  fail=1
fi
duplicates="$(printf '%s\n' "$bullets" | sort | uniq -d)"
if [ -n "$duplicates" ]; then
  echo "a bullet is shown twice:"
  printf '%s\n' "$duplicates"
  fail=1
fi
if printf '%s\n' "$notes" | grep -qi '^- bump'; then
  echo "a dependency bump is in the notes"
  fail=1
fi
if printf '%s\n' "$notes" | grep -qi '^- format'; then
  echo "a formatting commit is in the notes"
  fail=1
fi
if ! printf '%s\n' "$notes" | grep -q '^## Install'; then
  echo "the notes have no ## Install section"
  fail=1
fi
if printf '%s\n' "$notes" | grep -q '^### Other'; then
  echo "the notes still have an Other group"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  printf '\n%s\n' "$notes"
  exit 1
fi
echo "release notes for ${tag}: $(printf '%s\n' "$bullets" | wc -l | tr -d ' ') bullets, for players only"
