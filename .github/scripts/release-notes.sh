#!/usr/bin/env bash
# Prints one release body (docs/adr/0022): the Install / Download section,
# then what changed since the previous release of the same kind.
# Usage: release-notes.sh addon|companion <tag>
set -euo pipefail

kind="$1"
tag="$2"
case "$kind" in
  addon) glob="v[0-9]*" ;;
  companion) glob="companion-v[0-9]*" ;;
  *) echo "kind must be addon or companion" >&2; exit 2 ;;
esac
version="${tag#companion-}"
version="${version#v}"
root="$(git rev-parse --show-toplevel)"

sed "s/{{VERSION}}/${version}/g" "${root}/.github/release/${kind}-install.md"
echo
echo "## What's new in ${version}"

previous="$(git tag --list "$glob" --sort=-v:refname --merged "$tag" | grep -vx "$tag" | head -n 1 || true)"
range="$tag"
if [ -n "$previous" ]; then
  range="${previous}..${tag}"
fi
notes="$(NOTES_SCOPE="$kind" git cliff --config "${root}/cliff.toml" --strip all "$range" 2>/dev/null || true)"
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  notes="Maintenance release: no changes players will notice."
fi
printf '%s\n' "$notes"
if [ -n "$previous" ]; then
  echo
  echo "<sub>All changes: [${previous}...${tag}](https://github.com/hmbanan666/wow-unbored/compare/${previous}...${tag})</sub>"
fi
