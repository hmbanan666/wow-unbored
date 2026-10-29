# Unbored

Goal: a helper players want to use, that never annoys and genuinely helps.

A calm, open-source session planner for World of Warcraft **Retail** (Midnight 12.x). You pick a mood and a time budget. Wisp, a small glowing spirit on your screen, answers "what do I do now?" with one step at a time in a chat bubble, and answers questions about the world and your items. One map pin, for the current step only.

It is not a gold-per-hour optimizer. [WhatNow](https://www.curseforge.com/wow/addons/whatnow) is a closed beta aimed at gold per minute and it wants TomTom. Unbored is MIT, has no required libraries, and would rather you fall off a cliff for an achievement than squeeze a route.

New here, or an agent? Read [`CONTEXT.md`](CONTEXT.md) (the words we use) and [`docs/adr/`](docs/adr/) (the decisions behind them) first; [`AGENTS.md`](AGENTS.md) says how to add one.

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

**Wisp** is the whole UI: a small round portrait on the left of the screen with one chat bubble beside it. The bubble shows one message at a time:

- the current step, as the plan wrote it ("Fly to Dalaran. Portal is next to you in Orgrimmar."), its note, the route point and distance, and a small `2/5`. The ✓ icon is Done, the arrow is Skip;
- "Thinking..." while a question is out, with Wisp bobbing and glowing, and one **Load** button. While a Full plan is cooking, the Quick plan's step stays up with "A better one is cooking" and **Load**;
- "Better plan's ready! Load it in?" with **Switch** or **Keep this one**, once the Full plan has arrived;
- an answer, shown as written, with a ✓ to say you read it;
- "Hi! What shall we do?" with big preset chips when there is no plan, and "Nice! What next?" with the same chips when a plan is finished.

Above the current bubble at most two older one-line messages stay for a minute and a half, fading ("Done: Fly to Dalaran", an answer you read), so there are never more than three; never a heavy list. Text wraps and the bubble grows; nothing is cut. The − in the bubble folds it down to the portrait. Drag the portrait to move it (Settings → Lock position to stop that). The position is saved, and the bubble opens toward the middle of the screen.

**Starting a plan** happens in the bubble, with no settings to open. Each chip is one click: Stay here, do stuff nearby; Get a mount; Collect stuff nearby (pets, toys, transmog, achievements in this zone); Grind / level / renown; Farm gold / mats; Surprise me. Small time chips under them (30m, 1h, 2h) are optional; 1h is the default. **Something else...** opens one text box in the bubble for your own words, and **Send**. A click builds a **Quick plan** in game at once (up to 7 steps, from the Providers for that chip's mode), so there is a first step right away. With the companion the same click also sends the Request and reloads the UI. When the **Full plan** is back, press **Load**: Wisp asks before switching, and steps you already finished carry over. Something else... has no Quick plan; Wisp says "Got it, cooking a plan..." until Load. The chips are one table in `Data/Presets.lua` (id, label, mode, and the words sent to the planner), so they are easy to edit.

**Click Wisp** with no plan and it offers the chips. Otherwise a click (or a right-click any time) opens the game's own context menu. With a plan running it starts with the step: What next?, Skip this step, Show route on map. Then New plan, What is this item?, Ask something, and Settings last.

- **Ask something** is one text box and **Send**.
- **What to do nearby?** is the same box, optional, and asks the planner for something around you.
- **What is this item?** has a slot. Drop an item on it, drop an item on Wisp, or Alt+Right-click the item in your bags. It shows what Unbored already knows and offers **Ask about it**.
- **Settings** is basic: Size (80–150%), Lock position, Hide, Keybinds, and More. Hide hides Wisp; the minimap button (left-click) or `/unbored` brings it back.

With the companion installed, every send (a preset chip, **Send**, **Ask about it**) saves the request and reloads the UI in the same click, so the companion can read it. The companion pops a Windows toast from Wisp when the answer arrives. **Load** reloads, and the plan starts, or the answer appears in the bubble. Any other reload or login picks it up too. Without the companion a chip gives you just the Quick plan; What to do nearby? (`/unbored nearby`) builds a Roam list; questions and item questions say they need the companion.

**Item tooltips** get one short Wisp line when there is something to say: an answer the planner gave about that item, a note from `Data/Items.lua` (Hearthstone, cloth, food, keystone, and a few more), "Needed for your plan" when an active step is about it, and whether a mount, pet, or toy is still missing from your collection. Nothing is added otherwise.

**Show all steps** (Settings → More) opens the full list in the quest-tracker style: step count, minutes left, the next steps dimmed (click one to read its note), collapse, and its own saved position.

Settings → More holds the rarely used things: point the arrow again, the TomTom arrow, chat lines (off by default), build here instead, import a plan string, export progress, and reset position. The gear in the main window opens the same list.

The name is one string, `ns.MASCOT_NAME` in `Core/Namespace.lua`. Every UI string is in `Core/Locale.lua`, English by default with a Russian table; text from plans and answers is shown as written.

Keybinds (Esc → Options → Keybindings → AddOns → Unbored), so a gamepad / ConsolePort can reach them:

- Pick a new plan (the preset chips)
- Done
- Skip
- Waypoint (point the arrow again)
- Load plan (reloads the UI; a keypress counts as the click Blizzard requires)

Nothing in the normal flow needs a slash command. They exist anyway: `/unbored show|hide`, `/unbored ask [text]|nearby|item`, `/unbored list|lock|reset`, `/unbored build`, `/unbored` (the chips), `/unbored roam|quests|events|fun|farm` (pick the mode, then type a wish), `/unbored 30|60|120` (pick the time), `/unbored import|export`, `/unbored tomtom|chat|minimap`, `/unbored companion` (apply the companion file again), and `/unbored where` (map id and 0–100 coordinates, for people adding data).

### What the modes suggest

- **Roam.** Unearned exploration criteria (Eastern Kingdoms through Pandaria are in the table; add more continents in `Data/Exploration.lua`), rares and treasures the client is currently showing (`C_VignetteInfo`), and any curated rare in `Data/Rares.lua` that has a tracking quest id.
- **Quests.** Your log, plus world quests, bonus objectives, and other task pins from `C_TaskQuest.GetQuestsOnMap` on this zone and its neighbors, closest first.
- **Events.** Today's holiday rows from `C_Calendar`. Known holidays add unearned achievements and mounts. Anything else still becomes a task titled with the calendar's own name.
- **Fun.** A short curated list: Going Down?, Higher Learning, the squirrel `/love` sets, Well Read.
- **Farm.** Old raids (and Return to Karazhan) that still have a mount you do not own. A lockout from `GetSavedInstanceInfo` hides that instance for the week.

Tasks carry a rough minute estimate. The list stops when it has filled the budget, allowing about 10 extra minutes so a task is not sliced in half. The first task is kept even if it is longer than the budget.

### Pins and combat

When a step becomes current, Unbored sets the user waypoint (`C_Map.SetUserWaypoint`) and super-tracks it (`C_SuperTrack.SetSuperTrackedUserWaypoint`), so Blizzard's on-screen arrow and distance appear at once. If TomTom is loaded it also adds a TomTom crazy arrow; turn that off in the gear menu or with `/unbored tomtom`. A step with a `waypoints` route moves the arrow to the next point when you come within 30 yards, and the bubble shows "Point 2/4: label" with the distance. Nothing is printed to chat unless you turn chat lines on.

When a step finishes, the pin Unbored set is cleared. A pin you placed yourself is left alone.

In combat, and inside a dungeon, raid, arena, battleground, or scenario, the pin and the "you walked up to it" check are paused. Done and Skip still work. The window stays up so you can read the list. Midnight secret values are not stored and are not used in arithmetic; if a coordinate comes back secret, that check is skipped.

Done, Skip, the queue, a pending request, and the last answer are saved per character (`UnboredCharDB`). Wisp's position and lock, the window and list positions, item answers, and the TomTom and chat toggles are account-wide (`UnboredDB`). Everything is built at the UI scale and uses the game's own fonts.

### Blizzard rules

The addon never touches the network; the companion carries requests and answers through SavedVariables and its own `Unbored_Plan` addon. ReloadUI runs only from a click or a keybind. Bag buttons are not replaced or re-scripted: the tooltip line uses `TooltipDataProcessor.AddTooltipPostCall`, and Alt+Right-click is a `hooksecurefunc` post-hook on `HandleModifiedItemClick`, which only opens Unbored's own window. Modified clicks do not use the item, so no protected action changes.

### Auto-complete

The current task advances on `ACHIEVEMENT_EARNED`, `CRITERIA_UPDATE`, `CRITERIA_COMPLETE`, `NEW_MOUNT_ADDED`, `NEW_PET_ADDED`, `NEW_TOY_ADDED`, `QUEST_TURNED_IN`, `CURRENCY_DISPLAY_UPDATE`, `ZONE_CHANGED_NEW_AREA`, and when you are standing on a task whose completion type is proximity. A rare vignette counts once it is dead, its loot quest is flagged, or it despawns while you are on the pin. Walking away does not finish it.

Account-wide achievement completion counts as done. See open questions below if that should be this character only.

## Import and export

An outside planner builds a line that starts with `UNB1:`. You paste it with `/unbored import` or Import in the gear menu. The list switches immediately. No reload.

`/unbored export` selects an `UNB1P:` line: done and skipped task ids, timestamps, and what is left. Send that back to the planner.

The format, the JSON schema, and a paste-ready example are in [`docs/plan-format.md`](docs/plan-format.md).

The Windows tray app in `companion/` writes `Interface/AddOns/Unbored_Plan/Plan.lua`. A plan or answer for this character's pending request starts on the next load with no prompt. A plan the planner put directly starts once per character, when no request is waiting. `/unbored companion` applies the file again. The older `Companion/Plan.lua` and `UnboredDB.companionPlan` seam is still applied on login when its `generatedAt` is newer than the saved session. The import string remains the path that does not need the desktop app.

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
