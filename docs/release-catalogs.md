# Addon catalog releases

[ADR 0090](adr/0090-addon-catalog-listings.md) covers CurseForge and Wago Addons.
Only the Retail addon zip goes to these catalogs. The Windows Companion remains
a separate download at <https://playunbored.com/install>.

## Owner setup

1. In the [CurseForge author portal](https://authors.curseforge.com/#/projects/create/choose-game),
   create **Unbored** for **World of Warcraft**, class **Addons**, with a relevant
   quest category, MIT license and the repository as source/support link. Use
   [the CurseForge listing](listings/curseforge.md): the first plain line is the
   Summary; the description starts after the separator. Preview headings, lists
   and links in its description editor; do not paste the owner comment or separator.
2. In the [Wago developer dashboard](https://addons.wago.io/developers), create
   **Unbored**, using [the Wago listing](listings/wago.md). Its description editor
   accepts Markdown and has a preview. Use Retail compatibility only. Do not
   import the repository README as the description: it leads with the Companion.
3. Copy the numeric CurseForge project ID into `## X-Curse-Project-ID:` and the
   Wago project ID into `## X-Wago-ID:` in [`addon/Unbored.toc`](../addon/Unbored.toc).
   These fields are deliberately empty until the owner has created the projects.
   Wago shows its eight-character alphanumeric ID beneath the project name in
   the dashboard. Commit the IDs through a reviewed change to `main`. Do not
   change the Interface versions or add Classic/Forever TOCs.
4. Generate a [CurseForge API token](https://authors.curseforge.com/#/settings/api-tokens)
   and a [Wago API token](https://addons.wago.io/account/apikeys) with access to
   those projects. In **hmbanan666/wow-unbored → Settings → Secrets and variables
   → Actions → New repository secret**, add **CF_API_KEY** and **WAGO_API_TOKEN**.
   The workflow maps `CF_API_KEY` to the packager's **CF_API_TOKEN** environment
   variable. Never put either value in a TOC, file, command example or PR.
5. Add our own catalog icon and in-game screenshots, with short captions:
   Bory's ideas with a calendar event available; an unfinished quest chain and
   its plan step; a relevant item with Bory's item line; and Bory's Settings with
   **Share game data to make Bory smarter** visible. Show Bory beside the relevant
   game UI, without implying that Unbored inserts controls into the calendar or
   quest log. Exclude other players' chat and names. Screenshots are a separate
   owner task; none are supplied or created here.
6. Complete catalog moderation. CurseForge's
   [submission instructions](https://support.curseforge.com/support/solutions/articles/9000197241-creating-and-submitting-a-project)
   require an initial file for review and at least one Release file for app
   visibility. If either dashboard needs a first manual file before accepting
   automated releases, upload an **existing GitHub addon zip** for Retail,
   never an installer. Confirm each project is ready to accept API uploads.
7. Preview both descriptions, check the Summary fields accept the supplied
   89-character line, and assign someone to read comments and support issues.
   Review the privacy wording against the current release before publishing.

## What the next release does

The existing `vX.Y.Z` release process runs `scripts/stage-addon.sh`, then
`BigWigsMods/packager@v2` without `-g` (ADR 0100). Its single addon zip is used
for GitHub, CurseForge and Wago. The TOC supplies the Retail patch versions and
WoW Forever `16001`; `scripts/check-packaged-toc.sh` checks the packaged TOC
keeps all of them. There are no Classic uploads, executables or Companion
bundles in the addon zip.
`.pkgmeta` excludes the monorepo, tests, documentation and development files;
`Companion/Plan.lua` inside the addon is Lua, not the desktop Companion.
`license-output` points at the committed `LICENSE`, preventing a CurseForge ID
from triggering a WowAce license fetch or adding a second license to the zip.

Each catalog is independent:

| Project ID | Its secret | Result |
| --- | --- | --- |
| Empty | Missing or set | That catalog is skipped successfully |
| Set | Missing | That catalog is skipped successfully |
| Set | Set | Packager attempts that catalog upload |

Missing configuration is not an error. Invalid credentials, rejected uploads or
catalog outages can still fail an enabled upload; those failures are not hidden.
The existing GitHub release token, asset naming, installer jobs and updater feed
are unchanged. The packager still uses `CHANGELOG.md` for catalog release notes;
keep its entries readable for players. GitHub's separate release-note job is unchanged.

A Release workflow dry run uses `-d` and receives no catalog tokens.
It publishes nothing even when both projects are configured. Do not push a tag
just to test setup. Follow the existing release procedure only when an actual
release is authorized.

## Catalog formatting and summary evidence

Checked 2026-11-09. Both files contain the same Markdown description and the same
89-character plain-text summary. Wago's public
[create/edit form bundle](https://addons.wago.io/js/5233.7364ff74ba4c589d.js)
uses a Markdown description editor with a preview; its Summary input declares no
maximum length. This does **not** establish the server's validation limit.
[Wago's API documentation](https://docs.wago.io/) covers release uploads, not
listing field limits.

CurseForge's [project creation documentation](https://support.curseforge.com/support/solutions/articles/9000197241-creating-and-submitting-a-project)
identifies Summary and Description and shows the description editor, but gives
no Summary character limit. The author portal returned HTTP 403 during this
check. A numeric limit for either catalog could not be verified from an
accessible primary source. The short line is ready to paste, but **confirm the
limits in the owner forms before publishing** and record them here with their
source. Do not treat 89 as a catalog limit. Preview CurseForge's rendered editor
output rather than assuming its paste handling matches Wago Markdown.

## Evidence for listing claims

| Listing claim | Repository evidence |
| --- | --- |
| Calendar and quest-log ideas; quick plans without Companion | `README.md` FAQ; `addon/Core/Suggestions.lua`; `addon/Providers/Events.lua`; `addon/Providers/Quests.lua` |
| One step, full list, map pin, item drop, combat hiding and click choices | `addon/UI/Mascot.lua`; `addon/Core/Plan.lua`; `addon/Core/Waypoint.lua`; `addon/UI/Items.lua`; `addon/Core/Advice.lua` |
| Retail only; optional Windows download; approval, Refresh, Companion-only features | `apps/web/app/pages/install.vue`; `addon/Unbored.toc`; `README.md`; ADRs 0012, 0047 and 0048 |
| Exact collected categories and read timing | `addon/Core/Data/*.lua`, especially `Character.lua`, `World.lua` and `Store.lua`; Section inventory in `docs/DEVELOPMENT.md` |
| Sharing defaults on, settings label, essential data kept when off | `addon/Core/Init.lua`; `addon/Core/Locale.lua`; `addon/UI/Mascot.lua` (`SetSharing`); `addon/Core/Data/Store.lua` (`ESSENTIAL`, `ApplySharing`); ADR 0031 |
| Changed data, plan requests/context/progress and PC identity sent by Companion | `apps/companion/src-tauri/src/gui.rs`; `snapshot.rs`; `sync_state.rs`; `request.rs`; `addon/Core/Session.lua`; `addon/Companion/Plan.lua`; `PRIVACY.md` |
| Cleaned error notes, salted account hash, erasure and reconnect | `addon/Core/Util.lua`; `apps/companion/src-tauri/src/account.rs`; `PRIVACY.md`; ADRs 0043, 0044, 0045 and 0051 |
| Public privacy destination | `apps/web/app/pages/install.vue` links to the README data section and `PRIVACY.md`; there is no separate privacy page in this site |

The setting reduces collection in the currently loaded character's saved data.
The Companion upload code does not use it as a global network-off switch, and
already saved data for other characters is not erased. The listing therefore
explains the remaining transfers and quitting the Companion for addon-only use.
It does not repeat the overly broad “with sharing off nothing is sent” sentence
from the error-note paragraph of `PRIVACY.md`.

Packager references: [upload environment names](https://github.com/BigWigsMods/packager#uploading),
[TOC project IDs](https://github.com/BigWigsMods/packager#readme),
[Retail selection and command flags](https://github.com/BigWigsMods/packager#single-game-version),
and [Wago's integration instructions](https://docs.wago.io/#bigwigs-packager).
The packager's `upload_curseforge` and `upload_wago` return success before any
network request if the corresponding ID or token is empty.

## Local verification without a release

Use a disposable checkout, because `scripts/stage-addon.sh` stages root-level
copies of addon files. Download `release.sh` from the
[packager v2 source](https://github.com/BigWigsMods/packager/blob/v2/release.sh)
into a separate directory, then run from that checkout:

```sh
bash scripts/stage-addon.sh
bash /path/to/release.sh -d
bash scripts/check-packaged-toc.sh
```

Compare the archive's member paths and uncompressed bytes against the baseline
checkout's archive built with its original `.pkgmeta` and `-d`. Zip timestamps
need not match. Check the entire archive, including nested folders, for files
outside the addon and executable contents. Do not use a release tag for this.

For skip verification, run the packager **without `-d`** in the disposable
checkout with empty upload credentials and a local `curl` stub that records an
attempt and fails without networking. Repeat with fixture TOC IDs but no tokens,
then fixture tokens but empty IDs, independently for both catalogs. Each should
exit zero without calling `curl`. With both fixture IDs and tokens set, `-d`
must still make no call. Fixture values must never be committed. This exercises
the real packager's upload guards; it is not a GitHub Actions release run and
does not establish that configured catalogs will accept a live upload.
