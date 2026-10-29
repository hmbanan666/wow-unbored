# Plan strings

An outside planner (a script, a website, an AI mentor) can hand Unbored a session without a reload. The player copies one line into `/unbored import`. Unbored can hand progress back as another line.

This is the primary path. The SavedVariables / `Companion/Plan.lua` seam is still read on login, for a tool that would rather write a file while the game is closed.

## Wire format

```
UNB1:<base64>
UNB1P:<base64>
```

1. Build a JSON object, UTF-8, no comments.
2. Base64-encode the raw JSON bytes. Standard alphabet (`+` `/`), with `=` padding. URL-safe `-` `_` is accepted on import.
3. Prefix a plan with `UNB1:` and a progress export with `UNB1P:`.
4. Whitespace inside the string is ignored, so a wrapped paste still works.

Version is the JSON field `v`, currently `1`. Unknown versions are rejected. There is no `loadstring`. A bad string shows an error in the import window and does not touch the current list.

Limits: 40 tasks, titles up to 240 bytes, notes up to 400 bytes, the whole paste under 20,000 characters.

## Plan

```json
{
  "v": 1,
  "kind": "plan",
  "mode": "custom",
  "budget": 60,
  "note": "evening session",
  "tasks": [
    {
      "id": "mentor:fall",
      "title": "Going Down?",
      "estMinutes": 5,
      "note": "просто упади",
      "complete": { "kind": "achievement", "achievementID": 964 }
    },
    {
      "id": "mentor:ashes",
      "title": "Ashes of Al'ar",
      "mapID": 109,
      "x": 0.739,
      "y": 0.637,
      "estMinutes": 20,
      "note": "Tempest Keep, Kael'thas.",
      "complete": { "kind": "mount", "mountID": 183 }
    }
  ]
}
```

`mode` is `roam`, `quests`, `events`, `fun`, `farm`, or `custom`. `budget` is a whole number of minutes from 5 to 240. The three buttons in the window are 30, 60, and 120; an imported plan may use another value.

`x` and `y` are fractions of the map from 0 to 1, the same space as `C_Map.GetPlayerMapPosition`. They are not 0–100 wowhead coordinates. Divide those by 100.

`id` may contain letters, numbers, `:`, `.`, `_`, and `-`.

### Waypoint routes

A task may carry an optional route instead of, or as well as, its single pin:

```json
{
  "id": "route:dorn",
  "title": "Ride the coast",
  "estMinutes": 15,
  "waypoints": [
    { "mapID": 2248, "x": 0.412, "y": 0.735, "label": "Dornogal gate" },
    { "mapID": 2248, "x": 0.552, "y": 0.617, "label": "Rare: Kronolith" },
    { "mapID": 2248, "x": 0.668, "y": 0.444 }
  ]
}
```

Up to 10 points. `mapID` and fractional `x`/`y` are required; `label` is optional, up to 80 bytes. When the step becomes current the first point gets the native waypoint and is super-tracked, plus a TomTom arrow if TomTom is loaded. Within 30 yards of a point the arrow moves to the next one, and the bubble shows `Point 2/3: Rare: Kronolith`. Reaching the last point does not finish the step unless `complete` says so. A plan without `waypoints` behaves as before.

Start the route near the player. A request carries the player's `context` (see [companion-api.md](companion-api.md)).

The line below is that JSON, compact, then base64. Paste it in game to try the window:

```
UNB1:eyJ2IjoxLCJraW5kIjoicGxhbiIsIm1vZGUiOiJjdXN0b20iLCJidWRnZXQiOjYwLCJub3RlIjoiZXZlbmluZyBzZXNzaW9uIiwidGFza3MiOlt7ImlkIjoibWVudG9yOmZhbGwiLCJ0aXRsZSI6IkdvaW5nIERvd24/IiwiZXN0TWludXRlcyI6NSwibm90ZSI6ItC/0YDQvtGB0YLQviDRg9C/0LDQtNC4IiwiY29tcGxldGUiOnsia2luZCI6ImFjaGlldmVtZW50IiwiYWNoaWV2ZW1lbnRJRCI6OTY0fX0seyJpZCI6Im1lbnRvcjphc2hlcyIsInRpdGxlIjoiQXNoZXMgb2YgQWwnYXIiLCJtYXBJRCI6MTA5LCJ4IjowLjczOSwieSI6MC42MzcsImVzdE1pbnV0ZXMiOjIwLCJub3RlIjoiVGVtcGVzdCBLZWVwLCBLYWVsJ3RoYXMuIiwiY29tcGxldGUiOnsia2luZCI6Im1vdW50IiwibW91bnRJRCI6MTgzfX1dfQ==
```

