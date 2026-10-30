# Developing Unbored

Everything a contributor needs that a player does not: how the pieces fit, how to test, how releases are cut, and how to add data. Players start at the [README](../README.md).

Read [`CONTEXT.md`](../CONTEXT.md) (the words we use) and [`docs/adr/`](adr/) (the decisions behind them) first; [`AGENTS.md`](../AGENTS.md) says how decisions are made and recorded.

## The pieces

- **The addon** (`addon/`): Wisp, the Bubble, Quick plans from the Providers, tooltip Advice, local answers. Lua for the Retail client, no required libraries. It is not a JavaScript package.
- **The Companion** (`apps/companion/`): a Windows tray app (Tauri, Rust, window in `ui/`). It installs and updates the addon, sends Requests and profiles from SavedVariables to the Server, and writes `Interface/AddOns/Unbored_Plan/Plan.lua` and `Advice.lua`. See [`apps/companion/README.md`](../apps/companion/README.md).
- **The Server** (`apps/server/`): Node, Hono and SQLite at `https://unbored.kosarev.space`. Devices, Requests, Plans, Player profiles, history, Personal advice, and the MCP tools the Planner uses. Contract: [`companion-api.md`](companion-api.md), plan format: [`plan-format.md`](plan-format.md).
- **Shared types** (`packages/contracts/`): Request, Plan, and Player profile types and JSON Schema. The Server and the Companion window import them. The Rust contract test reads the JSON Schema.
- **`apps/web/`**: a placeholder for a future player website. No app yet.

## Requirements

