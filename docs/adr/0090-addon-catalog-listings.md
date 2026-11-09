# 0090. List the addon on CurseForge and Wago

Status: accepted (2026-11-09)

## Context

Most players install addons through CurseForge, Wago or WowUp, not from GitHub. `release.yml` already builds the zip with the BigWigs packager, and the TOC has empty `X-Curse-Project-ID` and `X-Wago-ID`. Both catalogs reject executables inside addon uploads, so the Companion cannot be bundled. The addon alone already gives calendar and quest-log ideas, quick plans and item tips.

## Decision

Publish the addon (Retail flavor only) on CurseForge and Wago Addons from `release.yml` when the project ids and API tokens exist, and skip upload when they do not. The listing leads with the problem and what works in game alone, links the Companion as optional at `playunbored.com/install`, and states what data Bory reads and how to turn it off. The owner creates both projects and the API tokens; agents never create accounts. WoWInterface comes later.

## Alternatives

- GitHub only: rejected, it is where players do not look.
- Bundle the Companion in the zip: not allowed by the catalogs.
- WoWInterface first: smaller audience.

## Consequences

Release tags upload to two more places, so release notes must read well for players there. Support questions will arrive through catalog comments; someone needs to read them.