## Completion object

`complete` may be omitted; that means the player marks it Done.

| kind | fields | finishes when |
| --- | --- | --- |
| `manual` | | Done is pressed |
| `achievement` | `achievementID` | `ACHIEVEMENT_EARNED`, or it is already complete |
| `criteria` | `achievementID`, and `criteriaID` or `criteriaIndex` | that criterion, or the whole achievement |
| `quest` | `questID` | `QUEST_TURNED_IN` or `C_QuestLog.IsQuestFlaggedCompleted` |
| `mount` | `mountID` and/or `mountIDs` | every listed mount is collected |
| `toy` | `itemID` | `NEW_TOY_ADDED` / `PlayerHasToy` |
| `pet` | `speciesID` | `NEW_PET_ADDED` / collected count |
| `currency` | `currencyID`, optional `minQuantity` | `C_CurrencyInfo` quantity |
| `zone` | `mapID` | player enters that ui map |
| `proximity` | `mapID`, `x`, `y`, optional `radiusYards` (5–500, default 40) | player is within that many yards |
| `vignette` | `vignetteID` and/or `questID`, optional pin | the vignette is dead, the quest is flagged, or it despawns while you are on the pin |
| `any` | `any`: array of the above, max 4, no nested `any` | the first matching child |

Account-wide achievement completion counts as done (`GetAchievementInfo`'s `completed` flag). Say if this should be per-character only.

## Progress export

`/unbored export`, or Export progress in the same window, selects a string:

```json
{
  "v": 1,
  "kind": "progress",
  "mode": "custom",
  "budget": 60,
  "exportedAt": 1761720000,
  "currentId": "mentor:ashes",
  "done": [{ "id": "mentor:fall", "at": 1761719000 }],
  "skipped": [],
  "remaining": ["mentor:ashes"],
  "source": "import"
}
```

`at` and `exportedAt` are WoW's `time()` (unix seconds on the game server). `source` is `provider`, `import`, or `companion`.

```
UNB1P:eyJ2IjoxLCJraW5kIjoicHJvZ3Jlc3MiLCJtb2RlIjoiY3VzdG9tIiwiYnVkZ2V0Ijo2MCwiZXhwb3J0ZWRBdCI6MTc2MTcyMDAwMCwiY3VycmVudElkIjoibWVudG9yOmFzaGVzIiwiZG9uZSI6W3siaWQiOiJtZW50b3I6ZmFsbCIsImF0IjoxNzYxNzE5MDAwfV0sInNraXBwZWQiOltdLCJyZW1haW5pbmciOlsibWVudG9yOmFzaGVzIl19
```

Pasting a progress string into Import is an error. It does not replace the list.

## Companion file

The desktop app writes `Interface/AddOns/Unbored_Plan/Plan.lua` (global `UnboredExternalPlan`). On load, a plan whose `requestId` matches this character's pending request starts at once, with no prompt. A plan without a `requestId` starts once per character, and only when no request is pending. `/unbored companion` applies the file again. See `companion/README.md`.

Alongside `requestId`, `requestStatus` (`pending`, `fulfilled`, `failed`), and `requestReason`, the file carries `requestType` (`plan`, `question`, `item`) and, for an answered request, `answer`:

```lua
UnboredExternalPlan = {
  requestId = "req-1761720300-0042",
  requestStatus = "fulfilled",
  requestType = "question",
  answer = {
    message = "A rare is east of you.\nI pinned it.",
    waypoints = { { mapID = 2248, x = 0.6, y = 0.4, label = "Rare" } },
    answeredAt = 1761720500,
  },
}
```

`tasks` may be there too when the answer came with a plan. The bubble shows `message` as written (up to 1,000 bytes) until the player presses ✓. `waypoints` become one step, `title` taken from the first label, put in front of the current plan. An answer to an item request is also remembered for that item and shown in its tooltip.

The older seam is still read: a Lua table in `Companion/Plan.lua`:

```lua
UnboredCompanionPlan = {
  v = 1,
  kind = "plan",
  generatedAt = 1761720000,
  mode = "custom",
  budget = 60,
  tasks = { },
}
```

or in account SavedVariables as `UnboredDB.companionPlan`. On login, a `generatedAt` newer than the saved session replaces it. `/unbored companion` applies it even when it is older.

Import from a string is immediate and does not need a reload. Building a plan in game (when no companion is installed) replaces the imported list.
