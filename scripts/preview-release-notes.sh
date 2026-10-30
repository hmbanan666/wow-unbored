#!/usr/bin/env bash
# Renders the release notes as if this PR were squash-merged now: the PR
# title as the squash title, every PR commit as a "* subject" line with its
# body, on top of the base branch, since the last vX.Y.Z tag. Then checks
# them with check-release-notes.sh, and writes both to the job summary when
# run in GitHub Actions. Needs the tags (fetch-depth 0) and git-cliff 2.14.2.
# Usage: scripts/preview-release-notes.sh <base> <head> "<PR title>" [number]
# Locally: scripts/preview-release-notes.sh origin/main HEAD "feat: ..."
set -euo pipefail
# The synthetic squash is never pushed, but commit-tree still needs an
# identity, and CI runners have none.
export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Unbored release notes}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-notes@unbored.invalid}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-$GIT_AUTHOR_NAME}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-$GIT_AUTHOR_EMAIL}"

base="$(git rev-parse "$1^{commit}")"
head="$(git rev-parse "$2^{commit}")"
title="$3"
number="${4:-}"
root="$(git rev-parse --show-toplevel)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

subject="$title"
[ -n "$number" ] && subject="${title} (#${number})"
git log --reverse --no-merges --format='* %s%n%n%b' "${base}..${head}" > "$work/body.txt"
git log --reverse --no-merges --format='%s' "${base}..${head}" > "$work/lines.txt"
printf '%s\n' "$title" >> "$work/lines.txt"

squash="$(git commit-tree "${head}^{tree}" -p "$base" -m "$subject" -F "$work/body.txt")"
bash "${root}/.github/scripts/release-notes.sh" "$squash" next > "$work/notes.md"

status=0
bash "${root}/scripts/check-release-notes.sh" "$work/notes.md" "$work/lines.txt" > "$work/check.txt" 2>&1 || status=$?
cat "$work/notes.md"
echo
cat "$work/check.txt"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "# Release notes preview"
    echo
    if [ "$status" -eq 0 ]; then
      echo "These lines go into the next release when this PR is squash-merged with its title."
    else
      echo "**This PR would put lines in the release notes that are not for players.**"
      echo
      echo '```text'
      sed 's/^::error:://' "$work/check.txt"
      echo '```'
    fi
    echo
    sed -n '/^## What.s new/,$p' "$work/notes.md" | grep -v '^<sub>All changes'
  } >> "$GITHUB_STEP_SUMMARY"
fi
exit "$status"
