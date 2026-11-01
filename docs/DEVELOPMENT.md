# Developing Unbored

Everything a contributor needs that a player does not: how the pieces fit, how to test, how releases are cut, and how to add data. Players start at the [README](../README.md).

Read [`CONTEXT.md`](../CONTEXT.md) (the words we use) and [`docs/adr/`](adr/) (the decisions behind them) first; [`AGENTS.md`](../AGENTS.md) says how decisions are made and recorded.

## The pieces

- **The addon** (`addon/`): Bory, the Bubble, Quick plans from the Providers, tooltip Advice, local answers. Lua for the Retail client, no required libraries. It is not a JavaScript package.
- **The Companion** (`apps/companion/`): a Windows tray app (Tauri, Rust, window in `ui/`). It installs and updates the addon, sends Requests and profiles from SavedVariables to the Server, and writes `Interface/AddOns/Unbored_Plan/Plan.lua`, `Advice.lua` and `Suggestions.lua`. See [`apps/companion/README.md`](../apps/companion/README.md).
- **The Server** (`apps/server/`): Node, Hono and SQLite at `https://unbored.kosarev.space`. Devices, Requests, Plans, Player profiles, history, Personal advice, and the MCP tools the Planner uses. Contract: [`companion-api.md`](companion-api.md), plan format: [`plan-format.md`](plan-format.md).
- **Shared types** (`packages/contracts/`): Request, Plan, and Player profile types and JSON Schema. The Server and the Companion window import them. The Rust contract test reads the JSON Schema.
- **`apps/web/`**: a placeholder for a future player website. No app yet.

## Requirements

- Retail client **12.1.5** (Interface **120105**) or **12.1.0** (Interface **120100**). The TOC also lists PTR interface **120107**. `/dump select(4, GetBuildInfo())` should print one of them.
- No Classic, Mists, or Forever build.

## Layout

```
addon/            Lua addon (Unbored.toc, Core, Data, Providers, UI, Media, tests)
apps/companion/   Windows tray app (ui/ is the window, src-tauri/ is Rust)
apps/server/      planner backend
apps/web/         placeholder README for a future player website
packages/contracts/  shared Request, Plan, and Player profile types
docs/             ADRs, API contract, plan format
art/              builds Media portraits and Companion icons
```

Inside `addon/`:

```
Unbored.toc
Bindings.xml
Core/         session, Requests, Advice, Intents, profile, codec, locale
Data/         contributor tables (Presets, Items, Rares, ...)
Providers/    one file per mode
UI/           Bory (Mascot.lua), the list view, item help, minimap button
Media/        portraits and Icon*.tga (built by art/*.py)
tests/        run.lua (logic), ui.lua (Bory against a fake frame API)
```

Every UI string is in `Core/Locale.lua`, English and Russian. The name is one string, `ns.MASCOT_NAME` in `Core/Namespace.lua`. Saved variables never contain secret values or functions.

## Checks

Request submission lives in `apps/companion/src-tauri/src/request.rs`. The GUI
reads SavedVariables and supplies the HTTP adapter; the library selects the
newest saved Request (D82) and acknowledges Account migration only after a
successful response. Only that Request's permanent rejection can supply the
game's failure status. HTTP 408/429 use the existing sync retry path; neither
acknowledges migration nor writes a terminal Request failure. Rejections and
Server statuses use the same `pick_plan_file` path.

With nvm installed, select the project's Node 26 before running commands:

```sh
nvm install
nvm use
npm install --global pnpm@12.16.1
pnpm install --frozen-lockfile
```

`.nvmrc` selects Node 26 without changing nvm's default for other projects. pnpm is installed for that Node version. In a new terminal, run `nvm use` from the repository root again.

Non-interactive agent shells may not load nvm from `.zshrc`. With nvm installed through Homebrew, run `source "$(brew --prefix nvm)/nvm.sh"` before `nvm use` in that shell.

On macOS, install `luacheck`, `minisign`, and `git-cliff` with Homebrew. The release-note checks use git-cliff 2.14.2. Lua must be **5.1**, available on `PATH` as **`lua5.1`**; Homebrew's current `lua` is a different version. If Lua 5.1 is unavailable from the package manager, build [Lua 5.1.5](https://www.lua.org/ftp/) with `make macosx`, verify the archive's SHA-256 against the download page, and install it under a separate user prefix. Keep the existing `lua` executable for other projects. Rust needs the `rustfmt` and `clippy` components, and macOS needs Xcode Command Line Tools.

