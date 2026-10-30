#!/usr/bin/env bash
# Fails when rendered release notes would show players something that is not
# for them (D116): a version-titled line, the old mascot name, or a
# maintenance change that leaked into Features, Fixes or Performance.
# Pass the commit lines too (one "type(scope): subject" per line) to also
# catch a feat/fix whose scope says it is maintenance.
# Usage: scripts/check-release-notes.sh <notes.md> [commit-lines.txt]
set -euo pipefail

notes_file="$1"
lines_file="${2:-}"
fail=0

bullets="$(sed -n '/^## What.s new/,$p' "$notes_file" | grep '^- ' |
  sed -E 's/ \(\[[0-9a-f]{7}\]\(.*\)\)$//' || true)"

say() {
  echo "::error::${1//$'\n'/ | }"
  fail=1
}

versioned="$(printf '%s\n' "$bullets" | grep -iE '^- v?[0-9]+\.[0-9]+' || true)"
[ -n "$versioned" ] && say "a release title is in the notes: ${versioned}"

wisp="$(printf '%s\n' "$bullets" | grep -iwE 'wisp' || true)"
[ -n "$wisp" ] && say "the notes still say Wisp, the mascot is Bory: ${wisp}"

# Words a player never needs in release notes. A change about them is ci:,
# chore:, refactor:, test: or docs:, which the notes leave out.
maintenance='ci|clippy|lint|linter|luacheck|rustfmt|cargo fmt|prettier|workflows?|github actions|refactor|typo|bump(s|ed)?|deps|dependency|dependencies|unit tests?|tests?|test suite|changelog|release notes|tooling|dry run'
leaked="$(printf '%s\n' "$bullets" | grep -iwE "$maintenance" || true)"
[ -n "$leaked" ] && say "a maintenance change is in the notes, use ci:, chore:, refactor:, test: or docs: for it: ${leaked}"

if [ -n "$lines_file" ] && [ -s "$lines_file" ]; then
  scoped="$(grep -E '^(feat|fix|perf)\((ci|build|deps|release|test|tests|docs|lint|tooling)\)!?:' "$lines_file" || true)"
  [ -n "$scoped" ] && say "a player type with a maintenance scope: ${scoped}"
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "release notes are for players: $(printf '%s\n' "$bullets" | grep -c '^- ' || true) lines"
