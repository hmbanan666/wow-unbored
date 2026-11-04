# Unbored server

A single container that holds one player's session plan and the progress the companion posts back. The planner (a Plan runner, or a client with the planner token) writes the plan. Unbored Companion polls it and writes `Unbored_Plan` into the game. After `/reload`, the companion posts progress here and the planner reads it.

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
| `UNBORED_PLANNER_ROUTE` | no | `webhook` (default) or `runner`. |
| `UNBORED_RUNNER_TOKEN` | with runner route | At least 32 characters; different from the companion and planner tokens. |
| `UNBORED_RUNNER_FALLBACK_SECONDS` | no | Unclaimed-job fallback interval, default 90 seconds. |
| `UNBORED_PLANNER_WEBHOOK_URL` | no | New Request destination in webhook route; fallback destination in runner route. Empty skips the webhook. |
| `UNBORED_PLANNER_WEBHOOK_KEY` | no | Secret sent as `Authorization: Bearer <key>`. |
| `UNBORED_PLANNER_WEBHOOK_KEY_HEADER` | no | Extra header name that also receives the key. |
| `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET` | no | Blizzard Game Data API client. When both are set, `put_plan` and `answer_request` check that linked item, quest, achievement, spell and npc ids exist ([markup](../../packages/contracts/markup.md)); results are cached in SQLite. Unset: structure checks only. Never logged. |
| `BLIZZARD_REGION` | no | `us` (default), `eu`, `kr` or `tw`. |

`GET /health` needs no token and returns `{"ok":true,"planner":"webhook","webhook":"on"}`, or `"off"` when `UNBORED_PLANNER_WEBHOOK_URL` is empty. Every other route rejects a missing or wrong bearer token.

### Planner webhook

Every new pending request (plan, question, item) is POSTed to `UNBORED_PLANNER_WEBHOOK_URL` once, with a 10 second timeout. A failure is retried after 30 s, 1, 2, 5, 10, 15, 30 and 60 min while the request is still pending and less than a day old; a request left pending by a restart is sent by the same loop. Each attempt is stored and logged as one line without the URL path or the key:

```
webhook on: planner.example with key
webhook req=req-1 type=question attempt=1 failed ECONNREFUSED ms=3, retry in 30s
webhook req=req-1 type=question attempt=2 ok status=200 ms=180
webhook req=req-2 type=item skipped: UNBORED_PLANNER_WEBHOOK_URL is not set
```

`list_requests` shows the same state per request as `webhook` (`attempts`, `deliveredAt`, `lastError`; `null` when it was never tried).

## Companion

Companion 0.1.1 uses `https://unbored.kosarev.space` unless an advanced override is set. It registers itself with `POST /v1/devices/register` and shows **Waiting for approval** until `approve_device` runs. After that it sends the device secret as the bearer on `GET /v1/plan` and `POST /v1/progress`. It also installs the latest `Unbored-v*.zip` into the detected `_retail_` folder.

`UNBORED_COMPANION_TOKEN` still authenticates those two calls for an older companion build.

`GET /v1/plan` returns `{ id, createdAt, plan }`. Until a plan exists it is `404`. The companion leaves the previous plan file alone.

MCP tools `list_devices`, `approve_device`, and `revoke_device` use the planner token. Approving a device does not let it write plans.

