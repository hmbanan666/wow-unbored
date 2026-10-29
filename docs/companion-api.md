# Companion planner API

Unbored Companion can poll an HTTPS endpoint you host. `server/` in this repo is that endpoint. The app sends the calls below and does nothing if the URL is empty.

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

Anything other than 2xx is shown in the tray window and the previous `Plan.lua` is left as it was. The server in this repo returns `404` with `{ "error": "No plan yet." }` until the planner has stored one.

## POST /v1/progress

Sent after the app reads a character `SavedVariables/Unbored.lua` (written by the game on `/reload` or logout).

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
    "budget": 60,
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

Unbored reads the global `UnboredExternalPlan` from that addon on load. A plan for this character's pending request starts by itself; see [plan-format.md](plan-format.md#companion-file). The companion rewrites the file only when its content changes and shows a Windows toast, "Plan ready, press Load plan", once per fulfilled request.

## Plan requests

`POST {base}/v1/requests` with the companion bearer (device secret or `UNBORED_COMPANION_TOKEN`):

```json
{
  "id": "req-1761720000-1234",
  "createdAt": 1761720000,
  "character": "Hero",
  "realm": "Area 52",
  "mode": "farm",
  "budget": 60,
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

`mode` is `roam`, `quests`, `events`, `fun`, or `farm`. `wish` is free text up to 600 bytes. `context` is optional and every field in it is optional; the game fills what it can read. Fields of the wrong type are dropped, and a context over 8,000 bytes is rejected. `x`/`y` are 0–1 fractions on `mapID`. `gold` is whole gold. `plan` describes the list that was active when the request was made. The same id posted again does not send another webhook.

Plan from where the player stands: begin at or near `context.mapID` / `x` / `y`, keep the route in one zone unless the wish says otherwise, and use `hearth`, `skyriding`, and `canFly` to judge travel.

`GET {base}/v1/requests/latest` returns that request plus `"plan": "UNB1:..."` when it has been fulfilled, or `"plan": null` while it is pending or failed. `status` is `pending`, `fulfilled`, or `failed`. `reason` is set when it failed.

If `UNBORED_PLANNER_WEBHOOK_URL` is set, a new request also POSTs `{ requestId, character, realm, mode, budget, wish, context }` to that URL (`context` is `null` when the game sent none). `UNBORED_PLANNER_WEBHOOK_KEY` is sent as `Authorization: Bearer <key>`. If `UNBORED_PLANNER_WEBHOOK_KEY_HEADER` names another header, that header is set to the key as well. An empty URL skips the webhook. A failed POST is retried twice more.

## Device pairing

`POST {base}/v1/devices/register` with no bearer token:

```json
{ "deviceId": "desktop-abc12345", "name": "Nick-PC", "secretHash": "<64 hex chars>" }
```

`secret` (at least 16 characters) may be sent instead of `secretHash`. The server hashes it and does not store the secret. The device is `pending` until `approve_device`. At most 20 devices may wait, and one IP can register 10 times in 10 minutes.

`GET {base}/v1/devices/me` with `Authorization: Bearer <device secret>` returns `{ "id", "name", "status", "createdAt", "lastSeenAt" }`. `status` is `pending`, `approved`, or `revoked`.

An approved device can call `GET /v1/plan` and `POST /v1/progress` only. It cannot put a plan. Revoked and pending devices are rejected on those two calls.

## Server in this repo

`server/` implements the two calls above. The companion sends `Authorization: Bearer <UNBORED_COMPANION_TOKEN>`. Putting a plan, reading progress, and the MCP endpoint `/mcp` use a different bearer, `UNBORED_PLANNER_TOKEN`. Setup, the volume mount, and the planner routes are in `server/README.md`.