From the repository root, with pnpm, Lua 5.1, luacheck, and Rust:

```
pnpm install
pnpm test
pnpm lint
pnpm build
```

`pnpm test` runs the addon checks (`cd addon && luacheck . && lua5.1 tests/run.lua && lua5.1 tests/ui.lua`), JavaScript tests (`vp test`: Server and `packages/contracts`), and `cargo test --lib --no-default-features` for the Companion. `pnpm lint` is `pnpm typecheck`, `vp check` (Oxfmt and Oxlint), luacheck, `cargo fmt --check`, and clippy. `pnpm typecheck` covers the Server, its tests, `packages/contracts`, and the Companion window. `pnpm dev` starts the Server. `pnpm build` typechecks the Server and builds the Companion window. The Windows installer is built by `.github/workflows/companion.yml` on pull requests that touch the Companion and on every push to `main`. Node is 26.

JavaScript uses Vite+ (`vp`, the `vite-plus` package). Lua stays on luacheck. Rust stays on cargo. See [ADR 0024](adr/0024-vite-plus-toolchain.md).

On Ubuntu the luacheck package is `lua-check`.

## Commits and releases

Commits and PR titles are [Conventional Commits](https://www.conventionalcommits.org/) with a scope: `feat(addon): ...`, `fix(companion): ...`, `perf(server): ...`, `docs: ...`, `chore: ...` (also `refactor`, `test`, `ci`). The `PR title` workflow checks the title, since a squash merge uses it as the commit subject. Write the subject as a short sentence a player could read; it becomes a line in the release notes ([ADR 0022](adr/0022-releases-and-docs.md)).

Release notes say only what changed in that release. `.github/scripts/release-notes.sh` prints the body: the Install / Download section from `.github/release/install.md`, then [git-cliff](https://git-cliff.org) output for the range since the previous `vX.Y.Z` tag, grouped as Features, Fixes and Performance (`cliff.toml`). Squash merges keep each commit as a `* type(scope): ...` line in the body, and every line becomes its own entry; the squash title is left out when the body already has player lines, so any title type is safe. `refactor`, `docs`, `chore`, `test`, `ci`, `build`, `style` and `revert` never show. `CHANGELOG.md` is history and is not pasted into releases.

Every PR gets a **Release notes preview** in the summary of its `PR title / notes-preview` job: the notes as if the PR were squash-merged now with its title. It fails on a version-titled line, the old mascot name, or a maintenance change (clippy, lint, CI, tests, bumps and so on) in Features, Fixes or Performance; give such a change a maintenance type instead. Locally: `scripts/preview-release-notes.sh origin/main HEAD "feat: your PR title"`. `scripts/test-release-notes.sh v0.8.0` checks past releases and the squash cases.

One tag is one release ([ADR 0026](adr/0026-one-release-tag.md)). The addon, Companion, and Server share the version in the root `package.json`. `scripts/check-version.sh` checks `addon/Unbored.toc`, `addon/Core/Namespace.lua`, `apps/companion/package.json`, `apps/companion/src-tauri/Cargo.toml`, `tauri.conf.json`, `HELPER_TOC` in `apps/companion/src-tauri/src/plan.rs`, `apps/server/package.json`, and `packages/contracts/package.json`. Do not push `companion-v*` tags.

```
git tag v0.7.0 && git push origin v0.7.0
```

`.github/workflows/release.yml` builds `Unbored-v*.zip` with the [BigWigs packager](https://warcraft.wiki.gg/wiki/Using_the_BigWigs_Packager_with_GitHub_Actions) (it copies `addon/` to the checkout root for that job, because the packager only sees a TOC there), builds the Windows installer, attaches both to the tag, and writes `latest.json`. It then copies `latest.json` onto the existing `companion-updater` release, which is the URL already installed Companions read. If `TAURI_SIGNING_PRIVATE_KEY` is missing, the workflow builds the installer and leaves that feed alone. CurseForge and Wago ids are unset until those projects exist. To preview notes: `pipx install git-cliff==2.14.2` and `.github/scripts/release-notes.sh v0.8.0`.

**Updater key cutover.** Tauri v2 `plugins.updater.pubkey` is one minisign public key, not a list ([tauri#7585](https://github.com/tauri-apps/tauri/issues/7585) is still open). The key embedded now is the new one:

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEJDNUVCNDQxN0E2NDlCMjMKUldRam0yUjZRYlJldkRLdHBIT09ycVJNdkxRZEF2MEt5MDNMQ25CZjNPa1pYNXRBZ09SOEozb2QK
```

Installed 0.8 Companions still verify with the previous public key:

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEY3NjIzREE2MkJDODNGNEQKUldSTlA4Z3JwajFpOTNsTGZZaVZGSmt5Mzd1MjRSNzN3SDBxbWpMWUtqaVhFNnJYK0JFUWxLUkwK
```

1. Do not change the GitHub secret `TAURI_SIGNING_PRIVATE_KEY` before 0.9 is published.
2. Tag **0.9** signed with that current secret (the old private key). The 0.9 binary contains the new public key, so Companions on 0.8 accept 0.9 and then trust the new key.
3. After those installs have moved to 0.9, replace `TAURI_SIGNING_PRIVATE_KEY` with the new private key. It has no password, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is gone from the secrets and the workflows. Do not commit the private key. (Done 2026-10-31.)
4. Tag **0.10.0** and later with the new secret. The pubkey in `tauri.conf.json` stays the new one. The release `publish` job verifies each installer `.sig` against `updater-pubkey-v2.pub` with `minisign` (`.github/scripts/verify-updater-sigs.sh`, D218), so the dry run fails if the secret is not the new key.

A release dry run prints the embedded pubkey in the job summary (`scripts/print-updater-pubkey.sh`) and fails when it is not the committed public half, `apps/companion/src-tauri/updater-pubkey-v2.pub` (`scripts/check-updater-pubkey.sh`, D151); `cargo test` checks the same. Swapping the secret before 0.9 ships would make every installed Companion reject the update.

**Dry run before every tag** (D117): Actions → Release → Run workflow, branch `main`, `dry_run` ticked (`gh workflow run release.yml --ref main -f dry_run=true`). It builds the zip and both installers, checks their names, the zip contents and `latest.json`, renders the notes since the last tag into the run summary and fails on lines that are not for players, and uploads `dry-run-addon`, `dry-run-companion` and `dry-run-notes` as artifacts. It publishes nothing and touches no release or the updater feed. It warns when the version in `tauri.conf.json` already has a tag: bump it before you tag.

Release notes are one Install / Download section (the setup.exe, then the zip for a manual install, with `latest.json`, `.sig`, and `release.json` marked as auto-update only) and then git-cliff for every scope since the previous `vX.Y.Z` tag.

## Game data

`Core/Data/` collects every own-player source the addon can read ([ADRs 0027 to 0031](adr/README.md), D47-D63 in [decisions-v0.7.md](decisions-v0.7.md)). Each Section lives in `UnboredCharDB.data.sections` (scope `char`) or `UnboredDB.data.sections` (scope `account`) as `{ v, at, src, body }`, under `schema = 2`. Logout only stamps `savedAt`; the Companion hashes each Section and uploads the changed ones to `POST /v1/snapshot`. Big id sets are packed ([packed ids](contract/README.md#packed-id-sets)).

The Account key on the wire is not the WTF folder name ([ADR 0044](adr/0044-hashed-account-key.md)). The Companion stores a 32-byte salt, hex-encoded, next to the device secret (`accountSalt` in `device.json`). It never sends the salt. The key is the folder name with the license suffix removed (`12345678#1` and `12345678#2` are both `12345678`). The hash is lowercase hex SHA-256 of `salt_bytes || 0x00 || utf8(account_key)`. Until this PC has seen a successful upload for that key, the body also includes `accountLegacy` with the old key so the Server can rename rows. After that, only the hash is sent. An older Companion that still sends the folder name keeps working; a 64-character hex string is stored as-is and is not split on `#`.

Reads happen at three moments, never in combat, and every value where `issecretvalue(v)` is true is dropped: the **login pass** (10 s after entering the world, staged over frames), **event deltas** (settled for 2 s), and **window reads** (only while the bank or profession window is open). Nothing about other players is read: no chat, mail senders, subjects or bodies, rosters or names.

Sizes are from the worst-case test (`UNBORED_SIZES=1 lua5.1 addon/tests/data.lua`): the Character file is 306 KB with 3.2k literals, the Account file 50 KB with 0.5k literals. Targets are 400 KB and 300 KB, the hard cap 1 MB and fewer than 30k literals per file. Over the cap, the lowest-priority Sections are dropped first and listed in `data.dropped`. Sections with no size were not in the worst-case fixture and are well under 2 KB.

Snapshot deduplication compares both the Section version and its body hash. The wire hash still covers only the canonical body; a version change is uploaded and stored as a full history entry, never a collection diff. Re-posting an identical version/body advances the Server's save watermark without adding history, so an older changed upload cannot replace it. A staged bank or profession read is discarded when its window closes, even if it reopens before the next frame. Achievement event payloads update ids immediately; their points API read waits for the settled worker outside combat.

| Section | Scope | API | When | Worst case |
| --- | --- | --- | --- | --- |
| `char` | char | UnitClass, UnitRace, UnitLevel, UnitXP, GetSpecializationInfo, GetAverageItemLevel, GetMoney, GetBindLocation, and `lang` (the addon's language, for the Server's ideas) | login, events | 0.5 KB |
| `gear` | char | GetInventoryItemLink 1-19, C_Item.GetDetailedItemLevelInfo | login, PLAYER_EQUIPMENT_CHANGED | 0.3 KB |
| `talents` | char | C_ClassTalents, C_Traits.GenerateImportString | TRAIT_CONFIG_* events | |
| `played` | char | RequestTimePlayed, TIME_PLAYED_MSG (our chat line is hidden) | once per login | |
| `bags` | char | C_Container | login, BAG_UPDATE_DELAYED | 8.6 KB |
| `bank`, `reagentBank` | char | C_Container on the bank bags | while the bank is open | 20 KB |
| `warband` | account | C_Container on the warband bank tabs | while the bank is open | 17 KB |
| `currencies` | char | C_CurrencyInfo list (headers expanded, then restored) | login, CURRENCY_DISPLAY_UPDATE | 37 KB |
| `professions` | char | GetProfessions, GetProfessionInfo | login, SKILL_LINES_CHANGED | |
| `recipes` | char | C_TradeSkillUI.GetAllRecipeIDs, GetRecipeInfo (packed) | while a profession window is open | 5 KB |
| `questsDone` | char | C_QuestLog.GetAllCompletedQuestIDs (packed) | login, QUEST_TURNED_IN | 52 KB |
| `questLog` | char | C_QuestLog, GetQuestObjectives | QUEST_LOG_UPDATE and quest events | 16 KB |
| `questLines` (v1) | char | C_CampaignInfo (InProgress or Stalled campaigns), C_QuestLine.GetQuestLineInfo for each log quest, GetAvailableQuestLines for the current map and the 3 most played maps; GetQuestLineQuests against IsQuestFlaggedCompleted gives `done`/`total`/`nextQuestID`. Up to 40 rows `{ questLineID, name, campaignID?, chapter?, mapID, x?, y?, done, total, nextQuestID?, flags }`, names in the client language | 20 s after the login pass (map requests 10 s before it), QUEST_TURNED_IN | ~4 KB |
| `reputation` (v2) | char | C_Reputation, C_MajorFactions, C_GossipInfo.GetFriendshipReputation; v2 adds per renown row `next` (up to 4 rewards of the next level from `C_MajorFactions.GetRenownRewardsForLevel`) and `max`, and per paragon faction `paragon = { value, threshold, questID, pending }` (D181) | login, UPDATE_FACTION | 52 KB |
| `achievements` | account | GetCategoryList, GetAchievementInfo (packed) | staged scan once a day, ACHIEVEMENT_EARNED | 12 KB |
| `achievementsMine` | char | ACHIEVEMENT_EARNED | events | 6 KB |
| `achProgress` | char | GetAchievementNumCriteria, GetAchievementCriteriaInfo on incomplete non-guild achievements (a single progress-bar criterion uses its quantity); rows `{ id, d, t, open }` with ratio >= 0.5, at most 200, best first; skips achievements with more than 60 criteria and stops at 60,000 calls (D182). Priority 20, dropped first | staged, once a day per Character, 60 s after login | |
| `mounts` | account | C_MountJournal (packed) | login, NEW_MOUNT_ADDED | 3 KB |
| `pets` | account | C_PetJournal | login (staged), NEW_PET_ADDED | 12 KB |
| `toys` | account | C_ToyBox, PlayerHasToy (packed) | login (staged), NEW_TOY_ADDED | 3.7 KB |
| `transmog` | account | C_TransmogCollection category counts | login | |
| `lockouts` | char | GetSavedInstanceInfo, GetSavedWorldBossInfo | UPDATE_INSTANCE_INFO, BOSS_KILL | |
| `mplus` | char | C_PlayerInfo.GetPlayerMythicPlusRatingSummary, C_MythicPlus keystone | login, CHALLENGE_MODE_COMPLETED | |
| `vault` | char | C_WeeklyRewards.GetActivities | login, WEEKLY_REWARDS_UPDATE | |
| `calendar` (v2) | account | C_Calendar, today to +14 days; per event `texture` (iconTexture), `sequenceType`, `numSequenceDays`, and for today's and tomorrow's holidays `description` from GetHolidayInfo (300 bytes) | OpenCalendar again 5 s after entering the world, then the settled CALENDAR_UPDATE_EVENT_LIST, once per login | |
| `sessions` | char | zones with mapID and minutes, deaths, level ups (last 20) | events | 24 KB |
| `addons` | account | C_AddOns.IsAddOnLoaded for TomTom, Auctionator, TSM, Bagnon | login | |
| `unresolvedIds` | char | Plan ids the game could not resolve, and items Bory had no tooltip advice for (`kind = "advice"`, was the 0.6 profile's `unmatchedItems`) | when a link fails, when an item has no line | |
| `errors` | account | `ns.ReportError`: rows `{ at, lastAt, count, version, where, text, stack }`, same `where`+`text`+`version` counts up, 10 rows; paths cut to `Interface/AddOns/`, quoted text replaced by `"…"`, stack lines only from `AddOns/Unbored/` or `[C]` (D173-D176). Not essential: with sharing off it stays on this PC | when a protected call fails | 4 KB |

"Share game data to make Bory smarter" (`UnboredDB.shareData`, on by default) off keeps only `char`, `gear`, `questLog` and `sessions`, the Sections a Plan Request needs. The owner sees what arrived with the MCP tools `data_catalog` and `get_game_data`.

## Tooltip Advice

`Core/Advice.lua` adds at most two Bory lines to an item tooltip, and only when they are about this player ([ADR 0035](adr/0035-personal-only-advice.md), [ADR 0048](adr/0048-account-holdings-in-tooltips.md)): one action line, then a muted Holdings line ("Also: Grubbyman 40, Warband bank 200") from `UnboredAdvice.holdings`, the Account holdings index the Server builds from every Character's `bags`, `bank`, `reagentBank` and the `warband` Section. Holdings never count this character's own place, leave out places not seen for 60 days, and stop at 3,000 items / 60 KB; with them `Advice.lua` stays under 260 KB and 20k literals (the Companion cuts holdings first, then advice). The rules, first match wins: needed for the active Plan (names the Step), starts a quest this character has not completed, new for the Account's collection (a mount, toy, pet or look no character has), Personal advice from the Server (`UnboredAdvice` in `Unbored_Plan/Advice.lua`) or a planner answer about the item, and a reagent for a profession an Alt has and this character lacks, with the route (mail or warband bank, [ADR 0021](adr/0021-account-and-alt-routing.md)). No line is the default. It never says delete, never says sell for epic or bind-on-equip items, and never routes a soulbound item to an Alt. The menu toggle "Bory lines in tooltips" (on by default, `UnboredDB.tooltipLines`) turns them all off.

## Slash commands and keybinds

Players never need them. Keybinds (Esc → Options → Keybindings → AddOns → Unbored): pick a new plan, Done, Skip, point the arrow again, and Refresh (reloads the UI; a keypress counts as the click Blizzard requires).

`/unbored` (the presets), `/unbored show|hide`, `/unbored item`, `/unbored lock|reset`, `/unbored build`, `/unbored roam|quests|events|fun|farm`, `/unbored tomtom|chat|minimap`, `/unbored companion` (apply the Companion file again), `/unbored where` (map id and 0–100 coordinates, for people adding data), and `/unbored errors` (caught Lua errors; the player only ever sees one friendly line).

## What the modes suggest

- **Roam.** Unearned exploration criteria (Eastern Kingdoms through Pandaria are in the table; add more continents in `Data/Exploration.lua`), rares and treasures the client is currently showing (`C_VignetteInfo`), and any curated rare in `Data/Rares.lua` that has a tracking quest id.
- **Quests.** Your log, plus world quests, bonus objectives, and other task pins from `C_TaskQuest.GetQuestsOnMap` on this zone and its neighbors, closest first.
- **Events.** Today's holiday rows from `C_Calendar`. Known holidays add unearned achievements and mounts. Anything else still becomes a task titled with the calendar's own name.
- **Fun.** A short curated list: Going Down?, Higher Learning, the squirrel `/love` sets, Well Read.
- **Farm.** Old raids (and Return to Karazhan) that still have a mount you do not own. A lockout from `GetSavedInstanceInfo` hides that instance for the week.

Tasks carry a rough minute estimate. A local Quick plan is sized internally (about an hour of estimates, at most `ns.MAX_STEPS` Steps) so it stays a short start; the player never picks a time. Full plans from the Planner have no time budget and cover the whole goal ([ADR 0037](adr/0037-no-time-budget.md)).

## Pins and combat

When a step becomes current, Unbored sets the user waypoint (`C_Map.SetUserWaypoint`) and super-tracks it (`C_SuperTrack.SetSuperTrackedUserWaypoint`), so Blizzard's on-screen arrow and distance appear at once. If TomTom is loaded it also adds a TomTom crazy arrow; turn that off in the gear menu or with `/unbored tomtom`. A step with a `waypoints` route moves the arrow to the next point when you come within 30 yards, and the bubble shows "Point 2/4: label" with the distance. Nothing is printed to chat unless you turn chat lines on.

When a step finishes, the pin Unbored set is cleared. A pin you placed yourself is left alone.

In combat, and inside a dungeon, raid, arena, battleground, or scenario, the pin and the "you walked up to it" check are paused. Bory's bubble hides during combat and the faded portrait ignores clicks until the fight is over; the list view (if open) stays up. Midnight secret values are not stored and are not used in arithmetic; if a coordinate comes back secret, that check is skipped.

Done, Skip, the queue, a pending request, and the last answer are saved per character (`UnboredCharDB`). Bory's position and lock, the window and list positions, item answers, and the TomTom and chat toggles are account-wide (`UnboredDB`). Everything is built at the UI scale and uses the game's own fonts.

## Blizzard rules

The addon never touches the network; the Companion carries Requests and answers through SavedVariables and its own `Unbored_Plan` addon (`Plan.lua`, `Advice.lua` and `Suggestions.lua`). `ReloadUI` runs only from a click on Refresh or Load, or the Refresh keybind, never per message ([ADR 0012](adr/0012-reload-free-background-refresh.md)). Bag buttons are not replaced, re-scripted or hooked: the tooltip line uses `TooltipDataProcessor.AddTooltipPostCall`, and an item reaches Bory by being dropped on him or picked up in pick mode (`GetCursorInfo`, then `ClearCursor` puts it back). There are no `hooksecurefunc` hooks and no protected calls outside a hardware event.

## Auto-complete

The current task advances on `ACHIEVEMENT_EARNED`, `CRITERIA_UPDATE`, `CRITERIA_COMPLETE`, `NEW_MOUNT_ADDED`, `NEW_PET_ADDED`, `NEW_TOY_ADDED`, `QUEST_TURNED_IN`, `CURRENCY_DISPLAY_UPDATE`, `ZONE_CHANGED_NEW_AREA`, and when you are standing on a task whose completion type is proximity. A rare vignette counts once it is dead, its loot quest is flagged, or it despawns while you are on the pin. Walking away does not finish it.

Account-wide achievement completion counts as done. See open questions below if that should be this character only.

## Plans from the Companion

There is no paste window: `/unbored import` and `/unbored export` were removed in 0.10 ([ADR 0046](adr/0046-choices-only.md), D214). `Core/Import.lua` still decodes the `UNB1:` string the Companion writes; the format and the JSON schema are in [`plan-format.md`](plan-format.md).

The Companion writes `Interface/AddOns/Unbored_Plan/Plan.lua`. A plan or answer for this character's pending Request is taken at the next login or Refresh; a Full plan over a running Quick plan is offered first. A plan the planner put directly starts once per character, when no request is waiting. `/unbored companion` applies the file again. The older `Companion/Plan.lua` and `UnboredDB.companionPlan` seam is still applied on login when its `generatedAt` is newer than the saved session. Progress carries the plan's `generatedAt`, so the Server can tell which plan it belongs to (taste, D191).

Build plan (without the companion) replaces a Companion plan with one made in game.

On the Server, `plans.request_id` preserves a Plan's Request even after the Planner replaces it. The Companion's latest-Plan endpoint returns only its Device's Request Plans and explicit direct Plans (which have no Request); owner MCP reads can still see all Plans. The one-time transactional migration restores links from Requests and Player history. Forget my data erases replacement Plans too, and a Plan whose Request was erased during asynchronous validation is rejected at the write boundary.

## Error reports

`ns.ReportError(where, err, stack)` keeps one row per problem in the account Section `errors` (above); the protected call sites (`Init.lua` event dispatch and setup, `Events.lua`, `Store.lua` `S.Read`, the staged worker) use `xpcall` with `ns.ErrorHandler(where)`, which adds `debugstack`. The player sees one friendly line per session (`OOPS`); `/unbored errors` lists them in chat. The Server upserts each row into `addon_errors` keyed by `sha256(version|where|text)`, count = the most seen; the MCP tool `list_errors` reads them newest first with the device name, and `delete_account_data` and Forget my data erase them ([ADR 0051](adr/0051-addon-error-reports.md)).

## Ready now, taste and wins

`apps/server/src/ready.ts` computes **Ready now** per Character on demand from the latest Sections (MCP `get_ready_now`, [ADR 0052](adr/0052-ready-now.md)); at most 25 items, sorted by score:

| Rule | Source | Score |
| --- | --- | --- |
| Great Vault reward waiting, paragon reward waiting | `vault`, `reputation` v2 | 100 |
| Event on now with open catalog tasks | `calendar` + catalog | 90 |
| Lockout with bosses left this week | `lockouts` | 80, +10 when it resets within 2 days |
| Renown within 25% of the next level | `reputation` | 75 with a mount or item reward, 60 without |
| Achievement at least 70% done | `achProgress` | 70 + 30 × (ratio - 0.7) / 0.3 |
| Vault activity 1-2 short of the next slot | `vault` | 70 (TODO: not in the D186 table) |
| Currency at 90% of its cap | `currencies` | 65 |
| Open quest chain (top 5) | `questLines` | 60 |
| Your keystone | `mplus` | 55 (TODO: not in the D186 table) |
| Classic or friendship standing within 15% of the next step | `reputation` | 50 |
| Weekly currency room left | `currencies` | 40 |

Vault activity types are named from `Enum.WeeklyRewardChestThresholdType` (comment in `ready.ts`), else "type N". `alts` lists up to 5 achievements another Character of the Account is at least 0.2 further along on (and at least half done), `{ achievementID, character, d, t }` (D210). `missing` names Sections the rules needed and did not have.

**Taste** (`taste.ts`, [ADR 0053](adr/0053-player-taste.md)) is computed per Account over 60 days and per category (the Request's idea kind or `preset:<topic>`, `surprise`, or a local plan's progress `source`): `rate = (finished + wins + 1) / (picked + 2)`, bonus `round((rate - 0.5) × 30)` clamped to ±15, nothing under 3 picks, at most -5 when skipped steps are more than twice the done ones. It reorders ideas and Ready now items before the cut and never hides one. Progress joins its plan by `generatedAt` (`plans.generated_at`, backfilled from the body).

**Wins** (`wins.ts`, [ADR 0054](adr/0054-wins-from-game-data.md)): a plan's targets are its reward tokens, its steps' rewards, the contents of a container (`contains`; the container itself is not a target) and the last step's `complete` (quest, mount, toy, pet, achievement). When a snapshot diff adds one of those ids to `mounts`, `toys`, `pets`, `achievements`, `achievementsMine`, `questsDone` or a bag/bank Section, after a plan of the same Account made in the last 30 days, the Server writes one history row of kind `win` per Account and id. A first upload (`initial`), a whole-body Section, a version change, an item that only moved between bags and banks, or one another character already holds never count. MCP `list_wins` gives totals per kind and UTC days; `get_player_history` shows them. Players do not see wins in 0.10.

## Character catalog freshness

The Server's Character catalog derives class and level from the accepted `char` Section, or from the legacy `profile` Section only when `char` is absent. Snapshot freshness is checked per Section: a newer bags upload does not block a valid char update. A stale upload can advance last contact time, but cannot roll back the Character's Account, Device, save time or dropped-Section metadata. Re-posting an unchanged char Section repairs previously inconsistent catalog facts without adding history; missing facts do not erase good ones.

## Add a data row

Tables live in `Data/`. Keep them plain Lua. An English `fallbackTitle` is only used when the game API does not know the id; the live name is localized.

Exploration, a continent achievement:

```lua
{ achievementID = 42, fallbackTitle = "Explore Eastern Kingdoms", estMinutes = 12 },
```

A rare, only if you know the "already looted" quest. Check with `/dump C_QuestLog.IsQuestFlaggedCompleted(questID)`. Entries without `questID` are ignored on purpose.

```lua
{
  id = "rare-example",
  fallbackTitle = "Example",
  mapID = 554,
  x = 0.66,
  y = 0.50,
  estMinutes = 10,
  questID = 12345,
  note = "Where it stands.",
},
```

`x` and `y` are 0–1, not 0–100. `/unbored where` prints both the map id and 0–100 coordinates.

A fun achievement:

```lua
{
  id = "fun-example",
  achievementID = 964,
  fallbackTitle = "Going Down?",
  estMinutes = 5,
  note = "Why it is a good half hour.",
  minLevel = 1,
},
```

A holiday, keyed by the calendar event id:

```lua
{
  holidayID = 324,
  fallbackTitle = "Hallow's End",
  tasks = {
    { id = "hallows-head", achievementIDs = { 291 }, estMinutes = 20, fallbackTitle = "Check Your Head" },
  },
},
```

A farm run. `instanceID` is the 14th return of `GetSavedInstanceInfo`. `mounts` are mount journal ids. Optional `appearances = { itemID, ... }` uses `C_TransmogCollection.PlayerHasTransmog` when that API exists. `pins.Alliance` / `pins.Horde` override the door.

```lua
{
  id = "farm-eye",
  instanceID = 550,
  fallbackTitle = "Tempest Keep",
  mapID = 109,
  x = 0.739,
  y = 0.637,
  estMinutes = 20,
  mounts = { 183 },
  note = "Ashes of Al'ar.",
},
```

Each mode is a provider in `Providers/` with `Build(ctx)` returning tasks `{ id, title, mapID, x, y, estMinutes, note, complete }`. `complete.kind` is documented in the plan format.

## Roadmap

- More exploration continents once their achievement ids are confirmed on 12.1.5.
- A starter set of rare tracking quests, after someone dumps a few with `/dump C_QuestLog.IsQuestFlaggedCompleted`.
- Midnight zone rows, once ui map ids are confirmed in `/unbored where`.
- Transmog-only dungeon trips, using the `appearances` field that Farm already understands.
- A real options panel. The slash commands cover the MVP.
- Collections with missing parts (pets, transmog sets, recipes) are deferred to 0.11 (D212). The cheapest first step is a transmog set Section from `C_TransmogSets` (client data, no invented ids).
- Open catalog ids (Timewalking quests, prices, weeks, faction mounts) and how to get them: [data-sources.md](data-sources.md).

## Known limits

These are choices, not silent guesses. Push back if one of them is wrong.

- The first Skip moves the task to the end of the queue. The second Skip drops it for this session.
- Proximity auto-complete defaults to 40 yards and only applies to completion kind `proximity` (treasures and explicit go-to tasks). Reaching a raid door does not finish the raid.
- "Local events" in Quests are bonus objectives and map task pins from `C_TaskQuest.GetQuestsOnMap`, not a separate event board.
- Holiday rows match a calendar event by Holiday.db2 id, by `iconTexture`, or by the English title. Hallow's End uses textures `235460`, `235461`, and `235462` (what HandyNotes reads from `C_Calendar.GetDayEvent`). Those are not the same number as Holiday.db2 id 324, which is kept only as an extra key. Other holidays fall back to the English title until their texture ids are confirmed.
- `Data/Rares.lua` has Huolon (Timeless Isle, daily tracking quest 33311 from the wowhead quest page). No other tracking quests are shipped.
- Raid doors use the Wowhead entrance guide (guide 8974), converted from 0–100 to 0–1. Several of those figures are whole numbers.
- This tree is checked against the API wiki and the two Lua test suites; the live-client checklist is [`TESTING.md`](../TESTING.md).
