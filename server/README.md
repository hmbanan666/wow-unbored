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

`GET /health` needs no token. Every other route rejects a missing or wrong bearer token.

## Companion

In the tray app, set the planner URL to the origin only, for example `https://unbored.example`. The app calls `{url}/v1/plan` and `{url}/v1/progress`. Put `UNBORED_COMPANION_TOKEN` in the token box. The released companion does not need a new build.

Until a plan exists, `GET /v1/plan` is `404`. The companion shows that status and leaves the previous plan file alone.

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

- `put_plan` stores a plan and returns the `UNB1:` string. The tool description includes the task schema.
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

That covers auth, a plan put that the companion GET returns as `UNB1:`, decoding that string with the addon import code, a progress post, and MCP `tools/list`.
