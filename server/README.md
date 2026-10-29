# Unbored server

A single container that holds one player's session plan and the progress the companion posts back. The planner (an AI chat, or any client with the planner token) writes the plan. Unbored Companion polls it and writes `Unbored_Plan` into the game. After `/reload`, the companion posts progress here and the planner reads it.

One player for now. Rows are stored with `player_key = self`, so a later token-to-player table does not have to reshape the plan and progress tables.

## Run

```
UNBORED_COMPANION_TOKEN=... UNBORED_PLANNER_TOKEN=... npm start
```

The process listens on `PORT` (default `3000`) and stores SQLite at `$UNBORED_DATA_DIR/unbored.sqlite` (default `/data/unbored.sqlite`).

| Variable | Required | Meaning |
| --- | --- | --- |
| `UNBORED_COMPANION_TOKEN` | yes | Bearer token the companion sends. Used for `GET /v1/plan` and `POST /v1/progress`. |
| `UNBORED_PLANNER_TOKEN` | yes | Bearer token for putting plans, reading progress, and MCP. Must differ from the companion token. |
| `PORT` | no | Listen port. Default `3000`. |
| `UNBORED_DATA_DIR` | no | Directory for the SQLite file. Default `/data`. |
| `UNBORED_PLANNER_WEBHOOK_URL` | no | Where a new in-game request is POSTed. Empty skips the webhook. |
| `UNBORED_PLANNER_WEBHOOK_KEY` | no | Secret sent as `Authorization: Bearer <key>`. |
| `UNBORED_PLANNER_WEBHOOK_KEY_HEADER` | no | Extra header name that also receives the key. |

`GET /health` needs no token. Every other route rejects a missing or wrong bearer token.

## Companion

Companion 0.1.1 uses `https://unbored.kosarev.space` unless an advanced override is set. It registers itself with `POST /v1/devices/register` and shows **Waiting for approval** until `approve_device` runs. After that it sends the device secret as the bearer on `GET /v1/plan` and `POST /v1/progress`. It also installs the latest `Unbored-v*.zip` into the detected `_retail_` folder.

`UNBORED_COMPANION_TOKEN` still authenticates those two calls for an older companion build.

`GET /v1/plan` returns `{ id, createdAt, plan }`. Until a plan exists it is `404`. The companion leaves the previous plan file alone.

MCP tools `list_devices`, `approve_device`, and `revoke_device` use the planner token. Approving a device does not let it write plans.

`list_requests` lists pending requests (pass `status` for fulfilled or failed). Each request has a `type`: `plan` (mode, budget, optional wish; `topic` names the preset chip: `nearby` stay in this zone, `mount` get a mount, `collect` pets/toys/transmog/achievements in this zone, `grind` level/renown/reputation, `gold` gold or crafting mats, `surprise` anything fun; no `topic` means the wish is the player's own words), `question` (free text; `topic: "nearby"` means "what to do around me"), or `item` (`item.itemID`, the link, name, bag slot, and count). Each carries the player `context` from the game (map, position, level, class, item level, gold, hearth, tracked quests, active plan); answer from there. `answer_request` answers any request: `requestId`, `message` (plain text up to 1,000 bytes, shown as written in the mascot bubble), optional `waypoints` (up to 10 route points, which become one step), and an optional follow-up `plan`. It marks the request fulfilled; the companion delivers it on the next sync and the player presses Load. `put_plan` tasks may carry `waypoints`, a route of up to 10 `{ mapID, x, y, label? }` points, described in `docs/plan-format.md`. `put_plan` accepts `requestId` and marks that request fulfilled. `fail_request` stores a reason the addon shows after `/reload`, for any request type. `get_player_profile` returns the latest player profile the companion uploaded (`character`/`realm` optional; without them the most recently updated one, plus the list of known characters): context, bags, last-seen bank and warband bank, currencies, collections, renown, recent sessions, and recent steps. `resolve_criteria` maps an achievement id plus a criteria-tree id to `criteriaID` and a 1-based `criteriaIndex`, using cached wago.tools CriteriaTree and Achievement CSVs in `/data/wago`. `criteriaID` is `CriteriaTree.CriteriaID`, the Criteria table id the addon wants. The first call downloads those files.

## Planner HTTP

`Authorization: Bearer <UNBORED_PLANNER_TOKEN>`.

`PUT /v1/plan` with the JSON object from `docs/plan-format.md` (`v`, `kind: "plan"`, `tasks`). Response:

```json
{
  "id": 1,
  "createdAt": 1761720000,
  "plan": "UNB1:...",
  "stored": {}
}
```

`plan` is the string the companion receives. `x` and `y` are fractions from 0 to 1.

`GET /v1/progress` is the newest post plus the newest post per character. `GET /v1/progress/history?limit=50` is the log. `GET /v1/sessions?limit=20` is earlier plans, newest first, each with its `UNB1:` string.

## MCP

Streamable HTTP at `/mcp`. Same planner bearer token (`Authorization` header). Tools:

- `put_plan` stores a plan and returns the `UNB1:` string. The tool description includes the task schema. With `requestId` it fulfils a plan request.
- `list_requests` lists requests from the game, with their `type`.
- `answer_request` answers a plan, question, or item request with a message, optional waypoints, and an optional plan.
- `fail_request` marks a request failed with a reason.
- `get_current_plan` reads the plan the companion will poll.
- `get_progress` reads the newest companion post.
- `list_sessions` lists stored plans.

Point an MCP client at `https://unbored.example/mcp` and send the planner token as a bearer header.

## Dokploy

1. Create an application from this GitHub repo.
2. Build type: Dockerfile. Build path / docker context: `server`. Dockerfile: `Dockerfile` (inside that path).
3. Set `UNBORED_COMPANION_TOKEN` and `UNBORED_PLANNER_TOKEN`. Set `PORT` to `3000` if Dokploy does not inject it.
4. Mount a volume at `/data` so the SQLite file survives a redeploy.
5. Expose port `3000`. Health check path: `/health`.
6. Put the public HTTPS URL in the companion, with the companion token.

The image is Node 22. It uses the built-in `node:sqlite` module (`--experimental-sqlite`). No extra database process.

## Tests

From `server/`, with `lua5.1` on `PATH` (the addon decoder):

```
npm test
```

That covers auth, a plan put that the companion GET returns as `UNB1:`, decoding that string with the addon import code, a progress post, MCP `tools/list`, and typed item and question requests answered with `answer_request`.
