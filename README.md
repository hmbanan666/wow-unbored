# Unbored

A calm, open-source session planner for World of Warcraft **Retail** (Midnight 12.x). You pick a mood and a time budget. It answers "what do I do now?" with one current task, the next task under it, and the rest collapsed. One map pin, for the current task only.

It is not a gold-per-hour optimizer. [WhatNow](https://www.curseforge.com/wow/addons/whatnow) is a closed beta aimed at gold per minute and it wants TomTom. Unbored is MIT, has no required libraries, and would rather you fall off a cliff for an achievement than squeeze a route.

## Screenshots

None yet. After the first in-game pass, put shots in [`Screenshots/`](Screenshots/README.md).

## Requirements

- Retail client **12.1.5** (Interface **120105**) or **12.1.0** (Interface **120100**). The TOC lists both.
- Checked against [Getting the current interface number](https://warcraft.wiki.gg/wiki/Getting_the_current_interface_number) and [Patch 12.1.5](https://warcraft.wiki.gg/wiki/Patch_12.1.5) (live 13 October 2026, TOC `120105`). `120100` is the previous 12.1.0 interface, listed so that client still loads.
- No Classic, Mists, or Forever build. `/dump select(4, GetBuildInfo())` should print `120105` or `120100`.

## Install

1. Copy this folder to `_retail_/Interface/AddOns/Unbored`. The folder name and `Unbored.toc` must match.
2. Restart the game, or `/reload` if you added it while the client was open (a brand-new folder is picked up on `/reload`).
3. Enable Unbored in the addons list.

CurseForge, Wago, and WowUp are not wired up yet. A git tag builds a zip through the BigWigs packager (see below).

## Use

There are two windows.

**The main window** (`/unbored`, the minimap button, or the addon compartment) only asks what you want:

1. What: Roam, Quests, Events, Fun achievements, or Farm. Each card says what it means.
2. How long: 30m, 1h, or 2h.
3. Anything else (optional): free text such as "mount, no raids, stay in this zone".

Then one button. With the companion installed it is **Get plan**: the request is saved and the UI reloads in the same click, so the companion can read it. The window then shows "Preparing your plan" and a single **Load plan** button. The companion pops a Windows toast, "Unbored: plan ready, press Load plan", when the plan arrives. Load plan reloads, and the plan starts by itself. Any other reload or login picks it up too. Without the companion the button is **Build plan** and the list is made in game from the same mode and time.

**The tracker** shows the active plan in the style of the quest tracker: the title, "Step 2 of 5 · ~35 min left", the current step in gold with its full note, and the next steps dimmed (click one to read its note). The ✓ and ⏭ icons are Done and Skip. Drag the header to move it, right-click it to lock, hide, or toggle the TomTom arrow, and use − to collapse it to titles. Text wraps and the height follows. The tracker stays when the main window is closed; `/unbored tracker` shows it again.

The gear in the main window holds the rarely used things: import a plan string, export progress, lock or hide the tracker, the TomTom arrow, and chat lines (off by default).

Keybinds (Esc → Options → Keybindings → AddOns → Unbored), so a gamepad / ConsolePort can reach them:

- Toggle window
- Done
- Skip
- Waypoint (point the arrow again)
- Load plan (reloads the UI; a keypress counts as the click Blizzard requires)

Nothing in the normal flow needs a slash command. They exist anyway: `/unbored tracker|lock|reset`, `/unbored build`, `/unbored roam|quests|events|fun|farm`, `/unbored 30|60|120`, `/unbored import|export`, `/unbored tomtom|chat|minimap`, `/unbored companion` (apply the companion file again), and `/unbored where` (map id and 0–100 coordinates, for people adding data).

### What the modes suggest

- **Roam.** Unearned exploration criteria (Eastern Kingdoms through Pandaria are in the table; add more continents in `Data/Exploration.lua`), rares and treasures the client is currently showing (`C_VignetteInfo`), and any curated rare in `Data/Rares.lua` that has a tracking quest id.
- **Quests.** Your log, plus world quests, bonus objectives, and other task pins from `C_TaskQuest.GetQuestsOnMap` on this zone and its neighbors, closest first.
- **Events.** Today's holiday rows from `C_Calendar`. Known holidays add unearned achievements and mounts. Anything else still becomes a task titled with the calendar's own name.
- **Fun.** A short curated list: Going Down?, Higher Learning, the squirrel `/love` sets, Well Read.
- **Farm.** Old raids (and Return to Karazhan) that still have a mount you do not own. A lockout from `GetSavedInstanceInfo` hides that instance for the week.

Tasks carry a rough minute estimate. The list stops when it has filled the budget, allowing about 10 extra minutes so a task is not sliced in half. The first task is kept even if it is longer than the budget.

### Pins and combat

When a step becomes current, Unbored sets the user waypoint (`C_Map.SetUserWaypoint`) and super-tracks it (`C_SuperTrack.SetSuperTrackedUserWaypoint`), so Blizzard's on-screen arrow and distance appear at once. If TomTom is loaded it also adds a TomTom crazy arrow; turn that off in the gear menu or with `/unbored tomtom`. A step with a `waypoints` route moves the arrow to the next point when you come within 30 yards, and the tracker shows "Point 2/4: label" with the distance. Nothing is printed to chat unless you turn chat lines on.

When a step finishes, the pin Unbored set is cleared. A pin you placed yourself is left alone.

In combat, and inside a dungeon, raid, arena, battleground, or scenario, the pin and the "you walked up to it" check are paused. Done and Skip still work. The window stays up so you can read the list. Midnight secret values are not stored and are not used in arithmetic; if a coordinate comes back secret, that check is skipped.

Done, Skip, the queue, and a pending request are saved per character (`UnboredCharDB`). Window and tracker position, the tracker lock, and the TomTom and chat toggles are account-wide (`UnboredDB`). Both windows are built at the UI scale and use the game's own fonts.

### Auto-complete

The current task advances on `ACHIEVEMENT_EARNED`, `CRITERIA_UPDATE`, `CRITERIA_COMPLETE`, `NEW_MOUNT_ADDED`, `NEW_PET_ADDED`, `NEW_TOY_ADDED`, `QUEST_TURNED_IN`, `CURRENCY_DISPLAY_UPDATE`, `ZONE_CHANGED_NEW_AREA`, and when you are standing on a task whose completion type is proximity. A rare vignette counts once it is dead, its loot quest is flagged, or it despawns while you are on the pin. Walking away does not finish it.

Account-wide achievement completion counts as done. See open questions below if that should be this character only.

## Import and export

An outside planner builds a line that starts with `UNB1:`. You paste it with `/unbored import` or Import in the gear menu. The list switches immediately. No reload.

`/unbored export` selects an `UNB1P:` line: done and skipped task ids, timestamps, and what is left. Send that back to the planner.

The format, the JSON schema, and a paste-ready example are in [`docs/plan-format.md`](docs/plan-format.md).

The Windows tray app in `companion/` writes `Interface/AddOns/Unbored_Plan/Plan.lua`. A plan that answers this character's Get plan request starts on the next load with no prompt. A plan the planner put directly starts once per character, when no request is waiting. `/unbored companion` applies the file again. The older `Companion/Plan.lua` and `UnboredDB.companionPlan` seam is still applied on login when its `generatedAt` is newer than the saved session. The import string remains the path that does not need the desktop app.

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

## Layout

```
Unbored.toc
Bindings.xml
Core/         window logic, import codec, completion, session
Data/         contributor tables
Providers/    one file per mode
UI/
Companion/    optional Plan.lua seam
docs/plan-format.md
```

Saved variables never contain secret values or functions.

## Release zip

`.pkgmeta` plus `.github/workflows/release.yml` run [BigWigs packager](https://warcraft.wiki.gg/wiki/Using_the_BigWigs_Packager_with_GitHub_Actions) v2 on any tag. CurseForge and Wago ids are unset until those projects exist; the GitHub release zip still builds. `contents: write` is set so `GITHUB_TOKEN` can upload it.

Push a tag:

```
git tag v0.1.0
git push origin v0.1.0
```

Lint and unit tests run on every push (`.github/workflows/ci.yml`, `luacheck` and `lua5.1 tests/run.lua`). On Ubuntu the luacheck package is `lua-check`.

## Roadmap

- More exploration continents once their achievement ids are confirmed on 12.1.5.
- A starter set of rare tracking quests, after someone dumps a few with `/dump C_QuestLog.IsQuestFlaggedCompleted`.
- Midnight zone rows, once ui map ids are confirmed in `/unbored where`.
- Transmog-only dungeon trips, using the `appearances` field that Farm already understands.
- A real options panel. The slash commands cover the MVP.
- Installers and SmartScreen notes for the tray app live in `companion/README.md`.

## Known limits

These are choices, not silent guesses. Push back if one of them is wrong.

- The first Skip moves the task to the end of the queue. The second Skip drops it for this session.
- Proximity auto-complete defaults to 40 yards and only applies to completion kind `proximity` (treasures and explicit go-to tasks). Reaching a raid door does not finish the raid.
- "Local events" in Quests are bonus objectives and map task pins from `C_TaskQuest.GetQuestsOnMap`, not a separate event board.
- Holiday rows match a calendar event by Holiday.db2 id, by `iconTexture`, or by the English title. Hallow's End uses textures `235460`, `235461`, and `235462` (what HandyNotes reads from `C_Calendar.GetDayEvent`). Those are not the same number as Holiday.db2 id 324, which is kept only as an extra key. Other holidays fall back to the English title until their texture ids are confirmed.
- `Data/Rares.lua` has Huolon (Timeless Isle, daily tracking quest 33311 from the wowhead quest page). No other tracking quests are shipped.
- Raid doors use the Wowhead entrance guide (guide 8974), converted from 0–100 to 0–1. Several of those figures are whole numbers.
- Interface `120105` only. A 12.1.0 client (`120100`) will not load this TOC.
- This tree was checked against the API wiki and `lua5.1 tests/run.lua`. It has not been `/reload`ed inside the 12.1.5 client.

## License

[MIT](LICENSE).
