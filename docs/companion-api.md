# Companion planner API

Unbored Companion can poll an HTTPS endpoint you host. `server/` in this repo is that endpoint. The app sends the calls below and does nothing if the URL is empty.

The base URL is whatever you type in the app, without a trailing slash. Example: `https://planner.example/unbored`.

Only `https://` is accepted. `http://localhost` and `http://127.0.0.1` are allowed so you can run a stub on your own machine.

If the token box is not empty, every request sends `Authorization: Bearer <token>`.

## GET /v1/plan

Latest session for this player.

```
GET {base}/v1/plan
Accept: application/json
```

Response `200`:

```json
{
  "plan": "UNB1:...."
}
```

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

Unbored reads the global `UnboredExternalPlan` from that addon on load and asks before it replaces the current list.

## Server in this repo

`server/` implements the two calls above. The companion sends `Authorization: Bearer <UNBORED_COMPANION_TOKEN>`. Putting a plan, reading progress, and the MCP endpoint `/mcp` use a different bearer, `UNBORED_PLANNER_TOKEN`. Setup, the volume mount, and the planner routes are in `server/README.md`.
