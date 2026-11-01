# 0057. Postgres storage and async ingest

Status: proposed

The Server moves from one SQLite file (`node:sqlite`, WAL) to PostgreSQL 18 on hk, run by Dokploy with its own volume and automatic backups, so it can hold lasting player knowledge for thousands of players. Sections are stored as queryable JSONB, history tables are partitioned by month and dropped after 13 months, and `POST /v1/snapshot` only checks the upload, writes the raw gzip chunk to an inbox table and answers 202. A worker inside the Server claims inbox rows with `SELECT ... FOR UPDATE SKIP LOCKED` (no pg-boss), hot Sections first, and does today's `ingestSnapshot` work there. Ingest is idempotent by content hash, raw chunks are deleted 7 days after they are processed, and the SQLite file stays on the volume as the rollback snapshot. This amends [0029](0029-snapshot-upload-and-history.md).

## Why

- One SQLite file serves every request, the planner MCP tools, the Suggestion timers and the webhook from one process. Writes are serialized, and a snapshot is parsed, diffed and stored in a single synchronous transaction on the request path (`Store.putSnapshot` -> `DataStore.ingestSnapshot` -> `putSection`, then `detectWins`, `addHistory`, `suggestions.schedule`).
- Upload sizes today: Brozin's whole Account is about 83 KB inflated, under 1 MB with 10 alts. The Companion uploads only changed Sections, usually a few KB. The caps are 4 MB gzip and 32 MB inflated (`SNAPSHOT_MAX_*`). With 0.11 public testers (Free+), uploads become many and concurrent. A full first upload (up to ~1 MB) must not hold a write lock while it is diffed.
- `section_history` and `history` grow forever and have no retention.

## What moves

Today's tables, by owner module:

| Module | Tables |
|---|---|
| `data.ts` | `accounts`, `characters`, `sections_latest`, `section_history`, `data_meta`, `addon_errors` |
| `store.ts` | `plans`, `progress`, `requests`, `devices`, `history`, `advice`, `webhook_deliveries`, legacy `profiles`, `profile_snapshots` |
| `suggestions.ts` | `chain_progress`, `suggestions` |
| `blizzard.ts` | `game_ids`, `creature_names` |

- All of them move in one cutover. Two databases at once would mean two sources of truth for Forget.
- `body_json TEXT` becomes `body jsonb`. `*_json` columns become `jsonb`. Ids, hashes and names stay `text`.
- Times stay `bigint` epoch seconds, as the code uses them now. That keeps the diff small, and monthly range partitions work on bigint.
- `section_history` and `history` become `PARTITION BY RANGE (at)` with one partition per UTC month. Their primary key becomes `(id, at)`.
- `sections_latest` gets a GIN index (`jsonb_path_ops`) on `body`, only for the Sections we query inside (e.g. `collections`, `reputation`). Other indexes copy today's.
- Legacy `profiles` and `profile_snapshots` are already backfilled (D57). They are not moved. They stay only in the SQLite snapshot.
- New: `raw_uploads` (the inbox, below) and `schema_migrations`.

## Ingest

Request path for `POST /v1/snapshot`:

