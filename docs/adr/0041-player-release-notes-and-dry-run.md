# 0041. Release notes for players and a release dry run

Status: accepted

Release notes list only Features, Fixes and Performance, skip maintenance types and dependency bumps, and drop duplicate lines, checked by `scripts/test-release-notes.sh` in CI (D114-D116). `release.yml` has a `workflow_dispatch` dry run (default on) that builds, names, validates and uploads every asset as workflow artifacts without touching a GitHub Release (D117), and the Windows job runs clippy on all targets (D118). This amends [0022](0022-releases-and-docs.md).