`list_requests` lists pending requests (pass `status` for fulfilled or failed). Each request has a `type`: `plan` (mode, optional wish, and `budget` only when the player typed minutes into the custom form, else `null`; `topic` names the preset chip: `nearby` stay in this zone, `mount` get a mount, `collect` pets/toys/transmog/achievements in this zone, `grind` level/renown/reputation, `gold` gold or crafting mats, `surprise` anything fun; no `topic` means the wish is the player's own words), `question` (free text; `topic: "nearby"` means "what to do around me"), or `item` (`item.itemID`, the link, name, bag slot, and count). Each carries the player `context` from the game (map, position, level, class, item level, gold, hearth, tracked quests, active plan); answer from there. Plan the whole goal: every criterion of an achievement, every piece of a set, in ordered steps (up to 40), never cut to fit a time; `estMinutes` is information only ([ADR 0037](../../docs/adr/0037-no-time-budget.md)). `answer_request` answers any request: `requestId`, `message` (plain text up to 1,000 bytes, shown as written in the mascot bubble), optional `waypoints` (up to 10 route points, which become one step), and an optional follow-up `plan`. It marks the request fulfilled; the companion delivers it on the next sync and the player presses Load. `put_plan` tasks may carry `waypoints`, a route of up to 10 `{ mapID, x, y, label? }` points, described in `docs/plan-format.md`. `put_plan` accepts `requestId` and marks that request fulfilled. `fail_request` stores a reason the addon shows after `/reload`, for any request type. `get_player_profile` returns the latest player profile the companion uploaded (`character`/`realm` optional; without them the most recently updated one, plus the list of known characters): context, bags, last-seen bank and warband bank, currencies, collections, renown, recent sessions, and recent steps. `resolve_criteria` maps an achievement id plus a criteria-tree id to `criteriaID` and a 1-based `criteriaIndex`, using cached wago.tools CriteriaTree and Achievement CSVs in `/data/wago`. `criteriaID` is `CriteriaTree.CriteriaID`, the Criteria table id the addon wants. The first call downloads those files.

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

Streamable HTTP at `/mcp`. The planner bearer token (`Authorization` header) has the full tool set below. A live lease token has the scoped set described under Plan runner. Tools:

- `put_plan` requires one valid, near-guaranteed `outcome`, rejects already-held targets from the Request snapshot, and returns nonblocking notes when evidence is absent. A rejection leaves the lease open for a corrected submission. It stores a plan and returns the `UNB1:` string. The tool description includes the task schema. With `requestId` it fulfils a plan request.
- `list_requests` lists requests from the game, with their `type`.
- `answer_request` answers a plan, question, or item request with a message, optional waypoints, and an optional plan.
- `fail_request` marks a request failed with a reason.
- `get_current_plan` reads the plan the companion will poll.
- `get_progress` reads the newest companion post.
- `list_sessions` lists stored plans.

Point an MCP client at `https://unbored.example/mcp` and send the planner token as a bearer header.

## Dokploy

1. Create an application from this GitHub repo.
2. Build type: Dockerfile. Docker build context: the repository root (`.`). Dockerfile path: `apps/server/Dockerfile`.
3. Set `UNBORED_COMPANION_TOKEN` and `UNBORED_PLANNER_TOKEN`. Set `PORT` to `3000` if Dokploy does not inject it.
4. Mount a volume at `/data` so the SQLite file survives a redeploy.
5. Expose port `3000`. Health check path: `/health`.
6. Put the public HTTPS URL in the Companion, with the companion token.
7. If the app watches paths, watch `apps/server/**`, `packages/contracts/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `package.json`.

Moving from the SQLite file to PostgreSQL (`DATABASE_URL`, ADR 0057) is a one-off step with the transfer script in this image: see "Postgres cutover" in [`docs/DEVELOPMENT.md`](../../docs/DEVELOPMENT.md#postgres-cutover).

The image is Node 26. Node 26 does not ship corepack, so the image installs corepack and then pnpm. It uses the built-in `node:sqlite` module (`--experimental-sqlite`). No extra database process. The context is the repository root because the image installs from the pnpm workspace. The container starts as root only long enough to `chown` `/data` (a Dokploy volume is often root-owned) and then drops to the `node` user. The image `HEALTHCHECK` fetches `/health` with `node`, because the slim image has no curl.

## Tests

From the repository root, with `lua5.1` on `PATH` (the addon decoder):

```
pnpm install
pnpm exec vp test
```

That covers auth, a plan put that the companion GET returns as `UNB1:`, decoding that string with the addon import code, a progress post, MCP `tools/list`, and typed item and question requests answered with `answer_request`.

## Plan runner

Select `UNBORED_PLANNER_ROUTE=runner` to queue each new Request in `runner_jobs`, in the same transaction. The default is `webhook`. Set `UNBORED_RUNNER_TOKEN` to at least 32 characters, different from the companion and planner tokens; the runner route refuses to start without it. `UNBORED_RUNNER_FALLBACK_SECONDS` is a non-negative whole number, default 90. The prompt comes from `packages/contracts/planner/prompt.md`, already copied by the Dockerfile; its first 12 sha256 hex characters identify the version on each claim.

All three runner endpoints use `Authorization: Bearer <runner token>`. This token cannot use MCP or Companion routes. Runner endpoints return 404 when the route is `webhook` or no runner token is configured, and 401 for an incorrect token.

```http
POST /v1/runner/claim?wait=25
Authorization: Bearer <runner token>
```

`wait` is optional, from 0 to 25 seconds (default 0). A new Request in this process wakes the poll; other processes' changes are checked every second. The oldest due pending Request returns 200:

```json
{
  "leaseId": "9c154aab-5675-4ac6-b5bd-1738df51e900",
  "leaseToken": "<lease token>",
  "expiresAt": 1800000180,
  "attempt": 1,
  "request": {
    "requestId": "req-1", "type": "plan", "question": null, "topic": "surprise",
    "item": null, "character": "Mira", "realm": "Realm", "mode": "fun",
    "budget": null, "wish": null, "context": null, "lang": "en", "account": "account-key"
  },
  "prompt": { "version": "<12 hex characters>", "text": "<planner prompt>" },
  "mcpPath": "/mcp"
}
```

The Request has the same shape as the webhook body. No due Request returns 204 with no body. An invalid `wait` returns 400. The lease lasts 180 seconds; only a sha256 hash of its 32 random bytes is stored. A reclaimed dead lease counts as a new attempt.

```http
POST /v1/runner/leases/9c154aab-5675-4ac6-b5bd-1738df51e900/heartbeat
Authorization: Bearer <runner token>
```

A heartbeat returns `200 {"expiresAt":1800000280}` and extends the lease to now + 180 seconds, capped at 15 minutes from the attempt's start. A lost lease, answered Request or attempt at its hard cap returns 409.

```http
POST /v1/runner/leases/9c154aab-5675-4ac6-b5bd-1738df51e900/finish
Authorization: Bearer <runner token>
Content-Type: application/json

{"ok":false,"error":"The runner could not finish."}
```

Finish returns `200 {"ok":true}`, or 409 for a lost lease. Malformed JSON or a missing boolean `ok` returns 400. `error` is optional and cut to 200 characters. Finishing without an answer, even with `ok:true`, requeues after 15 seconds, then 60 seconds. There are at most three attempts. Finishing after a successful tool answer confirms completion.

Use the **lease token** as the bearer for `/mcp`. `get_request` returns the leased Request and context. Read tools default to its Account and refuse another Account or a Character outside it. `get_current_plan` only returns a Plan linked to that Account. `put_plan` requires the leased `requestId`; `answer_request` and `fail_request` also only accept that id. `put_item_advice` is limited to that Request's Character. Owner tools are absent. Plans pass the existing validation; warnings return without committing the answer so the runner can correct it. A successful answer ends the lease; subsequent MCP calls with it return 401. The planner token retains its full tool set.

With `UNBORED_PLANNER_WEBHOOK_URL`, a job never claimed within the fallback interval, or one out of attempts, becomes `handed_off`. Only those Requests enter the existing webhook delivery/retry flow. Without that URL, exhausted jobs fail with `planner_failed` and a friendly reason in the Request's language. Maintenance runs every 30 seconds and before claims. Request expiry after one hour also ends live jobs. Forget erases jobs; Account migration preserves their Request links.

`list_requests` adds `runner: { state, attempts, lastError, claimedAt, finishedAt }`, or `null` when no job exists. `/health` includes `planner: "webhook" | "runner"` and retains `webhook: "on" | "off"`. Runner logs use these forms, without tokens or bodies:

```text
runner req=req-1 type=plan attempt=1 claimed wait=2s
runner req=req-1 attempt=1 done ms=12000
runner req=req-2 attempt=1 failed no answer, retry in 15s
runner req=req-2 attempt=2 failed lease expired, retry in 0s
runner req=req-2 handed to webhook (attempts exhausted)
runner req=req-3 handed to webhook (unclaimed)
runner req=req-4 attempt=3 failed attempts exhausted, retry in 0s
```

A `retry in 0s` on lease expiry describes immediate reclaim; on exhausted attempts without a webhook it records the terminal failure. Runner-supplied error text stays in storage, never in logs.

### Game DB

The owner can import the current live build's Achievement names in enUS and
ruRU with `POST /owner/game/import`; MCP `get_game_entity` reads them by kind
and id with their build. See the [import command and operations notes](../../docs/DEVELOPMENT.md#game-db-achievement-imports).
