# 0063. Each Section is fresh or stale on its own

Status: accepted

The Server decides whether an uploaded Section is newer than the stored one by that Section's own `at` (when the addon wrote it), not by the Snapshot's `savedAt`, and the upload result says per Section what happened. Today one `savedAt` gates every Section in the Snapshot, so an Account Section read freshly on one Character can be dropped as stale because another Character's later file already set a newer time on the Account. This amends [0029](0029-snapshot-upload-and-history.md) and [0057](0057-postgres-storage-and-async-ingest.md).

## Why

- `ingestSnapshot` passes `snapshot.savedAt` to every `putSection`, Character and Account scope alike, and `putSection` returns `stale` when that time is older than the stored one. The Companion sends the Character file's save time as `savedAt` (`build_upload` in `snapshot.rs`, `TODO(audit)`), so Account Sections are judged by the time a Character file was written. Uploads from two Characters or two PCs interleave, and the Account side keeps whichever Character file was saved last, not whichever data was read last.
- The result has one `stale: boolean` for the whole Snapshot, so nobody can tell which Section was dropped.

## Shape

- Freshness key per Section: its `at` when present, an integer, and not more than 5 minutes ahead of the Server clock (later values are clamped to now + 5 minutes); else the Snapshot `savedAt`; else none (accept, today's rule for a null `savedAt`). The addon's `S.Write` already sets `at` on every write, so 0.11 addons need no change.
- The key is stored in `sections_latest.saved_at` and `section_history.saved_at` (meaning: the Section's freshness time); no new column. One migration sets `sections_latest.saved_at = at` where `at` is not null, so the first upload after deploy compares like with like.
- Comparison as today, with the key in place of `savedAt`: older key is `stale`; same hash and `v` is `unchanged` (and advances the stored key when newer); otherwise `stored`.
- The Character row keeps using the Snapshot `savedAt` (it decides which Account and Device a Character belongs to, a property of the file).
- Result: keep `stored`, `unchanged`, `unknown` and `stale` (true if any Section is stale) for 0.11 Companions, and add `sections: { "<scope>:<name>": "stored" | "unchanged" | "stale" }`. With async ingest the same map is in the `result` of `GET /v1/uploads/<id>`. Stale Sections log one line with the scope, name and Account id prefix, no bodies.
- Companion: no change needed. It does not read `stale`; it treats any accepted upload as sent, and a stale Section is correctly not retried.

## Considered options

- Separate `savedAt` for the Account file and the Character file sent by the Companion: still one time per file, and only helps after a Companion update. `at` is already in the contract and in every 0.11 upload.
- Always accept Account Sections: lets an old Character file overwrite fresher Account data, the thing the check exists for.

## Consequences

- Tests (SQLite and Postgres, sync and async ingest): two Characters interleaving Account Section uploads keep the newest `at`; a Section without `at` falls back to `savedAt`; a far-future `at` is clamped; the migration; the per-Section result; the Character row still follows `savedAt`. Schema, fixture and docs/contract updates in `packages/contracts`.