- Retail client **12.1.5** (Interface **120105**) or **12.1.0** (Interface **120100**). The TOC lists both. `/dump select(4, GetBuildInfo())` should print one of them.
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
Data/         contributor tables (Presets, Items, AdviceTable, ...)
Providers/    one file per mode
UI/           Wisp (Mascot.lua), the list view, item help, minimap button
Media/        portraits and Icon*.tga (built by art/*.py)
tests/        run.lua (logic), ui.lua (Wisp against a fake frame API)
```

Every UI string is in `Core/Locale.lua`, English and Russian. The name is one string, `ns.MASCOT_NAME` in `Core/Namespace.lua`. Saved variables never contain secret values or functions.

## Checks

From the repository root, with pnpm, Lua 5.1, luacheck, and Rust:

```
pnpm install
pnpm test
pnpm lint
pnpm build
```

`pnpm test` runs the addon checks (`cd addon && luacheck . && lua5.1 tests/run.lua && lua5.1 tests/ui.lua`), JavaScript tests (`vp test`: Server and `packages/contracts`), and `cargo test --lib --no-default-features` for the Companion. `pnpm lint` is `vp check` (Oxfmt and Oxlint), luacheck, `cargo fmt --check`, and clippy. `pnpm dev` starts the Server. `pnpm build` typechecks the Server and builds the Companion window. The Windows installer is built by `.github/workflows/companion.yml` on every pull request that touches `apps/companion/`.

JavaScript uses Vite+ (`vp`, the `vite-plus` package). Lua stays on luacheck. Rust stays on cargo. See [ADR 0024](adr/0024-vite-plus-toolchain.md).

On Ubuntu the luacheck package is `lua-check`.

## Commits and releases

Commits and PR titles are [Conventional Commits](https://www.conventionalcommits.org/) with a scope: `feat(addon): ...`, `fix(companion): ...`, `perf(server): ...`, `docs: ...`, `chore: ...` (also `refactor`, `test`, `ci`). The `PR title` workflow checks the title, since a squash merge uses it as the commit subject. Write the subject as a short sentence a player could read; it becomes a line in the release notes ([ADR 0022](adr/0022-releases-and-docs.md)).

Release notes say only what changed in that release. `.github/scripts/release-notes.sh` prints the body: the Install / Download section from `.github/release/*-install.md`, then [git-cliff](https://git-cliff.org) output for the range since the previous tag of the same kind, grouped as Features, Fixes, Performance and Other (`cliff.toml`). Squash merges keep each commit as a `* type(scope): ...` line in the body, and every line becomes its own entry. Addon notes leave out `companion` and `server` scopes; Companion notes keep only `companion`. `CHANGELOG.md` is history and is not pasted into releases.

One tag is one release ([ADR 0026](adr/0026-one-release-tag.md)). The addon, Companion, and Server share the version in the root `package.json`. `scripts/check-version.sh` checks `addon/Unbored.toc`, `addon/Core/Namespace.lua`, `apps/companion/package.json`, `apps/companion/src-tauri/Cargo.toml`, `tauri.conf.json`, `HELPER_TOC` in `apps/companion/src-tauri/src/plan.rs`, `apps/server/package.json`, and `packages/contracts/package.json`. Do not push `companion-v*` tags.

```
git tag v0.7.0 && git push origin v0.7.0
```

`.github/workflows/release.yml` builds `Unbored-v*.zip` with the [BigWigs packager](https://warcraft.wiki.gg/wiki/Using_the_BigWigs_Packager_with_GitHub_Actions) (it copies `addon/` to the checkout root for that job, because the packager only sees a TOC there), builds the Windows installer, attaches both to the tag, and writes `latest.json`. It then copies `latest.json` onto the existing `companion-updater` release, which is the URL already installed Companions read. The minisign public key in `tauri.conf.json` stays the same, so 0.5 and 0.6 can verify the new installer. If `TAURI_SIGNING_PRIVATE_KEY` is missing, the workflow builds the installer and leaves that feed alone. CurseForge and Wago ids are unset until those projects exist. To preview notes: `pipx install git-cliff` and `.github/scripts/release-notes.sh v0.6.0`.

Release notes are one Install / Download section (the setup.exe, then the zip for a manual install, with `latest.json`, `.sig`, and `release.json` marked as auto-update only) and then git-cliff for every scope since the previous `vX.Y.Z` tag.

## Tooltip Advice

`Core/Advice.lua` gives every item one "Wisp: <action>" line from the first rule that matches ([ADR 0019](adr/0019-tooltip-advice.md)): needed for the Plan, starts a quest, quest item, new mount / toy / pet, already known, new look, armour upgrade, Personal advice from the Companion (`UnboredAdvice` in `Unbored_Plan/Advice.lua`) or a planner answer, the bundled table, junk, gear to disenchant or sell, reagents (own profession, an Alt's profession via the account-wide Alt registry, or sell), consumables, things to open, no value. It never says delete, never says sell for epic or bind-on-equip items, and never routes a soulbound item to an Alt. An item no rule knows is logged to the profile (`unmatchedItems`) and, with the Companion, the tooltip says "Drop on Wisp to ask".

The bundled table is `Data/AdviceTable.lua`, one row per item id:

```lua
[12345] = { action = "keep", en = "Keep: crafting knowledge", ru = "Оставь: знания для ремесла" },
```

## Slash commands and keybinds

Players never need them. Keybinds (Esc → Options → Keybindings → AddOns → Unbored): pick a new plan, Done, Skip, point the arrow again, and Refresh (reloads the UI; a keypress counts as the click Blizzard requires).

`/unbored` (the presets), `/unbored show|hide`, `/unbored ask [text]|nearby|item`, `/unbored list|lock|reset`, `/unbored build`, `/unbored roam|quests|events|fun|farm`, `/unbored 30|60|120`, `/unbored import|export`, `/unbored tomtom|chat|minimap`, `/unbored companion` (apply the Companion file again), `/unbored where` (map id and 0–100 coordinates, for people adding data), and `/unbored errors` (caught Lua errors; the player only ever sees one friendly line).

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

In combat, and inside a dungeon, raid, arena, battleground, or scenario, the pin and the "you walked up to it" check are paused. Wisp's bubble hides during combat and the faded portrait ignores clicks until the fight is over; the list view (if open) stays up. Midnight secret values are not stored and are not used in arithmetic; if a coordinate comes back secret, that check is skipped.

Done, Skip, the queue, a pending request, and the last answer are saved per character (`UnboredCharDB`). Wisp's position and lock, the window and list positions, item answers, and the TomTom and chat toggles are account-wide (`UnboredDB`). Everything is built at the UI scale and uses the game's own fonts.

## Blizzard rules

The addon never touches the network; the Companion carries Requests and answers through SavedVariables and its own `Unbored_Plan` addon (`Plan.lua` and `Advice.lua`). `ReloadUI` runs only from a click on Refresh or Load, or the Refresh keybind, never per message ([ADR 0012](adr/0012-reload-free-background-refresh.md)). Bag buttons are not replaced, re-scripted or hooked: the tooltip line uses `TooltipDataProcessor.AddTooltipPostCall`, and an item reaches Wisp by being dropped on her or picked up in pick mode (`GetCursorInfo`, then `ClearCursor` puts it back). There are no `hooksecurefunc` hooks and no protected calls outside a hardware event.

## Auto-complete

The current task advances on `ACHIEVEMENT_EARNED`, `CRITERIA_UPDATE`, `CRITERIA_COMPLETE`, `NEW_MOUNT_ADDED`, `NEW_PET_ADDED`, `NEW_TOY_ADDED`, `QUEST_TURNED_IN`, `CURRENCY_DISPLAY_UPDATE`, `ZONE_CHANGED_NEW_AREA`, and when you are standing on a task whose completion type is proximity. A rare vignette counts once it is dead, its loot quest is flagged, or it despawns while you are on the pin. Walking away does not finish it.

Account-wide achievement completion counts as done. See open questions below if that should be this character only.

## Import and export

An outside planner builds a line that starts with `UNB1:`. You paste it with `/unbored import`. The list switches immediately. No reload.

`/unbored export` selects an `UNB1P:` line: done and skipped task ids, timestamps, and what is left. Send that back to the planner.

The format, the JSON schema, and a paste-ready example are in [`plan-format.md`](plan-format.md).

The Companion writes `Interface/AddOns/Unbored_Plan/Plan.lua`. A plan or answer for this character's pending Request is taken at the next login or Refresh; a Full plan over a running Quick plan is offered first. A plan the planner put directly starts once per character, when no request is waiting. `/unbored companion` applies the file again. The older `Companion/Plan.lua` and `UnboredDB.companionPlan` seam is still applied on login when its `generatedAt` is newer than the saved session. The import string remains the path that does not need the desktop app.

Build plan (without the companion) replaces an imported list with one made in game.

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

## Known limits

These are choices, not silent guesses. Push back if one of them is wrong.

- The first Skip moves the task to the end of the queue. The second Skip drops it for this session.
- Proximity auto-complete defaults to 40 yards and only applies to completion kind `proximity` (treasures and explicit go-to tasks). Reaching a raid door does not finish the raid.
- "Local events" in Quests are bonus objectives and map task pins from `C_TaskQuest.GetQuestsOnMap`, not a separate event board.
- Holiday rows match a calendar event by Holiday.db2 id, by `iconTexture`, or by the English title. Hallow's End uses textures `235460`, `235461`, and `235462` (what HandyNotes reads from `C_Calendar.GetDayEvent`). Those are not the same number as Holiday.db2 id 324, which is kept only as an extra key. Other holidays fall back to the English title until their texture ids are confirmed.
- `Data/Rares.lua` has Huolon (Timeless Isle, daily tracking quest 33311 from the wowhead quest page). No other tracking quests are shipped.
- Raid doors use the Wowhead entrance guide (guide 8974), converted from 0–100 to 0–1. Several of those figures are whole numbers.
- This tree is checked against the API wiki and the two Lua test suites; the live-client checklist is [`TESTING.md`](../TESTING.md).