1. Auth, `Content-Length` and stream caps, gunzip with `maxOutputLength`, `JSON.parse`, and `cleanSnapshot`. All of these are pure CPU work with no database. The 400 and 413 contract stays as it is, because the Companion marks Sections as sent on any 2xx (`gui.rs` `sent_sections`), so an upload the worker would reject later must be rejected now.
2. `bindAccount` and the device recheck (#42) run in one short transaction with the insert, holding `SELECT ... FROM devices ... FOR SHARE`. Forget or a revoke then cannot slip between the check and the write.
3. `INSERT INTO raw_uploads (account_id, device_id, character_id, hash, priority, body_gz, bytes, received_at) ... ON CONFLICT (account_id, hash) DO NOTHING`.
   - `hash` is sha256 of the inflated bytes. A repeated upload is a no-op that returns the existing row id.
   - `body_gz bytea` keeps the bytes the Companion sent. That is smaller than JSONB, and the worker can replay it.
4. Answer `202 {"ok": true, "upload": "<id>", "state": "queued"}`. The old 200 fields (`stored`, `unchanged`, `stale`) move to the status endpoint below.

Worker, in the Server process:

- A loop wakes on `LISTEN raw_uploads` (the insert sends `NOTIFY`) and also polls every 5 s.
- It claims a row with `SELECT ... WHERE state = 'queued' ORDER BY priority DESC, received_at LIMIT 1 FOR UPDATE SKIP LOCKED`.
- In the same transaction it runs today's `ingestSnapshot`, wins, history and Suggestion scheduling, then sets `state = 'done'` with a result row of `stored`, `unchanged`, `stale` and `unknown`.
- Ordering:
  - Uploads of one Account are applied in `received_at` order. The claim skips an Account that has an older row still in flight, using `pg_try_advisory_xact_lock(hashtext(account_id))`.
  - `saved_at` watermarks (D190, #36) still reject stale bodies.
- Failures:
  - On an error the attempt count goes up and the row is retried with backoff.
  - After 5 attempts it becomes `state = 'failed'` and appears in an owner MCP tool, next to `list_errors`.
- `priority = 1` when the upload carries `questLog` or `bags`, the Sections a plan needs first. Otherwise it is 0.
- One worker with concurrency 2 is enough for now. Because of SKIP LOCKED, it can later run as its own process (`node src/worker.ts`) with no schema change.

How clients learn processing finished:

- `GET /v1/uploads/:id` returns `queued | done | failed` and, when `done`, the result. The device auth is the same as for the upload.
- Requests do not lag:
  - `POST /v1/requests` and the planner's data tools (`get_game_data`, `get_ready_now`, `get_suggestions`, `get_account_overview`, `check_ids`) first wait until that Account has no `queued` rows, for at most 10 s, then read.
  - The Ready digest and Suggestions are rebuilt by the worker as today, about 30 s after the last processed upload.
  - The player sees at most a few seconds of delay, and only right after a save.
- The Companion needs no change to keep working, because it already treats any 2xx as success. A later Companion may poll the status endpoint before it starts a Request, but this is not required.

Retention:

- `raw_uploads` rows in `done` are deleted 7 days after they are processed, and rows in `failed` after 30 days.
  - Seven days covers a weekend plus time to replay a bad worker release.
  - It also bounds the inbox: about 20 saves a day × ~5 KB gzip × 1000 players is ~100 MB/day, so ~0.7 GB.
- `section_history` and `history` keep 13 months, so a yearly holiday can be compared with last year. A daily job creates next month's partition and drops partitions older than that with `DETACH ... CONCURRENTLY` + `DROP`, which means no row-by-row deletes.
- Plans, progress, requests, wins and advice keep their current rules.
- Forget (0043) deletes the Account's `raw_uploads` too, and the worker drops any claimed row whose device was revoked.

## Code

- Driver: `postgres` (postgres.js). It has no dependencies, uses tagged-template parameters (no string SQL), and has a built-in pool and `LISTEN`.
  - Pool `max` is 10, set by `DATABASE_POOL_MAX`, with a 5 s statement timeout on the request path.
  - No PgBouncer while there is one Server process.
- Migrations: plain numbered SQL files in `apps/server/migrations/` and a runner of about 60 lines.
  - The runner takes `pg_advisory_lock`, applies the missing files in a transaction, and records them in `schema_migrations`.
  - It runs at startup before `listen`, and replaces the `CREATE TABLE IF NOT EXISTS` and `addColumns` code in constructors.
- The change sits in the storage modules: `data.ts`, `store.ts`, `suggestions.ts` and `blizzard.ts`.
  - `node:sqlite` is synchronous and Postgres is not, so their methods become `async`, and callers in `app.ts`, `mcp.ts`, `plan.ts`, `ready.ts` and `webhook.ts` gain `await`. Logic and SQL meaning stay the same.
  - `json_extract` becomes `->>`, `MAX(a, b)` in upserts becomes `GREATEST(a, b)`, and `sqlite_master`/`PRAGMA` checks go away.
  - In-memory caches (`holdingsCache`, Suggestion timers) stay per process.
- Config:
  - `DATABASE_URL` (required once the cutover ships) and `DATABASE_POOL_MAX`.
  - `UNBORED_DATA_DIR` stays for the catalog cache and the SQLite snapshot.
  - The secret goes into the Dokploy env of the Server, and the database is reachable only on the Dokploy network.
- Transfer: `apps/server/scripts/sqlite-to-postgres.ts` is run once.
  - It reads the SQLite file read-only and copies every table in primary-key order in batches, parsing `*_json` into `jsonb`.
  - It routes `section_history` and `history` rows into their month partitions.
  - At the end it compares row counts and per-table checksums (sha256 of ordered keys and hashes). It exits non-zero on any mismatch.
- Tests:
  - CI adds a `postgres:18` service container to `server.yml`.
  - Each test file gets its own database, made from a template that has the migrations applied, so tests stay parallel and isolated.
  - Locally, `docker compose` in `apps/server` runs the same image.
  - Extra tests cover the transfer script on a fixture SQLite file, the inbox (same hash twice, the order within one Account, a failed row, Forget during queued) and the partition job.

## Cutover and rollback

1. Ship the Postgres code behind `DATABASE_URL`. While it is unset, the Server keeps using SQLite, so main can deploy before the move.
2. Create the Postgres service in Dokploy on hk, with a volume and daily backups. Run a test restore once.
3. Maintenance window: stop the Server, run the transfer script, set `DATABASE_URL`, and start. Companion uploads that fail meanwhile are retried on the next save, because unsent Sections stay unsent.
4. Rollback: unset `DATABASE_URL` and restart. The untouched `unbored.sqlite` serves again. Data written after the cutover is lost on rollback, which is acceptable in the first days. Keep the file for 30 days after a stable cutover, then delete it.
5. Remove the SQLite code path in the next release after that.

## Rollout (becomes tickets)

1. Migrations runner, the `0001` schema as a copy of today's tables plus partitions, the `postgres` driver, `DATABASE_URL` config, and the CI service container.
2. Port `blizzard.ts` and `suggestions.ts` to async Postgres, with SQLite still selectable.
3. Port `data.ts` and `store.ts`, along with the `await` ripple through the routes, MCP and planner.
4. `raw_uploads`, 202 ingest, the worker, `GET /v1/uploads/:id`, the read barrier for Requests and MCP, and the owner tool for failed uploads.
5. Retention jobs: the partition roll and drop, and the inbox cleanup.
6. Transfer script with verification, a dry run on a copy of the hk file, then the cutover with rollback.
7. Docs: `docs/companion-api.md` (202 and the status endpoint), `DEVELOPMENT.md` (local Postgres), and PRIVACY.md (retention periods).

## Not now

- Normalized tables (`collection_items`, `reputations`, `currencies`, `quests_done`). JSONB with GIN covers today's reads. The worker is where they get filled later, without touching the request path.
- Aggregate analytics across players. The Free tier still uses the Server for non-LLM work (Ready now, Suggestions, wins), and a separate job on read replicas or rollups can come later.
- S3 or MinIO for raw chunks. At about 0.7 GB, Postgres `bytea` is fine.

## Rejected

- **Stay on SQLite + WAL.** It is simple and fast for one process, but it allows one writer, offers no concurrent worker process, and has no partitioning or online backups beyond copying the file. It does not fit thousands of Accounts uploading at once.
- **Turso / libSQL.** It is SQLite-compatible, so the port would be smaller, but it is a new hosted dependency or a less proven self-hosted server, and it still lacks JSONB indexing, partitions and SKIP LOCKED queues.
- **MongoDB.** It fits documents, but it would mean a different query model for the relational parts (devices, requests, plans, Forget across tables), weaker multi-table transactions, and a heavier driver.
- **pg-boss.** It brings its own schema, cron and maintenance tables. A single queue that is already one table (`raw_uploads`) needs only SKIP LOCKED and an advisory lock.
- **drizzle / kysely.** They would rewrite every hand-written query into a builder. Plain SQL migrations keep the diff to async and dialect.
- **pg-mem / testcontainers.** pg-mem misses partitions, SKIP LOCKED and some jsonb operators. testcontainers needs Docker from inside `vp test` and is slower than a CI service container.
