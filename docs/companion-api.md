# Companion planner API

Unbored Companion can poll an HTTPS endpoint you host. `apps/server/` in this repo is that endpoint. The app sends the calls below and does nothing if the URL is empty.

The base URL is whatever you type in the app, without a trailing slash. Example: `https://planner.example/unbored`.

Only `https://` is accepted. `http://localhost` and `http://127.0.0.1` are allowed so you can run a stub on your own machine.

Companion 0.1.1 does not ask for a token. On first launch it registers a device and, after that device is approved, sends `Authorization: Bearer <device secret>`. The server stores only the SHA-256 of that secret. Older builds, and `UNBORED_COMPANION_TOKEN`, still authenticate the same two calls.

## GET /v1/plan

Latest session for this player.

```
GET {base}/v1/plan
Accept: application/json
```

Response `200`:

```json
{
  "id": 12,
  "createdAt": 1761720000,
  "plan": "UNB1:...."
}
```

`id` grows with every stored plan. The companion compares it with a request's `planId` so a plan put after a request was fulfilled is not hidden by it. Older servers that omit `id` still work; the request's plan wins then.

`plan` may instead be the JSON object from [plan-format.md](plan-format.md) (`v`, `kind: "plan"`, `tasks`). The string form is the one the in-game importer also accepts.

Anything other than 2xx is shown under Advanced in the tray window, the plan part of `Plan.lua` is left as it was, and the status block says `online = false`. The server in this repo returns `404` with `{ "error": "No plan yet." }` until the planner has stored one.

## POST /v1/progress

Sent after the app reads a character `SavedVariables/Unbored.lua` (written by the game at a Refresh or logout).

```
POST {base}/v1/progress
Content-Type: application/json
```

```json
{
  "account": "111111#1",
  "realm": "Area 52",
  "character": "Hero",
  "savedAt": 1761720000,
  "progress": {
    "v": 1,
    "kind": "progress",
    "mode": "custom",
    "source": "import",
    "currentId": "mentor:ashes",
    "done": [{ "id": "mentor:fall", "at": 1761719000 }],
    "skipped": [],
    "remaining": ["mentor:ashes"]
  }
}
```

`savedAt` and each `at` are unix seconds from the game's `time()`, or null if that field was missing. `currentId` is the first remaining task.

One POST per character file that contains `UnboredCharDB.session`. A non-2xx response is shown once in the window; the local plan file is not deleted.

## What the app writes instead of calling the game

The plan is not posted into SavedVariables. Those files are rewritten by WoW on logout and would be clobbered if the app edited them while the client was open. The app writes:

`_retail_/Interface/AddOns/Unbored_Plan/Plan.lua`

Unbored reads the global `UnboredExternalPlan` from that addon when the UI loads: at login, a character switch, or a Refresh the player clicks (teleports and loading screens do not read it; docs/adr/0012). A plan for this character's pending request is taken then; see [plan-format.md](plan-format.md#companion-file). The companion rewrites the file only when its content changes and shows a Windows toast from Wisp, "Your plan is ready in the game" (or "Your answer is ready in the game"), once per fulfilled request.

`_retail_/Interface/AddOns/Unbored_Plan/Advice.lua` holds Personal advice (below), written the same way and read at the same moments.

### Companion status

The file ends with a status block after the line `-- Companion status, rewritten on every check.` The plan part and this part are written separately, so neither overwrites the other:

```lua
UnboredCompanionStatus = {
  v = 1,
  pairing = "pending",      -- "pending", "approved", "revoked"; missing before the first answer
  online = true,            -- false when the last sync with the planner failed
  addonVersion = "0.6.0",   -- Unbored.toc on disk; missing if the addon is not installed
  companionVersion = "0.6.0",
  seenAt = 1793280000,      -- unix seconds of the last check, rounded down to 300
}
```

The game reads it only when the UI loads, like the plan. Wisp turns it into one line: not approved yet, disconnected, can't reach the planner, or "the Companion isn't running" when `seenAt` was more than 15 minutes old at that load (a long session alone never counts as stopped). An `addonVersion` newer than the running addon means an update is on disk; Wisp says "Press Load to finish the update", and asks for a game restart if Load did not pick it up. A missing block (Companion 0.4 or older) shows nothing.

## Requests

