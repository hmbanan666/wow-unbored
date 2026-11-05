# Developing Unbored

Everything a contributor needs that a player does not: how the pieces fit, how to test, how releases are cut, and how to add data. Players start at the [README](../README.md).

Read [`CONTEXT.md`](../CONTEXT.md) (the words we use) and [`docs/adr/`](adr/) (the decisions behind them) first; [`AGENTS.md`](../AGENTS.md) says how decisions are made and recorded.

## The pieces

- **The addon** (`addon/`): Bory, the Bubble, Quick plans from the Providers, tooltip Advice, local answers. Lua for the Retail client, no required libraries. It is not a JavaScript package.
- **The Companion** (`apps/companion/`): a Windows tray app (Tauri, Rust, window in `ui/`). It installs and updates the addon, sends Requests and profiles from SavedVariables to the Server, and writes `Interface/AddOns/Unbored_Plan/Plan.lua`, `Advice.lua` and `Suggestions.lua`. See [`apps/companion/README.md`](../apps/companion/README.md).
- **The Server** (`apps/server/`): Node, Hono and SQLite at `https://unbored.kosarev.space`. Devices, Requests, Plans, Player profiles, history, Personal advice, and the MCP tools the Planner uses. Contract: [`companion-api.md`](companion-api.md), plan format: [`plan-format.md`](plan-format.md).
- **The website** (`apps/web/`): Nuxt 4, server-rendered. It reads the same Postgres (`web` and `content` schemas) and calls the Server for anything with business rules. See [Website](#website).
- **Shared types** (`packages/contracts/`): Request, Plan, and Player profile types and JSON Schema. The Server and the Companion window import them. The Rust contract test reads the JSON Schema.

## Requirements

- Retail client **12.1.5** (Interface **120105**) or **12.1.0** (Interface **120100**). The TOC also lists PTR interface **120107**. `/dump select(4, GetBuildInfo())` should print one of them.
- No Classic, Mists, or Forever build.

## Layout

```
addon/            Lua addon (Unbored.toc, Core, Data, Providers, UI, Media, tests)
apps/companion/   Windows tray app (ui/ is the window, src-tauri/ is Rust)
apps/server/      planner backend
apps/web/         player website (Nuxt). Page text is in Postgres, not in this folder
packages/contracts/  shared Request, Plan, and Player profile types
docs/             ADRs, API contract, plan format
art/              builds Media portraits and Companion icons
```

Inside `addon/`:

```
Unbored.toc
Bindings.xml
Core/         session, Requests, Advice, Intents, profile, codec, locale
Data/         contributor tables (Presets, Items, Rares, ...)
Providers/    one file per mode
UI/           Bory (Mascot.lua), the list view, item help, minimap button
Media/        portraits and Icon*.tga (built by art/*.py)
tests/        run.lua (logic), ui.lua (Bory against a fake frame API)
```

Every UI string is in `Core/Locale.lua`, English and Russian. The name is one string, `ns.MASCOT_NAME` in `Core/Namespace.lua`. Saved variables never contain secret values or functions.

## Checks

Companion upload routes authenticate before reading the body and recheck the
Device immediately before synchronous writes. Body reads yield to other requests:
Forget or owner revoke may have finished meanwhile. Account migration must also
stay after the final check; any future await before persistence needs another
authorization check. Streaming-body tests cover snapshot, profile, Request and
progress uploads interrupted by either revocation path.

Helper-file writes are serialized inside `plan.rs`, including the complete
read/modify/replace operation for Plan and Companion status. All helper files
are replaced through a staging file. A missing file may be initialized; other
read errors stop updates that need its contents. Explicit erasure can replace
undecodable personal data. The lock covers writers in one Companion process;
it does not coordinate multiple app processes or make a whole sync atomic.

Companion sync captures settings, Device and a generation under the model lock
(`sync_state.rs`, `SyncSession` in `gui.rs`). Network and SavedVariables reads run
outside that lock. Every personal file write, upload acknowledgement, migration
acknowledgement, pairing/status result and ready notification is applied through
`SyncState::apply`: the generation check and local effects share one critical
section. Forget invalidates the generation before local erasure, even if a disk
operation fails. It also writes revoked Companion status immediately. Forgotten
sync retries pending local cleanup/settings writes before network work, including
while offline; a successful cleanup clears the retry flag. A saved forgotten
marker schedules one cleanup after restart. It no longer compensates for
stale responses writing data back.

Forget, Connect again and settings changes serialize on a separate command lock.
Background sync never holds that lock. The lock order is command lock (when
needed), then model, then Device or helper-file writer. Progress operations
instead serialize on their own lock, acquired before reading SavedVariables or
copying acknowledgements, through POST and guarded apply. Forget never acquires
that lock; old queued progress work checks its generation after acquiring it.
This preserves progress order without holding the model during HTTP. Do not put HTTP calls
inside `apply`, or acquire the model lock from a helper-file write. Successful
Connect again and relevant settings changes also invalidate old results.
Section/profile/progress acknowledgements and notification ids belong to the
model, not process-global caches. Saving an endpoint clears its upload caches;
concurrent migration acknowledgements are merged rather than replacing a list
from an older settings snapshot.

Manual Plan fetch and background Planner work share a Prefetch lock owned by
their generation. Acquire it before reading upload acknowledgements or calling
the Server, and hold it through files, migrations, notifications, final status
and heartbeat. Recheck the generation after waiting. The order is Prefetch,
then progress (when needed), then model; never acquire Prefetch while holding
the model. Forget/settings need no Prefetch lock, and a new generation has an
independent one, so a separately started pass of the new generation does not
wait on the old Prefetch lock. The single background loop still waits for its
in-flight HTTP to return, and the progress lock remains shared across generations.
The manual fetch command is async and runs its blocking body via `spawn_blocking`:
neither HTTP nor waiting for Prefetch may occupy the GUI thread (background tray
updates can need it). Addon update checks run outside the Prefetch lock.
The lock serializes complete passes;
it does not promise FIFO ordering of waiting callers or a Server-wide snapshot.

Generation invalidation discards results; it does not cancel blocking HTTP.
Reconnect recovery after
a lost response/local credential save still needs the protocol work described
in the audit reports. Section freshness is resolved by [ADR 0063](adr/0063-section-freshness.md).

Companion settings live in `settings.rs`. Saving writes `settings.json.tmp` in
the same directory, syncs and closes it, then renames it over `settings.json`.
Readers never load the staging file. A failed write or replacement leaves the
working file untouched; an abandoned staging file is overwritten on the next
save. This assumes one Companion writer, serialized by the model lock after
startup. It is not a multi-process lock or a power-loss durability guarantee
(the parent directory is not synced).

Detect/select WoW, Account and endpoint preferences use `Settings::update`:
save a candidate first, then replace memory and invalidate the sync generation
under the same model lock. Derived views, watchers and upload caches change only
after that succeeds. Command errors use the existing localized `Shown` path.
Forget deliberately keeps its immediate local revocation and retry behavior:
an already completed remote erasure cannot be rolled back on a disk failure.
The JSON format/defaults are unchanged. Malformed/unreadable settings still use
the existing default fallback; recovery and ignored saves in other lifecycle
paths remain audit items. Importing a Plan does not rewrite unchanged settings.

Request submission lives in `apps/companion/src-tauri/src/request.rs`. The GUI
reads SavedVariables and supplies the HTTP adapter; the library selects the
newest saved Request (D82) and acknowledges Account migration only after a
successful response. Only that Request's permanent rejection can supply the
game's failure status. HTTP 408/429 use the existing sync retry path; neither
acknowledges migration nor writes a terminal Request failure. Rejections and
Server statuses use the same `pick_plan_file` path.

Transient failures of earlier Requests are returned as typed, redacted
diagnostics, logged by the sync adapter and retried on its next pass. They do
not abort the awaited Request. Failure of the awaited Request still takes the
existing error path; successful uploads alone acknowledge Account migration.
Submission remains sequential, so network timeouts can still delay a pass.

With nvm installed, select the project's Node 26 before running commands:

```sh
nvm install
nvm use
npm install --global pnpm@12.16.1
pnpm install --frozen-lockfile
```

`.nvmrc` selects Node 26 without changing nvm's default for other projects. pnpm is installed for that Node version. In a new terminal, run `nvm use` from the repository root again.

Non-interactive agent shells may not load nvm from `.zshrc`. With nvm installed through Homebrew, run `source "$(brew --prefix nvm)/nvm.sh"` before `nvm use` in that shell.

On macOS, install `luacheck`, `minisign`, and `git-cliff` with Homebrew. The release-note checks use git-cliff 2.14.2. Lua must be **5.1**, available on `PATH` as **`lua5.1`**; Homebrew's current `lua` is a different version. If Lua 5.1 is unavailable from the package manager, build [Lua 5.1.5](https://www.lua.org/ftp/) with `make macosx`, verify the archive's SHA-256 against the download page, and install it under a separate user prefix. Keep the existing `lua` executable for other projects. Rust needs the `rustfmt` and `clippy` components, and macOS needs Xcode Command Line Tools.

From the repository root, with pnpm, Lua 5.1, luacheck, and Rust:

```
pnpm install
pnpm test
pnpm lint
pnpm build
```

`pnpm test` runs the addon checks (`cd addon && luacheck . && lua5.1 tests/run.lua && lua5.1 tests/ui.lua`), JavaScript tests (`vp test`: Server and `packages/contracts`), and `cargo test --lib --no-default-features` for the Companion. `pnpm lint` is `pnpm typecheck`, `vp check` (Oxfmt and Oxlint), luacheck, `cargo fmt --check`, and clippy. `pnpm typecheck` covers the Server, its tests, `packages/contracts`, and the Companion window. `pnpm dev` starts the Server. `pnpm build` typechecks the Server and builds the Companion window. The Windows installer is built by `.github/workflows/companion.yml` on pull requests that touch the Companion and on every push to `main`. Node is 26.

JavaScript uses Vite+ (`vp`, the `vite-plus` package). Lua stays on luacheck. Rust stays on cargo. See [ADR 0024](adr/0024-vite-plus-toolchain.md).

On Ubuntu the luacheck package is `lua-check`.

The Server runs on SQLite until `DATABASE_URL` is set ([ADR 0057](adr/0057-postgres-storage-and-async-ingest.md)). The PostgreSQL schema is the numbered SQL files in `apps/server/migrations/`; the Server applies the missing ones at startup under an advisory lock and records them in `schema_migrations`. `DATABASE_POOL_MAX` sets the pool size (default 10). With `DATABASE_URL` set, every table is read and written in Postgres and the SQLite file is not opened; without it the Server runs on SQLite as before. Both go through one async layer (`apps/server/src/db.ts`); Forget and the Account migration run in one transaction on either. On Postgres `POST /v1/snapshot` queues the checked upload in `raw_uploads` and answers 202; a worker in the Server (`apps/server/src/inbox.ts`: `FOR UPDATE SKIP LOCKED`, the oldest upload of each Account first, `questLog`/`bags` uploads before others, woken by `LISTEN raw_uploads` and every 5 s, 5 attempts with backoff, then `failed` in the MCP tool `list_failed_uploads`) ingests it. SQLite keeps the inline 200. Tests that compare the backends run once per each (`BACKENDS` in `apps/server/test/postgres-db.ts`), and `UNBORED_TEST_BACKEND=postgres` runs the whole Server suite on Postgres (`apps/server/test/backend.ts`; CI does both). The Postgres tests run when `UNBORED_TEST_DATABASE_URL` points at a server where that user may create databases; each test file gets its own database copied from a migrated template. In CI they run against a `postgres:18` service container in `server.yml`, which sets `UNBORED_REQUIRE_POSTGRES=1` so they cannot silently skip. Without `UNBORED_TEST_DATABASE_URL` the Postgres tests are skipped and everything else runs on SQLite.

### Game DB: core content imports

[ADR 0071](adr/0071-game-db.md) keeps client game facts separate from player
snapshots and the Catalog. Startup migration `0011_game_content.sql` extends
`0007_game.sql` with `game.rows` and `game.imports`; SQLite uses the corresponding
`game_rows` and `game_imports` tables. The existing SQLite-to-Postgres transfer
copies both (24 tables for a current file), and still accepts older files.

The import selects these 23 DB2 tables from wago.tools for one explicit retail
build. The field allowlist is in
[`game-content.ts`](../apps/server/src/game-content.ts); column names follow the
[client definitions](https://github.com/wowdev/WoWDBDefs/tree/master/definitions).

| Content | Source tables |
| --- | --- |
| Quests and quest lines | `QuestV2`, `QuestV2CliTask`, `QuestLine`, `QuestLineXQuest` |
| Factions | `Faction` |
| Item names | `ItemSparse` |
| Mounts, pet species, toys | `Mount`, `BattlePetSpecies`, `Toy` |
| Currencies | `CurrencyTypes` |
| Achievements and criteria | `Achievement`, `CriteriaTree`, `Criteria` |
| Maps and areas | `UiMap`, `UiMapGroupMember`, `UiMapAssignment`, `AreaTable`, `Map` |
| Quest points | `QuestPOIBlob`, `QuestPOIPoint` |
| Flight nodes | `TaxiNodes` |
| Journal instances and encounters | `JournalInstance`, `JournalEncounter` |

`QuestV2` is the quest-id registry; `QuestV2CliTask` supplies titles for only its
subset of quests. `BattlePetSpecies` supplies creature and summon-spell ids,
not a species name. Toy record ids differ from their `ItemID`. Map id zero is
valid. No missing names or relationships are invented. Names and selected
localized text are stored in enUS and ruRU; tables without localized fields
are downloaded once. Locale id sets must match exactly, regardless of order.
Numeric fields preserve scientific notation as numbers and wide integer
quantities as exact strings. Extra columns are discarded.

`game.rows` has a primary index on `(build, table_name, locale, id)` and selected
fields in `body` (jsonb; `body_json` text on SQLite). `GameDb.row(table, id,
locale)` reads one record from the current build and returns `{build, fields}`,
or `undefined`; it never downloads or falls back to an older build. Unlocalized
tables use the same record for both locales. The existing MCP `get_game_entity`
continues to return Achievement names through `game.achievements`.

The owner triggers all tables with `POST /owner/game/import`, JSON
`{"build":"<current-live-build>"}`, using the existing owner/planner bearer.
From the repo root, with `UNBORED_SERVER_URL` and `UNBORED_PLANNER_TOKEN` already
set in the operator's environment, run:

```sh
node apps/server/scripts/import-game.ts <current-live-build>
```

Get the current four-part retail build from the installed client or
[wago.tools](https://wago.tools/db2/Achievement). The command invokes the running
Server, needs no database access, and keeps credentials outside arguments and
output. On production, run it after the Server containing the migration has
been deployed. It returns `{build, status: "imported" | "unchanged",
achievements, tables}`, where `tables` contains one count per source table
(not double-counting locales). The command waits up to 16 minutes and exits 0
on success, 1 on request failure, 2 on invalid arguments or missing settings.
401 means the bearer was refused, 400 means the build was malformed, and 502
means the import failed; the previous complete build remains available.

Downloads are sequential and streaming: 120 seconds and 256 MiB per CSV,
256 Ki characters per row, two million records per table/locale, at most 1 GiB
of projected staging data and 15 minutes per import. Parsing yields every
16 KiB, including within quoted cells. Temporary files under the data directory
are removed on success or failure. After an unclean process exit, an operator
may remove abandoned `.game-import-*` directories while the Server is stopped.
Database writes use batches of at most 500 rows or about 1 MiB, then publish
all tables, both locales, counts and Achievement names in one transaction.
Duplicate ids, bad fields, truncated text or locale disagreement roll it back.
Postgres readers retain the previous build during publication. SQLite queries
queue during publication; its synchronous commit/checkpoint runs in an import
thread so it cannot block the request event loop. Imports within one Server
are serialized. A repeated complete build performs no downloads. An existing
Achievement-only build is upgraded on the next watch pass even when its build
number is unchanged.

`game-content.test.ts`, the owner command tests and watcher tests exercise the
public import/read boundaries on both backends with fixture downloads.
`game-content-load.test.ts` streams 300,000 item names in each locale, 750,000
quest points, 100,000 quests and 20,000 Achievements per locale along with the
other tables. It bounds import
time to 90 seconds, 100 indexed lookups to one second, event-loop p99 to 100 ms,
maximum lag to 500 ms and extra RSS to 350 MB. Normal CI does not contact wago.

A local PostgreSQL import of live retail build `12.1.5.70783` on 2026-11-04
completed all 22 tables in 61.4 seconds with 120.7 MB extra RSS, 4.7 ms p99 lag
and 50.2 ms maximum lag. It included 175,791 items, 172,732 quest points,
121,821 criteria-tree records and 14,139 Achievements; `EXPLAIN` confirmed
`rows_pkey` for an item-id lookup. This was a disposable local test database,
not a production import. The larger generated fixture covers growth beyond
those observed counts.

### Site content

Paths and Collections for the website (ADR 0072, 0074) are authored as JSON
documents and sent to the running Server; nothing is written to the database
by hand and no content lives in repo files. `PUT /owner/content` saves a draft
(a new version after a published one, the same draft otherwise; the same
document twice changes nothing), and `POST /owner/content/<kind>/<slug>/publish`
publishes the newest draft and retires the previous published version. Both
use the planner bearer and check every item id, zone, achievement and cost id
against the current Game DB build; English names must match the game's name.
A 400 lists every problem. With `UNBORED_SERVER_URL` and `UNBORED_PLANNER_TOKEN`
set:

```sh
node apps/server/scripts/content.ts save top-mounts.json
node apps/server/scripts/content.ts publish collection top-mounts-to-get-first
```

A document has `kind`, `slug`, `locale` (default `en`, or `ru`), `title`,
`description`, `blocks` (paragraph, list, link) and ordered `items`:
`{kind, id, name, source: {type, text, zone?, cost?: [{amount, gold|currency|item}],
achievement?}, chance, note, url?, required?, topic?}`. The array order is the
position; `required` defaults to true and false leaves a goal outside completion.
Collections accept mount, pet, toy, achievement and item targets and have no tier,
prerequisite or Topics. Paths require a `tier` (`basic`, `deeper`, `complete`);
Deeper and Complete require the preceding tier's published Path slug as
`prerequisite`, in the same locale. Basic has no prerequisite.

Paths may also have `topics: [{slug, title}]`; an item's `topic` must reference
one of those slugs. Path goal kinds additionally include:

| Kind | Target fields |
| --- | --- |
| `rep` | `id` (Faction), `standing` (1–8) |
| `renown` | `id` (Faction), `level` (positive integer) |
| `level` | `level` (positive integer), no `id`; `name` is authored |
| `currency` | `id` (CurrencyTypes), `amount` (positive integer) |
| `quest` | `id` (QuestV2) |
| `questLine` | `id` (QuestLine) |

Names are checked when the imported English fields contain one; all target ids,
including Factions and quest lines, are checked on save and publish. Sources,
zones and costs use the same checks for every kind. `chance: true` goals remain
in the list and can be required, but `contentItemOutcome` never returns them as
Plan outcomes. It maps eligible targets to the existing Plan outcome contract;
quest and questLine goals need a separately chosen supported outcome. Normal
Plan acquisition, ownership and reachability checks still apply.

The owner MCP tools use this same service and are unavailable to runner leases:

- `save_content_draft {document}` creates or replaces the draft; supply the full
  document, using `get_content` before editing.
- `publish_content {kind, slug, locale?}` rechecks the newest draft and publishes it.
- `get_content {kind, slug, locale?, version?}` reads the latest version or a
  specific version, including retired publications. It returns `{document,
  version, status, build}` or null when absent.

Topics, required flags, thresholds and chance flags live inside the existing
version body alongside `items`; no additional migration, import or table is
needed. Published content stays unchanged when a new draft is saved; publishing
that draft only retires the old version. The command above remains the operator
entry point for production content imports; never insert content with hand SQL.

### Path progress

`GET /v1/paths/progress?account=<key>&character=<name>&realm=<realm>` uses the
planner bearer; Character and realm are optional. MCP `get_path_progress`
accepts the same filters (no arguments selects the most recently seen Character).
Runner leases may read only their Request's Account. Both return `characters`,
each with `account`, `character`, `realm` and `paths`. Each Path includes its
published version's `id`, `kind`, `slug`, `locale`, `version`, `title`, `done`,
`total`, `completedAt` and ordered `goals` (`position` starts at zero, `kind`,
`id` when applicable, `required`, `done`). Collections use exactly the same rules.
These are private reads; public content pages contain no player data.

Only required goals count toward done / total; optional goals still have their
own done flag. Chance goals count normally. Drafts and Guides are excluded.
Missing or unknown-version Sections do not prove completion. Progress reads:

| Goal | Snapshot evidence |
| --- | --- |
| mount, pet, toy | Account `mounts.ids`, `pets.species`, `toys.ids` |
| achievement | Account `achievements.ids` or Character `achievementsMine.ids` |
| item | Positive counts in Character bags/bank/reagentBank or Account warband; equipped gear also counts |
| rep, renown | Character `reputation.factions[].reaction` / `renown[].level` reaches the threshold |
| level, currency | Character `char.level` / `currencies.list[].quantity` reaches the threshold |
| quest | Character `questsDone.ids` |
| questLine | Every verified quest in the published build's `QuestLineXQuest` is in Character `questsDone.ids` |

Completed quest lines disappear from `questLines`, so its absence is never
completion evidence. Empty, missing or oversized membership (over 256 rows)
cannot prove completion; membership stays pinned to the published build.
Other Characters' quests, reputation, currencies and bags never count.

Snapshot ingestion checks every Character of the Account, including on the
first upload. A progress read also checks completion, covering content published
after the last upload. The first observation of all required goals (at least one)
records `path_completion` in Player history. Its ref is the content version row id;
its body includes kind, slug, locale, version, title, done and total. Current
progress can fall when currency is spent or an item is lost; `completedAt` remains
the first completion time.

Migration `0017_path_completions.sql` adds only a uniqueness guard referencing
the existing Character and content version. It survives the 13-month Player
history retention window and cascades away when Forget my data erases the
Character. Completion and history writes share the upload/read transaction and
Account lock. No new content store or production data import is needed. Existing
snapshots are evaluated by the next upload or progress read. SQLite has no site
content; its HTTP/MCP progress endpoint reports unavailable. The SQLite transfer
copies 24 tables; the new Postgres-only guard must be empty on its target.

### Active Path and Continue Idea

`GET /v1/paths/active?account=<key>&character=<name>&realm=<realm>` and
`PUT /v1/paths/active` use the planner bearer. All three Character fields are
required, and the Character must already belong to that Account. PUT accepts
`{ account, character, realm, path: { kind: "path" | "collection", slug, locale: "en" | "ru" } }`;
`path: null` clears the selection. Both return `{ account, character, realm,
path }`, with `path` null or the current published version and progress
(`id`, `kind`, `slug`, `locale`, `version`, `title`, `done`, `total`, `completedAt`, `goals`).
MCP `get_active_path` and `set_active_path` accept the same fields and are owner
only; runner leases cannot change the player's selection. Invalid, draft,
Guide or unknown selections return an error without changing the current Path.

Migration `0018_active_paths.sql` uses one row per Character and the same
Account lock as uploads and erasure. Selection follows the latest published
version of its kind/slug/language, survives completion and is removed by Forget
my data. SQLite reports this feature unavailable. This Postgres-only table is
excluded from SQLite transfer, so it adds no tables to the current workflow count of **24**.

Suggestions prepend one `kind: "path"` Idea for the active Path while required
goals remain. It uses `path-progress.ts` and `content.ts` directly at delivery,
so selection, publication and snapshot changes appear without waiting for the
normal Suggestion cache; the ten-Idea limit still applies. A completed, empty
or unavailable Path offers no Continue Idea; a recorded completion stays quiet
even after currency is spent or an item is lost. A newly published version can
be continued independently. Repeated reads of unchanged data
do not change the payload just because the clock advances.

The addon shows **Continue your Path / Продолжи свой Путь** with X / Y and
opens the existing Send now confirmation. The shared `suggestion.path` reference
contains `{ kind, slug, locale, version }` through SavedVariables, Companion,
HTTP storage and planner Request reads. It keeps the version the player picked,
even if publication or selection changes before upload. Addons 0.12 ignore the
new `path` kind and retain their other Ideas. No new version of the helper-file
format or per-message Refresh is required.

Content remains in the existing store. The documented `scripts/content.ts`
validate/save/publish command above remains the production import entry point;
this feature needs no separate content import. Selecting Paths on the site
belongs to a later ticket.

### Plans from a Path

For a Path Request, runner MCP `get_request` and owner MCP `list_requests`
include `path`: the picked `reference`, title, current required-goal `done` /
`total`, and `nextGoals` in authored order. Each remaining required goal includes
its zero-based `position`, authored source, note and target fields. `outcome`
is present only for eligible Plan targets; quests and quest lines may guide
Steps, and chance goals are bonuses. Optional and finished goals are omitted.
Non-Path Requests have `path: null`. An unavailable publication or missing
Character snapshot returns an empty `nextGoals` with a `reason` for the Planner.

The publication is the exact kind, slug, language and version picked by the
Request, including a retired publication after a newer version replaces it.
Changing or clearing the active selection does not change that Request. Progress
uses this Character's latest Sections and Account collections through the same
reader as active Paths. A Plan outcome must exactly match one eligible goal,
including its threshold; submissions re-read progress before storing. HTTP
`PUT /v1/plan`, MCP `put_plan` and the Plan in `answer_request` share this check.
A rejected submission leaves the Request pending and the runner lease available:
read `get_request` and retry with an eligible outcome, or use `fail_request` when
none remains. Existing Game DB and acquisition checks still apply.

Accepting a Plan does not mark its Path goal done. The later Game data snapshot
moves progress and records completion through the existing ingestion flow.
`path-plan.test.ts` exercises runner claims, correction in the same lease,
version preservation, every submission route, and Path / Collection progress.
No migration or new import is needed; transfer/workflow counts are now **24**.
The existing documented content validate/save/publish command remains the
production import entry point.

### Game DB: Planner lookups

The owner and a live Plan runner lease can call:

- `find_game_entity {kind, name, locale?}`: exact, case-sensitive localized names
  (`enUS` by default or `ruRU`), up to 50 matches in id order plus `truncated`.
  SQL wildcard characters are literal. Kinds: item, quest, questLine, faction,
  mount, currency, achievement, zone and instance. Quest names cover
  `QuestV2CliTask`, not every quest; pet and toy names are not imported.
- `get_quest_line {questLineID, locale?}`: membership from `QuestLineXQuest`,
  sorted by `OrderIndex`, with names when available. More than 256 members or
  conflicting order returns no sequence. Missing quests/names are reported,
  never reconstructed. Client order does not establish prerequisites.
- `get_place {mapID, questID?, npcID?, lang?}`: the existing destination lookup
  also returns the nearest zone ancestor and an expansion `{id, scope: "worldMap"}` from
  `UiMapAssignment` → `Map.ExpansionID` when all assignments agree. Map zero
  is valid. This is world-map metadata, not a zone/content release: a later
  zone on an older continent can share its world map. No expansion label is invented. The source identifies the build,
  locale and tables, including existing quest/flight geometry.
- `get_item_sources {itemID, locale?}`: exact item references from Blizzard's
  journal encounter search plus sourced Catalog Farm rows. Every match carries
  its source URL; Catalog boss names stay English. API errors, missing names,
  no Catalog match and truncated searches are explicit. Journal search is
  limited to its first 50 results with a four-second HTTP timeout, and each
  nested `items[].item.id` is checked independently. It does not search every
  vendor, quest or crafting recipe. Drop probability remains unknown; the
  acquisition verdict uses vetted Catalog facts and current Game DB source
  categories as described below. A journal listing alone cannot justify a
  guaranteed outcome.

Name and quest-line answers identify their build, table, locale and CSV source.
No lookup downloads client tables. Item lookup uses the existing optional
Blizzard credentials; without them the vetted Catalog remains available.
The API search endpoint is documented in [Blizzard's static-search announcement](https://us.forums.blizzard.com/en/blizzard/t/world-of-warcraft-api-patch-notes-20200708/10310).
Catalog item ids and URLs are exported from the references already vetted in
`addon/Data/Farm.lua`; rows without an explicit item reference are not guessed.

Migration `0014_game_tools.sql` adds indexes through normal startup. Migration
`0019_quest_names.sql` adds `game.quest_names` (`game_quest_names` on SQLite)
for successful Blizzard quest titles, keyed by build, quest id and locale, with
the exact API source URL. SQLite transfer/workflow counts are now **24**.

`get_quest_line` prefers imported `QuestV2CliTask` titles, then this persistent
cache, then `/data/wow/quest/{id}` in the configured region's static namespace
(`en_US` or `ru_RU`). Each quest's `nameSource` identifies the Game DB table or
Blizzard API URL, build and locale; it is null when no title is verified.
Credentials, OAuth reuse, injected fetch and four-second HTTP timeouts come from
the existing Blizzard client. Quest-line reads and content checks each share a
ten-second deadline across all quest-title HTTP requests, including OAuth;
remaining titles still use local DB2/cache evidence after it expires.
Missing credentials, HTTP failures and malformed
or mismatched quest documents leave the name null and add an unavailable reason.
Failures are not cached, so a later lookup can recover. A new build uses a fresh
cache; cached titles remain readable without credentials. API titles never
replace imported DB2 rows or establish quest existence, order or prerequisites.

English quest Path goal name checks use the same lookup on both owner HTTP and
MCP draft saves and publication. As with other content kinds, a known title must
match; an unavailable title adds no invented name and leaves the existing
verified-id check in force. Other goal kinds and Russian content name-check
policy are unchanged. This is the sourced Game DB supplement described in ADR 0071.

Existing builds need no re-import or production backfill: titles fill lazily on
lookup. On an empty installation, use the documented operator-run command
`node apps/server/scripts/import-game.ts <current-live-build>` with owner
authentication on the target installation. Local development and fixture tests
never call the live quest API or import into production.

### Game DB: Plan checks

`put_plan`, `answer_request` (including its optional Plan), and `PUT /v1/plan`
check against one imported build for each submission. Existing ownership checks
still reject targets already reached by the Character or Account. Missing
Game DB outcome targets are errors: no Plan or Answer is stored and the Request
remains pending. An outcome also listed as a chance bonus is rejected.

Unknown Entity tokens become their label, or disappear without a label, with
field-specific warnings. Invalid rewards and Reward contents are dropped.
Structured completion and Condition checks use the same ids; unsupported
completion becomes manual, and an unsupported Condition keeps its text.
Toy tokens use `Toy.ItemID`, not the Toy row id. Spell ids are verified from
mount source spells and pet summon spells; NPC ids from pet creature references.
Other spells and NPCs have no imported evidence yet and become plain text.
Planner-supplied NPC names and points never establish that an id exists.

Points use imported map assignments, quest geometry, flight nodes and journal
encounters. A unique quest destination more than 5% away on the same map
corrects a Step destination; unsupported points are dropped from Steps,
completion checks, routes, NPC entities and pin tokens. Ambiguous or oversized
geometry groups cannot establish a destination. No validation downloads CSV.
Migration `0012_game_validation.sql` adds relationship indexes to `game.rows`;
SQLite creates equivalent indexes. Migration and import publication refresh
PostgreSQL statistics so new relationship indexes cannot turn id lookups into
full group scans before automatic analysis runs. It adds no tables, so transfer counts are
now 24. The existing import command above prepares all required tables; there
is no separate data import for these checks.

Before the first import, existing structural checks and optional remote id
checks remain available, and submission replies explicitly report the missing
Game DB in `notes`. Once imported, Game DB checks are authoritative and do not
fall back to another build. Acquisition uses current-build `SourceTypeEnum`
from `Mount`, `BattlePetSpecies`, and `Toy` (joined by `ItemID` for toy and item
outcomes): Quest 1, Vendor 2, and Achievement 5 establish a guaranteed source.
These are the zero-based client categories, not the one-based journal filter
numbers. Costs, prerequisites and availability still need Planner verification
under ADR 0068; a guaranteed source alone does not make a target reachable now.

Catalog mount sources can also carry a vetted target-wide `acquisition` verdict
(`guaranteed` or `chance-only`) with their existing source URL. The same verdict
applies to a source's `itemID`. Ashes of Al'ar is chance-only; Infernal Direwolf
is an achievement reward. A known guaranteed source takes precedence over a
chance-only Catalog verdict, including when a newer build adds a source. A
boss name, DB2 Drop category 0, or Blizzard journal loot match alone proves
neither chance-only acquisition nor a guaranteed drop. Missing or ambiguous
evidence stays unknown, accepted with an informational `notes` entry, never a
warning. The Catalog remains usable before the first import. Chance-only
outcomes are rejected before storing anything; the explanation asks the Planner
to keep the collectible in `bonus`, choose a near-guaranteed outcome and retry.

`get_item_sources` reports the same item acquisition verdict and its source URLs;
individual Catalog rows expose their own verdict. Blizzard matches still have
`guaranteed: null`; failures and partial searches cannot turn missing evidence
into a refusal. Submissions use local evidence and make no new API calls.
No tables, columns or migrations are needed; transfer/workflow counts are now
24. Existing imports already contain the required fields. For an empty
installation the documented operator command remains
`node apps/server/scripts/import-game.ts <current-live-build>`; development
does not run it against production.

`game-plan.test.ts` exercises MCP submissions, HTTP rejection, warning payloads,
current-build changes and unchanged Request state after a rejected Answer on
both storage backends. `postgres.test.ts` checks automatic migration and
concurrent startup. Existing shared Plan fixtures continue through the
contract, addon and delivery suites.

### Game DB: automatic build watching

At Server startup and every hour, the watcher checks
`https://wago.tools/api/builds/wow/latest` for the retail product `wow`. The
response supplies `product` and `version` (the product-specific endpoint is also
used by [the WoW API documentation tooling](https://github.com/Ketho/vscode-wow-api/blob/master/wowdoc/wago.lua)).
It excludes PTR, beta and Classic. Discovery has a 30-second timeout and 64 KB
response cap; the locale imports retain the limits above. Startup and requests
do not wait for downloads. Overlapping ticks share one run, and shutdown stops
the timer and waits for that run before closing storage.

A newer numeric build imports all core tables and their localized text through the existing
atomic importer. Unchanged or older builds do not download again; failed
discovery or import retries on the next hourly check. A stale upstream response
cannot lower the last observed live build. Multiple Server processes may download
the same build, but the import transaction publishes it once. Existing reads
continue to use the previous complete build until the transaction commits.

Startup migration `0010_game_watch.sql` adds `game.watch`; SQLite adds
`game_watch`. This small shared record survives restarts and transfers with the
other Game DB tables. No operator migration or production import is needed
outside the normal Server startup; the documented import command above is also
available for operator use after deployment.

`GET /health`, owner `GET /owner/data`, and MCP `data_catalog` include `gameDb`:

- `build`, `importedAt`: the current complete build and its import time, or null.
- `liveBuild`, `checkedAt`: the highest observed retail build and time of the
  last successful discovery, or null before any successful discovery.
- `pendingSince`, `lagSeconds`: when an outstanding newer build was first
  observed and seconds since then. This measures observed import lag, not time
  since the game release. It stays pending across failures, newer observations
  and restarts; it becomes null / zero as soon as reads catch up.
- `lagThresholdSeconds: 21600`, `lagging`: true when observed lag exceeds six
  hours. All timestamps are Unix seconds.
- `lastError`: `discovery_failed`, `import_failed`, or null. Upstream bodies and
  raw errors are never exposed. It clears on the next successful discovery;
  a subsequent import failure sets it again. A manual import removes lag as soon
  as it commits, but the last watcher error remains until its next check.

Health retains HTTP 200 and `ok: true` while an old complete build is usable;
monitor `gameDb.lagging` and `lastError`, and check `checkedAt` for stale discovery.
Null `liveBuild` means unknown, not verified current. These read paths query
storage only and never trigger upstream requests. Tests cover newer-build
fixtures, partial and failed imports, restart persistence, scheduling, shutdown,
and lag on both supported backends.

### Local Postgres

`apps/server/compose.yaml` runs the same `postgres:18` image as CI on port 5432, user and password `postgres`:

```
docker compose -f apps/server/compose.yaml up -d
export UNBORED_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
pnpm test:js                                                  # SQLite, plus the Postgres-only tests
UNBORED_TEST_BACKEND=postgres pnpm exec vp test apps/server   # every Server test on Postgres
docker compose -f apps/server/compose.yaml down               # add -v to drop the test databases
```

The test helper leaves `unbored_tpl_<hash>` template databases behind, one per set of migration files; they are reused and safe to drop. Without Docker, any Postgres 18 where the user may `CREATE DATABASE` works the same.

To run the Server itself on Postgres, create a database and start it with `DATABASE_URL`; it applies the migrations at startup:

```
psql postgres://postgres:postgres@localhost:5432/postgres -c "CREATE DATABASE unbored"
DATABASE_URL=postgres://postgres:postgres@localhost:5432/unbored \
  UNBORED_COMPANION_TOKEN=dev-companion UNBORED_PLANNER_TOKEN=dev-planner UNBORED_DATA_DIR=/tmp/unbored \
  pnpm dev
```

`POST /v1/snapshot` then answers 202 and the worker ingests in the background (`docs/companion-api.md`). `psql "$DATABASE_URL" -c "SELECT state, count(*) FROM raw_uploads GROUP BY 1"` shows the queue.

## Commits and releases

Commits and PR titles are [Conventional Commits](https://www.conventionalcommits.org/) with a scope: `feat(addon): ...`, `fix(companion): ...`, `perf(server): ...`, `docs: ...`, `chore: ...` (also `refactor`, `test`, `ci`). The `PR title` workflow checks the title, since a squash merge uses it as the commit subject. Write the subject as a short sentence a player could read; it becomes a line in the release notes ([ADR 0022](adr/0022-releases-and-docs.md)).

Release notes say only what changed in that release. `.github/scripts/release-notes.sh` prints the body: the Install / Download section from `.github/release/install.md`, then [git-cliff](https://git-cliff.org) output for the range since the previous `vX.Y.Z` tag, grouped as Features, Fixes and Performance (`cliff.toml`). Squash merges keep each commit as a `* type(scope): ...` line in the body, and every line becomes its own entry; the squash title is left out when the body already has player lines, so any title type is safe. `refactor`, `docs`, `chore`, `test`, `ci`, `build`, `style` and `revert` never show. `CHANGELOG.md` is history and is not pasted into releases.

Every PR gets a **Release notes preview** in the summary of its `PR title / notes-preview` job: the notes as if the PR were squash-merged now with its title. It fails on a version-titled line, the old mascot name, or a maintenance change (clippy, lint, CI, tests, bumps and so on) in Features, Fixes or Performance; give such a change a maintenance type instead. Locally: `scripts/preview-release-notes.sh origin/main HEAD "feat: your PR title"`. `scripts/test-release-notes.sh v0.8.0` checks past releases and the squash cases.

One tag is one release ([ADR 0026](adr/0026-one-release-tag.md)). The addon, Companion, and Server share the version in the root `package.json`. `scripts/check-version.sh` checks `addon/Unbored.toc`, `addon/Core/Namespace.lua`, `apps/companion/package.json`, `apps/companion/src-tauri/Cargo.toml`, `tauri.conf.json`, `HELPER_TOC` in `apps/companion/src-tauri/src/plan.rs`, `apps/server/package.json`, and `packages/contracts/package.json`. Do not push `companion-v*` tags.

```
git tag v0.7.0 && git push origin v0.7.0
```

`.github/workflows/release.yml` builds `Unbored-v*.zip` with the [BigWigs packager](https://warcraft.wiki.gg/wiki/Using_the_BigWigs_Packager_with_GitHub_Actions) (it copies `addon/` to the checkout root for that job, because the packager only sees a TOC there), builds the Windows installer, attaches both to the tag, and writes `latest.json`. It then copies `latest.json` onto the existing `companion-updater` release, which is the URL already installed Companions read. If `TAURI_SIGNING_PRIVATE_KEY` is missing, the workflow builds the installer and leaves that feed alone. CurseForge and Wago ids are unset until those projects exist. To preview notes: `pipx install git-cliff==2.14.2` and `.github/scripts/release-notes.sh v0.8.0`.

**Updater key cutover.** Tauri v2 `plugins.updater.pubkey` is one minisign public key, not a list ([tauri#7585](https://github.com/tauri-apps/tauri/issues/7585) is still open). The key embedded now is the new one:

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEJDNUVCNDQxN0E2NDlCMjMKUldRam0yUjZRYlJldkRLdHBIT09ycVJNdkxRZEF2MEt5MDNMQ25CZjNPa1pYNXRBZ09SOEozb2QK
```

Installed 0.8 Companions still verify with the previous public key:

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEY3NjIzREE2MkJDODNGNEQKUldSTlA4Z3JwajFpOTNsTGZZaVZGSmt5Mzd1MjRSNzN3SDBxbWpMWUtqaVhFNnJYK0JFUWxLUkwK
```

1. Do not change the GitHub secret `TAURI_SIGNING_PRIVATE_KEY` before 0.9 is published.
2. Tag **0.9** signed with that current secret (the old private key). The 0.9 binary contains the new public key, so Companions on 0.8 accept 0.9 and then trust the new key.
3. After those installs have moved to 0.9, replace `TAURI_SIGNING_PRIVATE_KEY` with the new private key. It has no password, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is gone from the secrets and the workflows. Do not commit the private key. (Done 2026-10-31.)
4. Tag **0.10.0** and later with the new secret. The pubkey in `tauri.conf.json` stays the new one. The release `publish` job verifies each installer `.sig` against `updater-pubkey-v2.pub` with `minisign` (`.github/scripts/verify-updater-sigs.sh`, D218), so the dry run fails if the secret is not the new key.

A release dry run prints the embedded pubkey in the job summary (`scripts/print-updater-pubkey.sh`) and fails when it is not the committed public half, `apps/companion/src-tauri/updater-pubkey-v2.pub` (`scripts/check-updater-pubkey.sh`, D151); `cargo test` checks the same. Swapping the secret before 0.9 ships would make every installed Companion reject the update.

**Dry run before every tag** (D117): Actions → Release → Run workflow, branch `main`, `dry_run` ticked (`gh workflow run release.yml --ref main -f dry_run=true`). It builds the zip and both installers, checks their names, the zip contents and `latest.json`, renders the notes since the last tag into the run summary and fails on lines that are not for players, and uploads `dry-run-addon`, `dry-run-companion` and `dry-run-notes` as artifacts. It publishes nothing and touches no release or the updater feed. It warns when the version in `tauri.conf.json` already has a tag: bump it before you tag.

Release notes are one Install / Download section (the setup.exe, then the zip for a manual install, with `latest.json`, `.sig`, and `release.json` marked as auto-update only) and then git-cliff for every scope since the previous `vX.Y.Z` tag.

## Game data

Snapshot HTTP reads enforce ADR 0029's 4 MB compressed cap while consuming the
body, even without a reliable Content-Length. An oversized stream is cancelled
at the first chunk that crosses the cap; producer cleanup cannot delay the 413.
The accumulation buffer is bounded independently of chunk count. Interrupted
reads return the same clean 400 as malformed JSON/gzip; no partial snapshot is
stored. The separate 32 MB inflation limit and final Device check still apply.

`Core/Data/` collects every own-player source the addon can read ([ADRs 0027 to 0031](adr/README.md), D47-D63 in [decisions-v0.7.md](decisions-v0.7.md)). Each Section lives in `UnboredCharDB.data.sections` (scope `char`) or `UnboredDB.data.sections` (scope `account`) as `{ v, at, src, body }`, under `schema = 2`. Logout only stamps `savedAt`; the Companion hashes each Section and uploads the changed ones to `POST /v1/snapshot`. Big id sets are packed ([packed ids](contract/README.md#packed-id-sets)).

The Account key on the wire is not the WTF folder name ([ADR 0044](adr/0044-hashed-account-key.md)). The Companion stores a 32-byte salt, hex-encoded, next to the device secret (`accountSalt` in `device.json`). It never sends the salt. The key is the folder name with the license suffix removed (`12345678#1` and `12345678#2` are both `12345678`). The hash is lowercase hex SHA-256 of `salt_bytes || 0x00 || utf8(account_key)`. Until this PC has seen a successful upload for that key, the body also includes `accountLegacy` with the old key so the Server can rename rows. After that, only the hash is sent. An older Companion that still sends the folder name keeps working; a 64-character hex string is stored as-is and is not split on `#`.

Reads happen at three moments, never in combat, and every value where `issecretvalue(v)` is true is dropped: the **login pass** (10 s after entering the world, staged over frames), **event deltas** (settled for 2 s), and **window reads** (only while the bank or profession window is open). Nothing about other players is read: no chat, mail senders, subjects or bodies, rosters or names.

Sizes are from the worst-case test (`UNBORED_SIZES=1 lua5.1 addon/tests/data.lua`): the Character file is 306 KB with 3.2k literals, the Account file 50 KB with 0.5k literals. Targets are 400 KB and 300 KB, the hard cap 1 MB and fewer than 30k literals per file. Over the cap, the lowest-priority Sections are dropped first and listed in `data.dropped`. Sections with no size were not in the worst-case fixture and are well under 2 KB.

Snapshot deduplication compares both the Section version and its body hash. The wire hash still covers only the canonical body; a version change is uploaded and stored as a full history entry, never a collection diff. Re-posting an identical version/body advances the Section's freshness time without adding history, so an older changed upload cannot replace it. Per [ADR 0063](adr/0063-section-freshness.md), that time is the Section's integer `at`, clamped to Server time + 300 seconds, else the Snapshot `savedAt`, else no freshness check. `sections_latest.saved_at` and new `section_history.saved_at` values hold this Section time; a one-time migration resets existing latest rows to `at` where present, leaving history intact. The Character row still uses the file's `savedAt`. A staged bank or profession read is discarded when its window closes, even if it reopens before the next frame. Achievement event payloads update ids immediately; their points API read waits for the settled worker outside combat.

Achievement progress requires readable boolean evidence: completion and guild
flags must both be false, and every counted criterion must have a known done
flag. `AsBoolean` preserves unknown as nil (including secret values or a failed
secret check); an unknown criterion drops that achievement's progress row.
Unknown is never counted as an unfinished achievement or an open criterion.

| Section | Scope | API | When | Worst case |
| --- | --- | --- | --- | --- |
| `char` | char | UnitClass, UnitRace, UnitLevel, UnitXP, GetSpecializationInfo, GetAverageItemLevel, GetMoney, GetBindLocation, and `lang` (the addon's language, for the Server's ideas) | login, events | 0.5 KB |
| `gear` | char | GetInventoryItemLink 1-19, C_Item.GetDetailedItemLevelInfo | login, PLAYER_EQUIPMENT_CHANGED | 0.3 KB |
| `talents` | char | C_ClassTalents, C_Traits.GenerateImportString | TRAIT_CONFIG_* events | |
| `played` | char | RequestTimePlayed, TIME_PLAYED_MSG (our chat line is hidden) | once per login | |
| `bags` | char | C_Container | login, BAG_UPDATE_DELAYED | 8.6 KB |
| `bank`, `reagentBank` | char | C_Container on the bank bags; `reagentBank` only where the client still has a reagent bank (retail folded it into the bank tabs in 11.2), so `data_catalog` does not expect it | while the bank is open | 20 KB |
| `warband` | account | C_Container on the warband bank tabs | while the bank is open | 17 KB |
| `currencies` | char | C_CurrencyInfo list (headers expanded, then restored) | login, CURRENCY_DISPLAY_UPDATE | 37 KB |
| `professions` | char | GetProfessions, GetProfessionInfo | login, SKILL_LINES_CHANGED | |
| `recipes` | char | C_TradeSkillUI.GetAllRecipeIDs, GetRecipeInfo (packed) | while a profession window is open | 5 KB |
| `questsDone` | char | C_QuestLog.GetAllCompletedQuestIDs (packed) | login, QUEST_TURNED_IN | 52 KB |
| `questLog` | char | C_QuestLog, GetQuestObjectives | QUEST_LOG_UPDATE and quest events | 16 KB |
| `questLines` (v1) | char | C_CampaignInfo (InProgress or Stalled campaigns), C_QuestLine.GetQuestLineInfo for each log quest, GetAvailableQuestLines for the current map and the 3 most played maps; GetQuestLineQuests against IsQuestFlaggedCompleted gives `done`/`total`/`nextQuestID`. Up to 40 rows `{ questLineID, name, campaignID?, chapter?, mapID, x?, y?, done, total, nextQuestID?, flags }`, names in the client language | 20 s after the login pass (map requests 10 s before it), QUEST_TURNED_IN | ~4 KB |
| `reputation` (v2) | char | C_Reputation, C_MajorFactions, C_GossipInfo.GetFriendshipReputation; v2 adds per renown row `next` (up to 4 rewards of the next level from `C_MajorFactions.GetRenownRewardsForLevel`) and `max`, and per paragon faction `paragon = { value, threshold, questID, pending }` (D181) | login, UPDATE_FACTION | 52 KB |
| `achievements` | account | GetCategoryList, GetAchievementInfo (packed) | staged scan once a day, ACHIEVEMENT_EARNED | 12 KB |
| `achievementsMine` | char | ACHIEVEMENT_EARNED | events | 6 KB |
| `achProgress` | char | GetAchievementNumCriteria, GetAchievementCriteriaInfo on incomplete non-guild achievements (a single progress-bar criterion uses its quantity); rows `{ id, name, d, t, open }` (`name` from 0.11) with ratio >= 0.5, at most 200, best first; skips achievements with more than 60 criteria and stops at 60,000 calls (D182). Priority 20, dropped first | staged, once a day per Character, 60 s after login | |
| `mounts` | account | C_MountJournal (packed) | login, NEW_MOUNT_ADDED | 3 KB |
| `pets` | account | C_PetJournal | login (staged), NEW_PET_ADDED | 12 KB |
| `toys` | account | C_ToyBox, PlayerHasToy (packed) | login (staged), NEW_TOY_ADDED | 3.7 KB |
| `transmog` | account | C_TransmogCollection category counts | login | |
| `lockouts` | char | GetSavedInstanceInfo, GetSavedWorldBossInfo | UPDATE_INSTANCE_INFO, BOSS_KILL | |
| `mplus` | char | C_PlayerInfo.GetPlayerMythicPlusRatingSummary, C_MythicPlus keystone | login, CHALLENGE_MODE_COMPLETED | |
| `vault` | char | C_WeeklyRewards.GetActivities | login, WEEKLY_REWARDS_UPDATE | |
| `calendar` (v2) | account | C_Calendar, today to +14 days; per event `texture` (iconTexture), `sequenceType`, `numSequenceDays`, and for today's and tomorrow's holidays `description` from GetHolidayInfo (300 bytes) | OpenCalendar again 5 s after entering the world, then the settled CALENDAR_UPDATE_EVENT_LIST, once per login | |
| `sessions` | char | zones with mapID and minutes, deaths, level ups (last 20) | events | 24 KB |
| `addons` | account | C_AddOns.IsAddOnLoaded for TomTom, Auctionator, TSM, Bagnon | login | |
| `unresolvedIds` | char | Plan ids the game could not resolve, and items Bory had no tooltip advice for (`kind = "advice"`, was the 0.6 profile's `unmatchedItems`) | when a link fails, when an item has no line | |
| `errors` | account | `ns.ReportError`: rows `{ at, lastAt, count, version, where, text, stack }`, same `where`+`text`+`version` counts up, 10 rows; paths cut to `Interface/AddOns/`, quoted text replaced by `"…"`, stack lines only from `AddOns/Unbored/` or `[C]` (D173-D176). Not essential: with sharing off it stays on this PC | when a protected call fails or Self-check is clicked | 4 KB normally; up to 80 KB with self-checks |

"Share game data to make Bory smarter" (`UnboredDB.shareData`, on by default) off keeps only `char`, `gear`, `questLog` and `sessions`, the Sections a Plan Request needs. The owner sees what arrived with the MCP tools `data_catalog` and `get_game_data`.

## Tooltip Advice

`Core/Advice.lua` adds at most two Bory lines to an item tooltip, and only when they are about this player ([ADR 0035](adr/0035-personal-only-advice.md), [ADR 0048](adr/0048-account-holdings-in-tooltips.md)): one action line, then a muted Holdings line ("Also: Grubbyman 40, Warband bank 200") from `UnboredAdvice.holdings`, the Account holdings index the Server builds from every Character's `bags`, `bank`, `reagentBank` and the `warband` Section. Holdings never count this character's own place, leave out places not seen for 60 days, and stop at 3,000 items / 60 KB; with them `Advice.lua` stays under 260 KB and 20k literals (the Companion cuts holdings first, then advice). The rules, first match wins: needed for the active Plan (names the Step), starts a quest this character has not completed, new for the Account's collection (a mount, toy, pet or look no character has), Personal advice from the Server (`UnboredAdvice` in `Unbored_Plan/Advice.lua`) or a planner answer about the item, and a reagent for a profession an Alt has and this character lacks, with the route (mail or warband bank, [ADR 0021](adr/0021-account-and-alt-routing.md)). No line is the default. It never says delete, never says sell for epic or bind-on-equip items, and never routes a soulbound item to an Alt. The menu toggle "Bory lines in tooltips" (on by default, `UnboredDB.tooltipLines`) turns them all off.

## Slash commands and keybinds

Players never need them. Keybinds (Esc → Options → Keybindings → AddOns → Unbored): pick a new plan, Done, Skip, point the arrow again, and Refresh (reloads the UI; a keypress counts as the click Blizzard requires).

`/unbored` (the presets), `/unbored show|hide`, `/unbored item`, `/unbored lock|reset`, `/unbored build`, `/unbored roam|quests|events|fun|farm`, `/unbored tomtom|chat|minimap`, `/unbored companion` (apply the Companion file again), `/unbored where` (map id and 0–100 coordinates, for people adding data), and `/unbored errors` (caught Lua errors; the player only ever sees one friendly line).

## What the modes suggest

- **Roam.** Unearned exploration criteria (Eastern Kingdoms through Pandaria are in the table; add more continents in `Data/Exploration.lua`), rares and treasures the client is currently showing (`C_VignetteInfo`), and any curated rare in `Data/Rares.lua` that has a tracking quest id.
- **Quests.** Your log, plus world quests, bonus objectives, and other task pins from `C_TaskQuest.GetQuestsOnMap` on this zone and its neighbors, closest first.
- **Events.** Today's holiday rows from `C_Calendar`. Known holidays add unearned achievements and mounts. Anything else still becomes a task titled with the calendar's own name.
- **Fun.** A short curated list: Going Down?, Higher Learning, the squirrel `/love` sets, Well Read.
- **Farm.** Old raids (and Return to Karazhan) that still have a mount you do not own. A lockout from `GetSavedInstanceInfo` hides that instance for the week.

Tasks carry a rough minute estimate. A local Quick plan is sized internally (about an hour of estimates, at most `ns.MAX_STEPS` Steps) so it stays a short start; the player never picks a time. Full plans from the Planner have no time budget and cover the whole goal ([ADR 0037](adr/0037-no-time-budget.md)).

## Pins and combat

When a step becomes current, Unbored sets the user waypoint (`C_Map.SetUserWaypoint`) and super-tracks it (`C_SuperTrack.SetSuperTrackedUserWaypoint`), so Blizzard's on-screen arrow and distance appear at once. If TomTom is loaded it also adds a TomTom crazy arrow; turn that off in the gear menu or with `/unbored tomtom`. A step with a `waypoints` route moves the arrow to the next point when you come within 30 yards, and the bubble shows "Point 2/4: label" with the distance. Nothing is printed to chat unless you turn chat lines on.

When a step finishes, the pin Unbored set is cleared. A pin you placed yourself is left alone.

In combat, and inside a dungeon, raid, arena, battleground, or scenario, the pin and the "you walked up to it" check are paused. Bory's bubble hides during combat and the faded portrait ignores clicks until the fight is over; the list view (if open) stays up. Midnight secret values are not stored and are not used in arithmetic; if a coordinate comes back secret, that check is skipped.

Done, Skip, the queue, a pending request, and the last answer are saved per character (`UnboredCharDB`). Bory's position and lock, the window and list positions, item answers, and the TomTom and chat toggles are account-wide (`UnboredDB`). Everything is built at the UI scale and uses the game's own fonts.

## Blizzard rules

The addon never touches the network; the Companion carries Requests and answers through SavedVariables and its own `Unbored_Plan` addon (`Plan.lua`, `Advice.lua` and `Suggestions.lua`). `ReloadUI` runs only from a click on Refresh or Load, or the Refresh keybind, never per message ([ADR 0012](adr/0012-reload-free-background-refresh.md)). Bag buttons are not replaced, re-scripted or hooked: the tooltip line uses `TooltipDataProcessor.AddTooltipPostCall`, and an item reaches Bory by being dropped on him or picked up in pick mode (`GetCursorInfo`, then `ClearCursor` puts it back). There are no `hooksecurefunc` hooks and no protected calls outside a hardware event.

## Auto-complete

The current task advances on `ACHIEVEMENT_EARNED`, `CRITERIA_UPDATE`, `CRITERIA_COMPLETE`, `NEW_MOUNT_ADDED`, `NEW_PET_ADDED`, `NEW_TOY_ADDED`, `QUEST_TURNED_IN`, `CURRENCY_DISPLAY_UPDATE`, `ZONE_CHANGED_NEW_AREA`, and when you are standing on a task whose completion type is proximity. A rare vignette counts once it is dead, its loot quest is flagged, or it despawns while you are on the pin. Walking away does not finish it.

Account-wide achievement completion counts as done. See open questions below if that should be this character only.

## Plans from the Companion

There is no paste window: `/unbored import` and `/unbored export` were removed in 0.10 ([ADR 0046](adr/0046-choices-only.md), D214). `Core/Import.lua` still decodes the `UNB1:` string the Companion writes; the format and the JSON schema are in [`plan-format.md`](plan-format.md).

The Companion writes `Interface/AddOns/Unbored_Plan/Plan.lua`. A plan or answer for this character's pending Request is taken at the next login or Refresh; a Full plan over a running Quick plan is offered first. A plan the planner put directly starts once per character, when no request is waiting. `/unbored companion` applies the file again. The older `Companion/Plan.lua` and `UnboredDB.companionPlan` seam is still applied on login when its `generatedAt` is newer than the saved session. Progress carries the plan's `generatedAt`, so the Server can tell which plan it belongs to (taste, D191).

Build plan (without the companion) replaces a Companion plan with one made in game.

On the Server, `plans.request_id` preserves a Plan's Request even after the Planner replaces it. The Companion's latest-Plan endpoint returns only its Device's Request Plans and explicit direct Plans (which have no Request); owner MCP reads can still see all Plans. The one-time transactional migration restores links from Requests and Player history. Forget my data erases replacement Plans too, and a Plan whose Request was erased during asynchronous validation is rejected at the write boundary.

## Error reports

Settings → Self-check runs the registry in `addon/Core/SelfCheck.lua` once per click outside combat ([ADR 0067](adr/0067-addon-self-check.md)). Every verification TODO points there. It stores one `where=selfcheck` row in the existing `errors` Section: `text` contains the game build and ok/failed/manual counts, while `stack` contains at most 8,000 bytes of API names, statuses and value-free shapes. Known field names are allowlisted, arrays inspect at most 64 entries and one child, and at most eight return slots are summarized; counts ending in `+` are lower bounds. State-changing APIs are marked `manual`, and successful probes do not establish timing or visual correctness. No normal collector changes, timer, reload or immediate upload: the Companion reads the next natural save, and sharing off keeps the record local. The owner errors list preserves these details; ordinary errors keep their 800-byte stack limit. Repeating the same counts/build replaces details and increases the count, within the existing ten-row cap.

`ns.ReportError(where, err, stack)` keeps one row per problem in the account Section `errors` (above); the protected call sites (`Init.lua` event dispatch and setup, `Events.lua`, `Store.lua` `S.Read`, the staged worker) use `xpcall` with `ns.ErrorHandler(where)`, which adds `debugstack`. The player sees one friendly line per session (`OOPS`); `/unbored errors` lists them in chat. The Server upserts each row into `addon_errors` keyed by `sha256(version|where|text)`, count = the most seen; the MCP tool `list_errors` reads them newest first with the device name, and `delete_account_data` and Forget my data erase them ([ADR 0051](adr/0051-addon-error-reports.md)).

## Ready now, taste and wins

`apps/server/src/ready.ts` computes **Ready now** per Character on demand from the latest Sections (MCP `get_ready_now`, [ADR 0052](adr/0052-ready-now.md)); sorted by score, at most 5 items per kind (`READY_MAX_PER_KIND`, so near-done achievements cannot crowd out the vault, renown or a lockout) and 25 in all. Every item has a readable `title`: the name the game gave its row (achievement, faction, renown, currency, lockout, chain, event; addons 0.11 on for the first four), in the client's language, or a generic label such as `Achievement 12345`, `Currency 3008`, or `Faction 2590` when the name is missing or blank. Vault entries say `Great Vault` with the activity name for slots; keystones include their level. Existing `tokens` and ids are unchanged. Older snapshots need no new fields. These generic labels describe facts to the Planner; player-facing achievement Ideas already use `titleToken` to resolve the game's name, with their existing readable `title` as a fallback for older addons:

| Rule | Source | Score |
| --- | --- | --- |
| Great Vault reward waiting, paragon reward waiting | `vault`, `reputation` v2 | 100 |
| Event on now with open catalog tasks | `calendar` + catalog | 90 |
| Lockout with bosses left this week | `lockouts` | 80, +10 when it resets within 2 days |
| Renown within 25% of the next level | `reputation` | 75 with a mount or item reward, 60 without |
| Achievement at least 70% done | `achProgress` | 70 + 30 × (ratio - 0.7) / 0.3 |
| Vault activity 1-2 short of the next slot | `vault` | 70 (TODO: not in the D186 table) |
| Currency at 90% of its cap | `currencies` | 65 |
| Open quest chain (top 5) | `questLines` | 60 |
| Your keystone | `mplus` | 55 (TODO: not in the D186 table) |
| Classic or friendship standing within 15% of the next step | `reputation` | 50 |
| Weekly currency room left | `currencies` | 40 |

Vault activity types are named from `Enum.WeeklyRewardChestThresholdType` (comment in `ready.ts`), else "type N". `alts` lists up to 5 achievements another Character of the Account is at least 0.2 further along on (and at least half done), `{ achievementID, character, d, t }` (D210). `missing` names Sections the rules needed and did not have.

**Taste** (`taste.ts`, [ADR 0053](adr/0053-player-taste.md)) is computed per Account over 60 days and per category (the Request's idea kind or `preset:<topic>`, `surprise`, or a local plan's progress `source`): `rate = (finished + wins + 1) / (tracked + 2)` (at most 1), bonus `round((rate - 0.5) × 30)` clamped to ±15, nothing under 3 tracked picks, at most -5 when skipped steps are more than twice the done ones. `tracked` counts the picks whose plan has progress from the game; a pick that never got progress (never opened, or progress the Server could not tie to it) is in `picked` but is not held against the category. It reorders ideas and Ready now items before the cut and never hides one. Progress joins its plan by `generatedAt` (`plans.generated_at`, backfilled from the body); progress without `generatedAt` (addon 0.9, or a session applied under 0.9) joins the newest Request plan of the same Character with exactly the same step ids, made before the post.

**Wins** (`wins.ts`, [ADR 0054](adr/0054-wins-from-game-data.md)): a plan's targets are its reward tokens, its steps' rewards, the contents of a container (`contains`; the container itself is not a target) and the last step's `complete` (quest, mount, toy, pet, achievement). When a snapshot diff adds one of those ids to `mounts`, `toys`, `pets`, `achievements`, `achievementsMine`, `questsDone` or a bag/bank Section, after a plan of the same Account made in the last 30 days, the Server writes one history row of kind `win` per Account and id. A first upload (`initial`), a whole-body Section, a version change, an item that only moved between bags and banks, or one another character already holds never count. MCP `list_wins` gives totals per kind and UTC days; `get_player_history` shows them. Players do not see wins in 0.10.

## Character catalog freshness

The Server's Character catalog derives class and level from the accepted `char` Section, or from the legacy `profile` Section only when `char` is absent. Snapshot freshness is checked per Section: a newer bags upload does not block a valid char update. A stale upload can advance last contact time, but cannot roll back the Character's Account, Device, save time or dropped-Section metadata. Re-posting an unchanged char Section repairs previously inconsistent catalog facts without adding history; missing facts do not erase good ones.

## Calendar reads

The calendar collector validates dates and month lengths before arithmetic and
accepts only plain whitelisted event kinds before reading event details. It
deduplicates events using sanitized ids/titles and dates. If a required month
is unavailable, it keeps the last complete Section instead of saving a partial
calendar. Its tests use a secret sentinel that throws on indexing, conversion
and arithmetic; this does not emulate every restriction of live WoW values.

## Add a data row

Tables live in `Data/`. Keep them plain Lua. An English `fallbackTitle` is only used when the game API does not know the id; the live name is localized.

Exploration, a continent achievement:

```lua
{ achievementID = 42, fallbackTitle = "Explore Eastern Kingdoms", estMinutes = 12 },
```

A rare, only if you know the "already looted" quest. Check with `/dump C_QuestLog.IsQuestFlaggedCompleted(questID)`. Entries without `questID` are ignored on purpose.

```lua
{
  id = "rare-example",
  fallbackTitle = "Example",
  mapID = 554,
  x = 0.66,
  y = 0.50,
  estMinutes = 10,
  questID = 12345,
  note = "Where it stands.",
},
```

`x` and `y` are 0–1, not 0–100. `/unbored where` prints both the map id and 0–100 coordinates.

A fun achievement:

```lua
{
  id = "fun-example",
  achievementID = 964,
  fallbackTitle = "Going Down?",
  estMinutes = 5,
  note = "Why it is a good half hour.",
  minLevel = 1,
},
```

A holiday, keyed by the calendar event id:

```lua
{
  holidayID = 324,
  fallbackTitle = "Hallow's End",
  tasks = {
    { id = "hallows-head", achievementIDs = { 291 }, estMinutes = 20, fallbackTitle = "Check Your Head" },
  },
},
```

A farm run. `instanceID` is the 14th return of `GetSavedInstanceInfo`. `mounts` are mount journal ids. Optional `appearances = { itemID, ... }` uses `C_TransmogCollection.PlayerHasTransmog` when that API exists. `pins.Alliance` / `pins.Horde` override the door.

```lua
{
  id = "farm-eye",
  instanceID = 550,
  fallbackTitle = "Tempest Keep",
  mapID = 109,
  x = 0.739,
  y = 0.637,
  estMinutes = 20,
  mounts = { 183 },
  note = "Ashes of Al'ar.",
},
```

Each mode is a provider in `Providers/` with `Build(ctx)` returning tasks `{ id, title, mapID, x, y, estMinutes, note, complete }`. `complete.kind` is documented in the plan format.

## Website

The site is `apps/web` (Nuxt 4, Vue, Nuxt UI, `@nuxtjs/seo`, `nuxt-auth-utils`). It is a separate Dokploy app on the same host as the Server ([ADR 0073](adr/0073-website-and-account-link.md)). Traefik sends `/v1`, `/mcp`, `/health` and `/owner` to the Server and every other path to the site. The route table is [`apps/web/deploy/traefik.yml`](../apps/web/deploy/traefik.yml). The Companion's base URL stays `https://unbored.kosarev.space`. Applying the rules is manual; nothing in CI deploys the site.

The image is `docker build -f apps/web/Dockerfile .`. The container listens on 3000 and answers `GET /ready`. `GET /health` is the Server, including through the public host.

Page text and SEO fields are rows in the same Postgres, not markdown files. `web.pages` is the home page. `content.paths` is the public catalog: `kind` is `path` or `collection`, with draft and published versions ([ADR 0072](adr/0072-paths.md), [ADR 0074](adr/0074-public-path-pages.md)). Public URLs are `/paths/<slug>` and `/collections/<slug>`. There is no page for one item, mount, NPC or other object. The Server migration `0008_web_content.sql` creates both schemas; they sit outside `public`, so the SQLite transfer does not copy them. Topics and Path goals live in each version's body through the content authoring service; they need no separate tables.

Locally, apply migrations by starting the Server once with `DATABASE_URL`, then:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/unbored pnpm --filter @unbored/web dev
```

Dev listens on port 3001. `NUXT_PUBLIC_SITE_URL` is the canonical origin. `NUXT_APP_SECRET` (at least 32 characters) seals the My page cookie and signs og-images; `nuxt-auth-utils` no longer reads `NUXT_SESSION_PASSWORD`. `NUXT_SERVER_URL` is how the site reaches the Server to redeem a sign-in link and call the session-authenticated Path routes; when it is empty the site uses its own origin, which works when `/v1` on that origin is the Server. `UNBORED_WEB_ORIGIN` on the Server is the public website origin written into the link and accepted by Path selection Origin checks; it must match the browser origin exactly. All three belong in Dokploy env, not in the repo. In production the site connects as a read-only Postgres role (`unbored_web`, `default_transaction_read_only`) with SELECT on `web`, `content`, `characters`, `sections_latest`, `history`, `plans` and `devices (id, status)`; the Server's role owns and migrates every table. The site typecheck uses TypeScript 5.9 (`vue-tsc`); the rest of the repo stays on TypeScript 7. Website tests that read Postgres use `UNBORED_WEB_TEST_DATABASE_URL` (not `UNBORED_TEST_DATABASE_URL`, which also turns on the Server's Postgres backends).


### Website Path progress and selection

`GET /api/paths/progress` and `PUT /api/paths/active` are website handlers. They extract the opaque session row id from the sealed, HttpOnly, SameSite=Lax cookie and call the Server through `NUXT_SERVER_URL`; no planner credential is used or exposed. New cookies keep credentials in the session's server-only `secure` field; existing sealed cookies remain accepted and the public session endpoint strips their credential fields. All personal API responses (including errors and `/api/me`) send `Cache-Control: private, no-store`.

Server endpoints:

- `GET /v1/web/paths/progress`: bearer is the website session row id. Returns `{ characters: [{ character, realm, paths, active }] }` for only the session's Account. Each Path includes identity, title, published version, required `done`/`total`, goal `position`/`done`/`required`, and completion time. Query parameters are rejected; neither Account nor session credentials are returned.
- `PUT /v1/web/paths/active`: JSON `{ character, realm, path: { kind, slug, locale }, expectedActive?: { kind, slug, locale } | null }`. Only `path` and `collection` are accepted. No Account parameter is permitted. A missing/foreign Character returns 404, invalid or unpublished content 400. Selecting another Path without the current identity returns 409 `{ error: "replacement_required", current }`; the website displays a confirmation and retries with that identity. A changed selection returns another 409. The existing Server selection service writes the same active Path consumed by in-game Ideas.

`delete_account_data` and Forget my data erase every `web.sessions` and `web.sign_in_links` row for the Account in the same transaction as its game data, including ended sessions and used or expired links. The owner result includes `webSessions` and `signInLinks` removal counts; `requests: false` still erases website data. SQLite uses `web_sessions` and `web_sign_in_links` through the same `page-link.ts` helper.

Both Server routes require an open `web.sessions` row, an approved device, and creation within `WEB_SESSION_DAYS` (30 days, shared with the website). Device and Account locks serialize work with revocation, erasure and concurrent selection. Selection checks Origin against `UNBORED_WEB_ORIGIN`, rejects a present Sec-Fetch-Site other than `same-origin`, requires JSON, and uses the existing in-memory limiter pattern: 10 attempts per 10 minutes per session and per player address, returning 429. The website performs the same CSRF checks before forwarding and forwards the trusted proxy's client address, as sign-in redemption already does; the deployment's proxy must replace untrusted forwarded address headers.

Public Path/Collection detail pages and `/paths` keep their existing SSR and caching behavior. Personal controls fetch after mount, never during SSR, and do not alter canonical URLs, metadata or shared content. Goal markers require the same published version; a newer publication offers a page refresh. `/my` loads its Characters, Plans, Wins and `path_completion` history client-side and shows each Character's active Path with progress and a link. Personal interface copy follows browser English/Russian; authored public content stays English.

No migration or new table is needed. Existing migration and workflow table counts remain unchanged. No production data import is needed for this ticket; content publication continues through the existing documented content import command and owner routes.

## Server deploys

On SIGTERM or SIGINT, the Server refuses new Plan runner leases and releases waiting claims with the usual 204 answer, so they can poll the new copy during a start-first rolling deploy. It stops accepting HTTP connections, closes idle keep-alive connections, and lets in-flight requests finish before stopping the runner, webhook and upload inbox worker, then closing the store last. Shutdown logs its start and finish and exits within 20 seconds even if draining or cleanup stalls; a second signal exits immediately, so configure the container stop grace period to exceed 20 seconds.

## Postgres cutover

The one-off move of the hk Server from `/data/unbored.sqlite` to PostgreSQL ([ADR 0057](adr/0057-postgres-storage-and-async-ingest.md), rollout step 6). The transfer is `apps/server/scripts/sqlite-to-postgres.ts` (logic in `apps/server/src/transfer.ts`). It ships in the Server image and runs with the image's `node`:

- It opens the SQLite file read-only, applies the migrations to the target, and copies every table in **one transaction**: batches of 500 rows (and at most about 4 MB of JSON), `body_json` and `*_json` text parsed into jsonb objects, identity sequences moved past the copied ids, and month partitions of `section_history` and `history` made back to their oldest row.
- Before it commits it reads every table back and compares the row count and a checksum (an order-independent sum of the rows' sha256, JSON compared with sorted keys) with the SQLite side. Any mismatch, unknown table or column, or broken JSON rolls everything back and exits 1. Legacy `profiles` and `profile_snapshots` stay in SQLite only (they are listed with their row counts).
- It refuses a target that already has rows (any copied table or `raw_uploads`) unless `--force`, which empties those tables first inside the same transaction.
- `--dry-run` copies a snapshot of the file with SQLite's online backup API, does the whole copy and verification, and then rolls back. It is safe while the Server is up on SQLite. It does apply the migrations to the target (empty tables, as the Server would at its first start).
- The target URL is read only from the `DATABASE_URL` environment variable, never from arguments. `--sqlite FILE` overrides `$UNBORED_DATA_DIR/unbored.sqlite`; `--batch N` sets rows per INSERT. Exit codes: 0 committed (or dry run ok), 1 failed and nothing committed, 2 bad arguments.

Before the window:

1. main with the transfer script is deployed on hk (the image has `apps/server/scripts/`). `DATABASE_URL` is still unset.
2. A Postgres 18 service exists in Dokploy on hk, on the Server's Docker network, with a volume and daily backups, and one test restore was done. Its database is empty.
3. Find the names on hk (Dokploy names its containers after the app):

   ```sh
   SERVER=$(docker ps --format '{{.Names}}' | grep unbored | head -n1)   # check it is the Server
   IMAGE=$(docker inspect "$SERVER" --format '{{.Config.Image}}')
   VOLUME=$(docker inspect "$SERVER" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
   NETWORK=$(docker inspect "$SERVER" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' | awk '{print $1}')
   ```

4. Put the target URL in the shell without echoing it (the password stays out of history and `ps`):

   ```sh
   read -rs DATABASE_URL && export DATABASE_URL
   ```

5. Dry run against the live file, while the Server keeps serving:

   ```sh
   docker exec -u node -e DATABASE_URL "$SERVER" \
     node --experimental-sqlite --experimental-strip-types scripts/sqlite-to-postgres.ts --dry-run
   ```

   It prints one `table: N rows, checksum … ok` line per table and ends with `Dry run ok, rolled back: 18 tables, N rows verified`. Fix anything it reports before the window.

The window (Companion saves fail meanwhile; unsent Sections stay unsent and go with the next save):

6. Stop the Server in Dokploy (Stop, not Redeploy). `docker ps` no longer lists `$SERVER`.
7. Keep a copy of the file next to it, with its WAL if there is one:

   ```sh
   docker run --rm -v "$VOLUME":/data --entrypoint sh "$IMAGE" -c \
     'mkdir -p /data/pre-postgres && cp -a /data/unbored.sqlite* /data/pre-postgres/ && ls -l /data/pre-postgres'
   ```

8. Transfer for real, from a one-off container of the same image on the same network and volume:

   ```sh
   docker run --rm -u node --network "$NETWORK" -v "$VOLUME":/data -e DATABASE_URL \
     --entrypoint node "$IMAGE" \
     --experimental-sqlite --experimental-strip-types scripts/sqlite-to-postgres.ts
   ```

   It must end with `Committed: 18 tables, N rows verified`, with the same counts as the dry run (plus whatever was written since). On `Transfer FAILED, nothing committed` the target is unchanged: start the Server again without `DATABASE_URL` and investigate.
9. Set `DATABASE_URL` (and `DATABASE_POOL_MAX` if not 10) in the Server's Dokploy environment, then Deploy.
10. Verify:
    - The log has `Postgres schema ready (up to date); every table on Postgres, the SQLite file untouched` and `Upload inbox on`. A `Retention:` line on the first start is normal: it drops the empty month partitions older than 13 months.
    - `https://unbored.kosarev.space/health` answers `{"ok":true,...}`.
    - MCP `data_catalog` and `list_errors` show the same Accounts and Characters as before; `get_current_plan` still returns the last plan.
    - After a Companion save the log shows `POST /v1/snapshot 202`, and MCP `list_failed_uploads` stays empty.

Rollback: remove `DATABASE_URL` from the Server's Dokploy environment and Deploy. The Server opens the untouched `/data/unbored.sqlite` again (the copy in `/data/pre-postgres/` is the spare). Anything written while on Postgres is lost, which is acceptable in the first days. To cut over again later, run step 8 with `--force` (the target then has rows). Keep the SQLite file for 30 days after a stable cutover, then delete it and `/data/pre-postgres/`.

## Roadmap

- More exploration continents once their achievement ids are confirmed on 12.1.5.
- A starter set of rare tracking quests, after someone dumps a few with `/dump C_QuestLog.IsQuestFlaggedCompleted`.
- Midnight zone rows, once ui map ids are confirmed in `/unbored where`.
- Transmog-only dungeon trips, using the `appearances` field that Farm already understands.
- A real options panel. The slash commands cover the MVP.
- Collections with missing parts (pets, transmog sets, recipes) are deferred to 0.11 (D212). The cheapest first step is a transmog set Section from `C_TransmogSets` (client data, no invented ids).
- Open catalog ids (Timewalking quests, prices, weeks, faction mounts) and how to get them: [data-sources.md](data-sources.md).

## Known limits

These are choices, not silent guesses. Push back if one of them is wrong.

- The first Skip moves the task to the end of the queue. The second Skip drops it for this session.
- Proximity auto-complete defaults to 40 yards and only applies to completion kind `proximity` (treasures and explicit go-to tasks). Reaching a raid door does not finish the raid.
- "Local events" in Quests are bonus objectives and map task pins from `C_TaskQuest.GetQuestsOnMap`, not a separate event board.
- Holiday rows match a calendar event by Holiday.db2 id, by `iconTexture`, or by the English title. Hallow's End uses textures `235460`, `235461`, and `235462` (what HandyNotes reads from `C_Calendar.GetDayEvent`). Those are not the same number as Holiday.db2 id 324, which is kept only as an extra key. Other holidays fall back to the English title until their texture ids are confirmed.
- `Data/Rares.lua` has Huolon (Timeless Isle, daily tracking quest 33311 from the wowhead quest page). No other tracking quests are shipped.
- Raid doors use the Wowhead entrance guide (guide 8974), converted from 0–100 to 0–1. Several of those figures are whole numbers.
- This tree is checked against the API wiki and the two Lua test suites; the live-client checklist is [`TESTING.md`](../TESTING.md).

## Plan runner

[ADR 0058](adr/0058-plan-runner.md) adds an outside Plan runner using a runner token for claims and a short-lived lease token for MCP. Start a local Server with `UNBORED_PLANNER_ROUTE=runner`, `UNBORED_RUNNER_TOKEN` (at least 32 characters, distinct from the two existing tokens), the usual companion/planner tokens, and a writable `UNBORED_DATA_DIR`. Leave `UNBORED_PLANNER_WEBHOOK_URL` unset to test without fallback, or set it to a local webhook receiver. `UNBORED_RUNNER_FALLBACK_SECONDS` defaults to 90. Either storage backend supports the same API.

Any runner can use this loop. Set `SERVER=http://localhost:3000` and load `RUNNER_TOKEN` from your local environment. Submit a Request through the Companion API, then claim:

```sh
curl -sS -X POST "$SERVER/v1/runner/claim?wait=25" \
  -H "Authorization: Bearer $RUNNER_TOKEN"
```

Save the returned `leaseId` as `LEASE_ID` and `leaseToken` as `LEASE_TOKEN`. Follow `prompt.text`, beginning with `get_request`; the prompt version is stored on the job. Use the lease token for MCP, never the runner token:

```sh
curl -sS "$SERVER/mcp" \
  -H "Authorization: Bearer $LEASE_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_request","arguments":{}}}'

curl -sS -X POST "$SERVER/v1/runner/leases/$LEASE_ID/heartbeat" \
  -H "Authorization: Bearer $RUNNER_TOKEN"

curl -sS -X POST "$SERVER/v1/runner/leases/$LEASE_ID/finish" \
  -H "Authorization: Bearer $RUNNER_TOKEN" -H 'Content-Type: application/json' \
  --data '{"ok":false,"error":"The runner stopped before answering."}'
```

Heartbeat comfortably before 180 seconds; an attempt has a 15-minute hard cap. Answer via `put_plan`, `answer_request` or `fail_request` with the leased Request id. Fix validation warnings within that lease. A successful answer invalidates the lease token; finish can acknowledge it with `{"ok":true}`. An unanswered finish retries after 15 then 60 seconds, up to three attempts. See [the runner API](../apps/server/README.md#plan-runner) for responses and log formats. `runner.test.ts` exercises HTTP and MCP against both backends when `UNBORED_TEST_DATABASE_URL` is set.


### Plan outcomes and place data

[ADR 0068](adr/0068-plan-outcome.md) and the [contract](contract/README.md#plan-outcome-and-short-text) define required planner outcome targets, optional chance bonuses, shorter text and `get_place`. Every Plan promises one reachable result; the planner names it in the title and completes it in the last Step, including Surprise me and fun. Place lookup, instance guides and Plan validation read the imported Game DB. Missing or ambiguous evidence stays unknown; none of these paths downloads CSV during a request. Unit fixtures cover projection, absent data and ambiguous POIs; MCP storage/delivery tests run on both database backends. The Companion forwards `outcome` and `bonus` to Lua; 0.11 ignores them safely and shows the planner's explicit bonus line in the Step note. HTTP and MCP reject absent/invalid/already-owned outcomes and leaves the lease open for correction; missing snapshot evidence is a nonblocking `notes` entry. Delivery schemas still accept older stored Plans without a target.


`get_place` and `get_instance_guide` read one build of the Game DB per call, including enUS or ruRU names. Place lookup projects only the requested quest and flight points; guides traverse indexed achievement trees and journal relationships. `UiMapGroupMember` supplies journal floor labels. Journal creature evidence still uses the existing bounded Blizzard Game Data API adapter when configured; it never treats creature display ids as NPC ids.

Migration `0013_game_guides.sql` adds relationship indexes through normal Server startup. No database tables are added: SQLite transfer/workflow counts are now **24**. The additional DB2 table is stored in the existing `game.rows`. The build watcher upgrades an earlier import of the same build automatically. An operator can prepare or refresh all tables explicitly with the existing command (do not run against production as part of development):

```sh
node apps/server/scripts/import-game.ts <current-live-build>
```

Use the `UNBORED_SERVER_URL` and `UNBORED_PLANNER_TOKEN` environment documented under Game DB above. Before any build has been imported, place lookup returns unknown facts with `Game DB unavailable`, and instance guides return an explicit import-needed error. A failed import preserves the previous complete build. Legacy `wago` files are no longer used by place lookup, instance guides or Plan validation; the separate `resolve_criteria` downloader still uses that directory.

Relationship reads return at most 257 rows: the extra row detects overflow at the 256-result limit. Truncated geometry cannot prove a unique destination; oversized guide relationships fail explicitly instead of returning a misleading partial guide. Criteria trees and child achievement graphs retain their cycle and size guards.

`apps/server/test/places-load.test.ts` imports generated production-size map/quest geometry and journal/criteria data, then sends 50 concurrent MCP place calls and 50 guide calls alongside health requests, on both enabled database backends. It bounds lookup/submission time, event-loop p95 and maximum delay, response size and extra RSS without network access. `game-content-load.test.ts` separately bounds import memory and lag. Two test processes keep the suite within the development machine's CPU budget.

## Website game media

[ADR 0077](adr/0077-game-media.md) stores game art in `content.media` and hashed AVIF/WebP files.
Migration `0021_media_pipeline.sql` records each row's nullable `pipeline_version`; NULL means legacy output.
Migration `0020_game_media.sql` grants SELECT to `unbored_web` only when that role exists.
This is a Postgres-only content table; SQLite transfer/workflow counts remain **24**.
The Server and website both use `UNBORED_MEDIA_DIR` (default `/srv/media`); the website also
accepts `NUXT_MEDIA_DIR` through runtime config. The shared named volume is `unbored-media`,
mounted at `/srv/media` in both containers, read-only on the website. The Server entrypoint
creates and chowns its media directory for the node user. Provisioning the shared mount is
an operator step; this change does not alter deployment configuration.

The Server reuses its Blizzard OAuth client (`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`,
`BLIZZARD_REGION`, default `us`). Without credentials, automatic media work is disabled.
It uses static regional documents with `en_US`, allows only Blizzard API/OAuth/render hosts,
rejects redirects, and limits each download to 10 seconds and 2 MB (JSON to 256 KB).
`sharp` ships its platform binary with the Server's production dependencies. Icons retain
source size up to 56 px; renders retain their full frame and have 320/640 variants; tiles
have 300/600 variants. Own images use 320/640 variants. Every target width is capped at
the source width, and duplicate sizes are omitted: a 600x600 render yields 320x320 and
600x600, never an upscaled 640x640. Every size has AVIF and WebP. The pipeline only
compresses, converts and resizes: no trimming, cropping, keying, recoloring, rotation,
flattening or focal-point processing. Fitting happens only in the site's CSS: renders use
centered `object-fit: contain` on `--render-bg: #181818`; photos and tiles use `cover`.
Filenames hash the pipeline version (currently `2`, followed by `:`) and the source bytes,
so changing the pipeline cannot reuse a URL cached as immutable for a year.

After owner HTTP or MCP publication commits, a bounded in-process queue syncs its items,
hero, figures and inline references. Publishing never waits for downloads. Restarting can
lose pending work; the explicit sync command retries it. Failures log a short message and
leave existing art available. A daily job (also run at startup) visits Blizzard rows older
than 25 days or produced by an older pipeline in batches of 20, considering both the check and download timestamps so
sharing an older source cannot extend its lifetime. A 404 removes the missing art; transient failures retry on
the next pass, and assets that cannot be refreshed are removed at 30 days. Stop waits for
current work before closing the database. Own images are never automatically refreshed.

Commands inside the Server container (or prefix with `apps/server/` from the repo root):

```sh
node scripts/media.ts sync
node scripts/media.ts sync --slug top-mounts-to-get-first
node scripts/media.ts refresh
node scripts/media.ts add-image /path/to/our-screenshot.png --ref-kind screenshot --alt 'Our character in Stormwind'
node scripts/media.ts gc
```

They use `DATABASE_URL` directly; normal Server startup applies the migration first.
After upgrading the pipeline, run plain `node scripts/media.ts sync` once to re-process
old-pipeline Blizzard rows, including recently fetched rows and stored references no
published page currently uses. No `--force` flag is needed. A scoped `sync --slug` upgrades
only that page's references; `refresh` also picks up older pipeline versions. Current
conversions of a shared source are reused; older conversions never satisfy the cache.
Own images have no retained source file: re-run `add-image` with each original and update
its authored `hero.image` / `figure.image` hash. Existing own-image rows remain available.
Old Blizzard files become unreferenced when their rows are updated; run `gc` later (after
the one-day grace period) to remove them. Failed conversions retain the previous row and
are retried on the next sync/refresh.
`add-image` accepts only our own/licensed images, caps input at 20 MB, and prints the
16-character hash for `hero.image` or `figure.image`. `gc` deletes unreferenced variants
and abandoned temporary files only after one day, protecting writes awaiting a row commit.
It can be run after refresh or an import; it does not delete referenced files.

Authored items optionally carry `media: { icon: fileDataId, display: creatureDisplayId }`.
Mount and currency icons require the authored file data id; no spell-media API is used.
A page can add `hero: { kind: 'mount' | 'pet' | 'instance', id, alt? }` or
`hero: { image: '<16 lowercase hex>', alt }`. A figure block has `type: 'figure'`, `alt`,
optional `caption`, and exactly one of `ref: { kind, id }` or `image: '<16 lowercase hex>'`.
Paragraph/list text accepts at most 20 inline references per page, using
`[[mount:460]]`, `[[pet:1890]]`, `[[achievement:6]]`, `[[item:84101]]`, `[[toy:84101]]`,
or `[[currency:3008]]`. Invalid delimiters, unknown kinds and nonpositive ids are rejected.
These additions share validation helpers in `packages/contracts/src/game-media.ts`.

Public page APIs expose `media`, a map keyed by `kind:id` (or `image:hash` for own images)
with `icon`, `render`, `tile` or `image`, each containing variants, width, height, name and
alt. One query gathers the page's referenced media. Catalog summaries include up to six
available item icons in authored order, each `{ kind, id, icon }`, with no per-card query.
The site streams `/media/<hash>-<width>.avif|webp` with immutable one-year caching;
invalid or missing filenames get a 404 cached for 60 seconds. All other filenames are
rejected before filesystem access. Hero, tooltip, row-thumbnail and figure render frames
all contain the complete image on the matching solid background (ADR 0078).

Tests use generated images and fake HTTP responses, never live Blizzard credentials.
Run with local PostgreSQL 18 (the role must be able to create test databases):

```sh
UNBORED_TEST_DATABASE_URL="$(pg-test url postgres)" \
UNBORED_WEB_TEST_DATABASE_URL="$(pg-test url postgres)" pnpm test:js
```

The tests cover resolution, source restrictions, conversion, publish isolation, refresh,
collection of unused files, new/old content bodies, database page/card reads and file serving.
