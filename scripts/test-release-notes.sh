#!/usr/bin/env bash
# Renders the release notes for a past release and checks they are for
# players (D116): no bullet twice, no release title, no dependency bumps, no formatting
# commits, and the Install section on top. Then checks how a squash title
# and its body lines render on top of that tag. Needs the tags (fetch-depth 0)
# and git-cliff 2.14.2.
# Usage: scripts/test-release-notes.sh [tag]   (default v0.7.0)
set -euo pipefail

tag="${1:-v0.7.0}"
root="$(git rev-parse --show-toplevel)"
notes="$(bash "${root}/.github/scripts/release-notes.sh" "$tag")"
fail=0

bullets="$(printf '%s\n' "$notes" | sed -n '/^## What.s new/,$p' | grep '^- ' | sed -E 's/ \(\[[0-9a-f]{7}\]\(.*\)\)$//' \
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
if printf '%s\n' "$notes" | grep -qiE '^- v?[0-9]+\.[0-9]+'; then
  echo "a release title is in the notes"
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
if printf '%s\n' "$notes" | grep -qE '^### (Other|Maintenance)'; then
  echo "the notes show an Other or Maintenance group"
  fail=1
fi

# A squash title of any type keeps its body lines (git-cliff parses the
# whole commit first), and a summary title is not shown next to them.
squash() {
  local commit
  commit="$(git commit-tree "${tag}^{tree}" -p "${tag}^{commit}" -m "$1" -m "$2")"
  git cliff --config "${root}/cliff.toml" --strip all "${tag}..${commit}" 2>/dev/null |
    grep '^- ' | sed -E 's/ \(\[[0-9a-f]{7}\]\(.*\)\)$//' | tr '\n' '|'
}
body=$'* feat(addon): a player feature\n\n* fix(server): a player fix\n\n* ci: a pipeline change'
expect() {
  if [ "$2" != "$3" ]; then
    echo "squash case '$1': got '$2', want '$3'"
    fail=1
  fi
}
expect "chore title" "$(squash 'chore: tidy up (#1)' "$body")" "- A player feature|- A player fix|"
expect "feat title" "$(squash 'feat: summary (#1)' "$body")" "- A player feature|- A player fix|"
expect "maintenance only" "$(squash 'ci: pipeline (#1)' $'* ci: one\n\n* chore: two')" ""
expect "title only" "$(squash 'feat(addon): one thing (#1)' '')" "- One thing|"

if [ "$fail" -ne 0 ]; then
  printf '\n%s\n' "$notes"
  exit 1
fi
echo "release notes for ${tag}: $(printf '%s\n' "$bullets" | wc -l | tr -d ' ') bullets, for players only"