The game sends three kinds of request, all through SavedVariables and the companion: `plan` (a preset chip or Something else... in Wisp's bubble), `question` (Ask something, and What to do nearby? with `topic: "nearby"`), and `item` (What is this item?). One request is pending per character at a time.

`POST {base}/v1/requests` with the companion bearer (device secret or `UNBORED_COMPANION_TOKEN`):

```json
{
  "id": "req-1761720000-1234",
  "type": "plan",
  "createdAt": 1761720000,
  "character": "Hero",
  "realm": "Area 52",
  "mode": "farm",
  "wish": "mount, stay in this zone",
  "context": {
    "mapID": 2248,
    "zone": "Isle of Dorn",
    "subzone": "Dornogal",
    "x": 0.4512,
    "y": 0.6031,
    "level": 80,
    "faction": "Alliance",
    "class": "Mage",
    "classFile": "MAGE",
    "specID": 63,
    "spec": "Fire",
    "ilvl": 612.4,
    "gold": 18342,
    "skyriding": true,
    "canFly": true,
    "inInstance": false,
    "hearth": "Dornogal",
    "trackedQuests": [{ "id": 78529, "title": "Rock Bottom" }],
    "plan": { "mode": "quests", "step": 2, "steps": 5, "currentId": "quest:78529", "minutesLeft": 40 }
  }
}
```

`type` is `plan` (the default when it is missing), `question`, or `item`. For `plan`, `mode` (`roam`, `quests`, `events`, `fun`, or `farm`) is required, and `budget` (5–240 minutes) is sent only when the player typed minutes into the custom form ([ADR 0037](adr/0037-no-time-budget.md)); the other types leave both out. A stored Request without one reads back `budget: null`. `wish` is free text up to 600 bytes. A plan from a preset chip also carries `topic`, the preset id (`nearby`, `mount`, `collect`, `grind`, `gold`, `surprise`, from `Data/Presets.lua`), and the preset's wish in plain words; a plan typed in Something else... has no `topic`.

A question carries `question` (required, up to 600 bytes) and may carry `topic`, lowercase letters, `_`, or `-` (the game sends `nearby`):

```json
{ "id": "req-1761720300-0042", "type": "question", "character": "Hero", "realm": "Area 52",
  "question": "What can I do nearby right now?", "topic": "nearby", "context": { "mapID": 2248 } }
```

An item request carries `item`: `itemID` is required; `link`, `name`, `bag`, `slot`, and `count` (how many the bags hold) are filled when the game knows them. `question` is optional.

```json
{ "id": "req-1761720400-0007", "type": "item", "character": "Hero", "realm": "Area 52",
  "item": { "itemID": 6948, "link": "|cffffffff|Hitem:6948::::::::80:::::|h[Hearthstone]|h|r",
            "name": "Hearthstone", "bag": 0, "slot": 3, "count": 1 } }
```

 `context` is optional and every field in it is optional; the game fills what it can read. Fields of the wrong type are dropped, and a context over 8,000 bytes is rejected. `x`/`y` are 0–1 fractions on `mapID`. `gold` is whole gold. `plan` describes the list that was active when the request was made. The same id posted again does not send another webhook.

Plan from where the player stands: begin at or near `context.mapID` / `x` / `y`, keep the route in one zone unless the wish says otherwise, and use `hearth`, `skyriding`, and `canFly` to judge travel.

`GET {base}/v1/requests/{id}` returns the Request with that id, or 404 when it is not this device's. The companion asks for exactly the id the game waits for (`UnboredCharDB.request.id` in SavedVariables), so a newer status on an older Request never changes which answer the game gets. `GET {base}/v1/requests/latest` is the fallback when the game waits for nothing: it returns the device's newest Request by creation time (never by update time). Both return the request (with `type`, `question`, `topic`, `item`) plus `"plan": "UNB1:..."` when it was fulfilled with a plan, or `"plan": null` otherwise. `status` is `pending`, `fulfilled`, or `failed`. `reason` is set when it failed, with `reasonCode` (`planner_failed`, or `timeout` when a Request was still pending after 60 minutes; that changes only its own status). `eta` is how long recent plan Requests took (p50 in seconds, 60 to 900, 180 until there are three answers); the Companion writes it into `Plan.lua` so Wisp knows when to offer a Refresh. `answer` is set when the planner answered with `answer_request`:

```json
{ "message": "A rare is east of you. I pinned it.", "waypoints": [{ "mapID": 2248, "x": 0.6, "y": 0.4, "label": "Rare" }], "answeredAt": 1761720500 }
```

`message` is text up to 1,000 bytes, shown in the bubble as written; it may carry [entity markup](../packages/contracts/markup.md) tokens, with `entities` beside it for npcs. `waypoints` is optional (the same route points as in a plan, up to 10); the game turns them into one step in front of the current plan. An answer may also come with a plan, which then starts as usual. The companion writes the answer into `UnboredExternalPlan.answer`, with `requestType`; see [plan-format.md](plan-format.md#companion-file).

If `UNBORED_PLANNER_WEBHOOK_URL` is set, a new request also POSTs `{ requestId, type, character, realm, mode, budget, wish, question, topic, item, context }` to that URL (`budget` and `context` are `null` when the game sent none). `UNBORED_PLANNER_WEBHOOK_KEY` is sent as `Authorization: Bearer <key>`. If `UNBORED_PLANNER_WEBHOOK_KEY_HEADER` names another header, that header is set to the key as well. An empty URL skips the webhook. A failed POST is retried twice more.

## GET /v1/advice

Personal advice for the characters whose profiles this device uploaded (docs/adr/0019), with the companion bearer. The Planner stores it with the MCP tool `put_item_advice`.

```json
{
  "characters": [
    {
      "character": "Hero",
      "realm": "Area 52",
      "updatedAt": 1761720000,
      "items": [
        { "itemID": 2447, "action": "send", "line": "Send to Mira (Alchemy): mail", "lineRu": "Отправь Мире (алхимия): почтой", "to": "Mira" }
      ]
    }
  ]
}
```

The Companion fetches it on every sync and writes `Unbored_Plan/Advice.lua` when it changed, keeping only `action`, `line`, `lineRu` and `to` and at most 500 items per character:

```lua
UnboredAdvice = {
  ["v"] = 1,
  ["characters"] = {
    ["Area 52-Hero"] = {
      ["updatedAt"] = 1761720000,
      ["items"] = {
        [2447] = { ["action"] = "send", ["line"] = "Send to Mira (Alchemy): mail", ["lineRu"] = "...", ["to"] = "Mira", },
      },
    },
  },
}
```

The addon checks every line again: it drops lines that say delete, never shows sell for epic or bind-on-equip items, and never shows send for soulbound items. Live game rules (quest items, uncollected mounts, toys, pets and looks, upgrades) still come first. A failed fetch never holds back plans and answers.

## POST /v1/profile

The player profile (docs/adr/0011). The addon keeps `UnboredCharDB.profile` current from game events (bags, money, equipment, professions) and the game saves it at logout or a Refresh; the companion posts it once per `savedAt`, with the companion bearer:

```json
{ "character": "Hero", "realm": "Area 52", "savedAt": 1761720000,
  "profile": { "v": 1, "context": { "mapID": 2248 }, "bags": [{ "itemID": 6948, "count": 1 }],
    "bank": { "seenAt": 1761710000, "items": [] }, "currencies": [{ "id": 3008, "name": "Valorstones", "quantity": 420 }],
    "collections": { "mounts": 212, "pets": 480, "toys": 300, "achievementPoints": 15000 },
    "renown": [{ "id": 2590, "name": "Council of Dornogal", "level": 18 }],
    "sessions": [{ "start": 1761700000, "stop": 1761720000, "zones": ["Isle of Dorn"] }],
    "recentSteps": [{ "id": "quest:78529", "title": "Rock Bottom", "bucket": "done", "at": 1761719000 }] } }
```

`character` is required, `profile` must be an object under 512 KB. The server keeps one profile per character and realm; an upload with an older `savedAt` than the stored one is ignored (`"updated": false`). The bank is only readable while it is open, so `bank` is the last look. Planners read it with the MCP tool `get_player_profile`.

## Device pairing

`POST {base}/v1/devices/register` with no bearer token:

```json
{ "deviceId": "desktop-abc12345", "name": "Nick-PC", "secretHash": "<64 hex chars>" }
```

`secret` (at least 16 characters) may be sent instead of `secretHash`. The server hashes it and does not store the secret. The device is `pending` until `approve_device`. At most 20 devices may wait, and one IP can register 10 times in 10 minutes.

`GET {base}/v1/devices/me` with `Authorization: Bearer <device secret>` returns `{ "id", "name", "status", "createdAt", "lastSeenAt" }`. `status` is `pending`, `approved`, or `revoked`.

An approved device can call `GET /v1/plan` and `POST /v1/progress` only. It cannot put a plan. Revoked and pending devices are rejected on those two calls.

## Server in this repo

`apps/server/` implements the two calls above. The companion sends `Authorization: Bearer <UNBORED_COMPANION_TOKEN>`. Putting a plan, reading progress, and the MCP endpoint `/mcp` use a different bearer, `UNBORED_PLANNER_TOKEN`. Setup, the volume mount, and the planner routes are in `apps/server/README.md`.
