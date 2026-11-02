# 0058. Plan runner

Status: accepted

The Server owns the queue of in-game Requests. A Plan runner is an outside program that holds the runner token, claims one Request at a time with a lease (`SELECT ... FOR UPDATE SKIP LOCKED`), keeps it alive with heartbeats, and answers it through the same MCP tools the Planner uses today, with a lease token that only reaches that Request and its Account. A lease that expires or ends without an answer is retried with backoff, up to 3 attempts; after that the Request goes to the webhook when one is set, or fails with a friendly reason the player sees. The planner prompt is versioned in this repo and handed out with each claim. Which program runs as the Plan runner, and on what, is deploy config outside the repo; the code names no vendor and no model. The webhook stays, selected by `UNBORED_PLANNER_ROUTE`, until the runner has proven itself. This amends [0032](0032-plan-only-requests.md) and [0033](0033-request-flow-state-machine.md) only in who fulfils a Request; the game and the Companion see no change.

## Why

- Today a new Request is POSTed to a webhook (`webhook.ts`), and an external agent picks it up and uses `/mcp` with the planner token. The Server cannot tell whether anyone is working on a Request, cannot retry a run that died halfway, and the planner token can read and change every Account (devices, Forget, errors).
- A pull model keeps the Server independent of whoever does the work: any program that speaks this small API can be the runner, and swapping one is a deploy change, not a code change.

## Shape

- Route, `UNBORED_PLANNER_ROUTE`:
  - `webhook` (default, today's behaviour). Nothing below runs.
  - `runner`: every new Request gets a runner job. When `UNBORED_PLANNER_WEBHOOK_URL` is set it is the fallback: a job nobody claimed within `UNBORED_RUNNER_FALLBACK_SECONDS` (default 90), or one that used all its attempts, is handed to the webhook once and the runner never sees it again. Without a webhook, a job out of attempts fails the Request with Reason code `planner_failed`.
- Runner token `UNBORED_RUNNER_TOKEN`, at least 32 characters, different from the companion and planner tokens. It only reaches `/v1/runner/*`. Unset: the runner API answers 404 and `runner` route refuses to start.
- Job table `runner_jobs` (one row per Request): `state` `queued | leased | done | handed_off | failed`, `attempts`, `available_at`, `lease_id`, `lease_token_hash` (sha256), `leased_until`, `attempt_started_at`, `prompt_version`, `last_error`, `queued_at`, `claimed_at`, `finished_at`. Created in the same transaction as the Request. Forget my data and Account migration treat it like `requests`.
- `POST /v1/runner/claim` (runner token, optional `?wait=` up to 25 s long poll). Picks the oldest due job whose Request is still pending: `queued` with `available_at <= now`, or `leased` with `leased_until < now` (a lease that died). Returns 204 when nothing is due, or `{ leaseId, leaseToken, expiresAt, attempt, request, prompt: { version, text }, mcpPath: "/mcp" }`. `request` is the webhook body. The lease lasts 180 s.
- `POST /v1/runner/leases/:leaseId/heartbeat` pushes `leased_until` to now + 180 s. 409 when the lease is no longer this one, the Request is answered, or the attempt has run 15 minutes (hard cap).
- `POST /v1/runner/leases/:leaseId/finish` `{ ok, error? }` ends the attempt. If a tool already answered or failed the Request, the job is `done`. Otherwise the attempt counts as failed (`no answer`), and the job goes back to `queued` after 15 s, then 60 s, or to the fallback after the 3rd attempt.
- Lease token: 32 random bytes, stored only as a hash, valid while its lease is live. As the bearer for `/mcp` it opens a scoped MCP server: the read tools are forced to the Request's Account (a different `account`, or a character of another Account, is an error), `get_request` returns only the leased Request, and `put_plan`, `answer_request`, `fail_request` and `put_item_advice` only accept that Request. Owner tools (devices, Forget, `list_requests`, `list_errors`, `list_failed_uploads`, sessions across Accounts) are not there. A successful answer marks the job `done` and ends the lease.
- Plans from the runner go through the same validation as `put_plan` today. Warnings come back in the tool reply, so the runner can fix and send again within its lease.
- Prompt: `packages/contracts/planner/prompt.md`, plain words, no vendor or model names. `version` is the first 12 hex characters of its sha256, stored on the job so plan quality can be compared per prompt.
- Logs, one line each, no tokens or bodies: `runner req=<id> type=<type> attempt=<n> claimed wait=<s>s`, `runner req=<id> attempt=<n> done ms=<ms>`, `runner req=<id> attempt=<n> failed <reason>, retry in <s>s`, `runner req=<id> handed to webhook (<why>)`. `list_requests` shows `runner: { state, attempts, lastError, claimedAt, finishedAt }` next to `webhook`. `/health` adds `planner: "webhook" | "runner"`.
- Request expiry (1 hour, D69) is unchanged and also ends any live job.

## Not now

- Several runners with different skills or per-Account routing. Claim can take a filter later.
- A runner inside the Server process. The API is the same, so it can come later without changing the game.
