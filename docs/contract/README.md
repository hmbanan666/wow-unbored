# Contracts

The payloads the Companion posts and the Server accepts live in [`packages/contracts`](../../packages/contracts). That package holds the TypeScript types, the Zod schemas, and the JSON Schema files. The Rust contract tests read the JSON Schema. The SavedVariables fixtures (`plan.lua`, `item.lua`, `question.lua`, `snapshot.lua`) and the JSON fixtures (`requests.json`, `plan.json`, `profile.json`, `snapshot.json`, `packed-ids.json`, `markup.json`) are in `packages/contracts/fixtures`. The addon (Lua), Companion (Rust) and Server (TypeScript) tests all read the same fixtures; change every side together.

## Game data snapshot

`POST /v1/snapshot` ([`snapshot.schema.json`](../../packages/contracts/schema/snapshot.schema.json), ADRs 0028 and 0029) carries the Sections of one Character and its Account that changed since the last upload:

```json
{
  "schema": 2,
  "account": "111111#1",
  "character": "Mira",
  "realm": "Silvermoon",
  "savedAt": 1761830400,
  "sections": {
    "questsDone": { "scope": "char", "v": 1, "at": 1761829010, "src": "login", "hash": "<sha256>", "body": { "count": 387, "ids": ["ids1", "..."] } }
  },
  "dropped": { "account": { "calendar": { "at": 1761829400, "bytes": 2048 } } }
}
```

The body is gzip with `Content-Encoding: gzip`, at most 4 MB compressed. `scope` is `char` (from `UnboredCharDB.data`) or `account` (from `UnboredDB.data`). `hash` is the lowercase hex sha256 of the **canonical JSON** of `body`: object keys sorted, no whitespace, integers without a fraction, strings as JSON writes them with non-ASCII left as UTF-8. The Server accepts unknown Sections and future versions and stores them raw. Every Section, with its API, size and timing, is listed in [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md#game-data-sections).

The answer depends on where the Server stores data ([ADR 0057](../adr/0057-postgres-storage-and-async-ingest.md)). On SQLite (no `DATABASE_URL`) it ingests on the request and answers `200 {"ok": true, "account", "character", "realm", "stored": [...], "unchanged": [...], "unknown": [...], "stale": false, "sections": {"account:mounts": "stored"}}`. On Postgres it checks the upload the same way (401, 400 and 413 are unchanged), queues it and answers `202 {"ok": true, "upload": "<id>", "state": "queued"}`; the same body sent again by the Account returns the same id and its current state. A Companion treats either 2xx as sent.

`GET /v1/uploads/<id>` with the same device bearer returns `{ "id", "state": "queued" | "done" | "failed", "receivedAt", "processedAt", "attempts", "result", "error" }`. `result` (when `done`) holds `stored`, `unchanged`, `unknown`, `stale` and `sections`; `error` is the last failure. Another device's id, an unknown id, or a Server on SQLite answers `404`. A new Request (`POST /v1/requests`) and the planner's data tools wait up to 10 s for that Account's queued uploads, so they read the save that came just before.

[ADR 0063](../adr/0063-section-freshness.md) compares each Section by its own integer `at`, clamped to at most the Server time + 300 seconds. Without `at`, it uses the Snapshot `savedAt`; without either time, it accepts the Section. An older key is `stale`; an equal version and body hash is `unchanged` and advances the stored key when newer; otherwise it is `stored`. The Character row still follows the Snapshot `savedAt`.

Both response paths share the [result schema](../../packages/contracts/schema/snapshot-result.schema.json) and [fixture](../../packages/contracts/fixtures/snapshot-result.json). `sections` maps every uploaded `"<scope>:<name>"` to `"stored"`, `"unchanged"` or `"stale"`, including unknown Sections. The existing arrays keep bare Section names, and `stale` is true if any Section was stale. Older Companions need no changes.

Self-check diagnostics reuse the account `errors` Section, v1, and its existing row fields (see [`selfcheck.json`](../../packages/contracts/fixtures/selfcheck.json)). `where` is `selfcheck`; `text` holds the game build and counts (300 characters maximum), and `stack` holds value-free API names, statuses and shapes (8,000 bytes in the addon, 8,000 characters on the Server). Ordinary error stacks keep their 800-character cap. The Companion forwards the Section unchanged; `list_errors` exposes the complete report without a new record kind or database migration.

## Packed id sets

A big list of ids is stored as a few strings instead of thousands of numeric literals, so SavedVariables stay small and far from the game's 262,144 unique literal limit.

- `["ids1", "<chunk>", ...]`: the ids, unique and sorted ascending. The first is written as is, every next one as the gap to the previous one, each in lowercase base36 (`0-9a-z`), joined by `,`.
- Chunks split only between numbers and hold at most 4,000 characters. Joining the chunks with `,` gives the whole list; the gaps run on across chunks. An empty set is `["ids1"]`.
- `["idv1", ...]` is the same with whole-number values after each id: `<gap>:<value>[:<value>...]`, all base36. Used for item counts (`bags`, `bank`, `reagentBank`, `warband`: one value, the count) and pet species (`pets.species`: count, best level, best quality).

Example: ids `6, 7, 11, 25, 1792, 2187` pack to `["ids1", "6,1,4,e,1d3,az"]`.

One packer in the addon ([`addon/Core/Pack.lua`](../../addon/Core/Pack.lua)), unpackers in Rust (`apps/companion/src-tauri/src/snapshot.rs`) and TypeScript (`packages/contracts/src/index.ts`), all tested on [`packed-ids.json`](../../packages/contracts/fixtures/packed-ids.json).

## Entity markup

Plan text may carry Entity tokens such as `{item:ID}`; see [`packages/contracts/markup.md`](../../packages/contracts/markup.md).

## Plan outcome and short text

[ADR 0068](../adr/0068-plan-outcome.md) adds one optional `outcome` object to Plan v1:

| Kind | Fields | Live comparison |
| --- | --- | --- |
| `rep` | `factionID`, `standing` (integer 1–8) | `C_Reputation.GetFactionDataByID`: `reaction >= standing`; 6 is Honored. Use `currentStanding`, `currentReactionThreshold`, `nextReactionThreshold` for progress within the current standing. |
| `renown` | `factionID`, `level` | `C_MajorFactions.GetMajorFactionData`: `renownLevel >= level`; current level progress comes from its earned reputation and threshold. |
| `level` | `level` | `UnitLevel("player") >= level` |
| `achievement` | `achievementID` | Achievement completion from the game |
| `mount` | `id` | Mount id, as `{mount:ID}`, collected in the mount journal |
| `pet` | `id` | Species id, as `{pet:ID}`, owned in the pet journal |
| `toy` | `id` | Item id, as `{toy:ID}`, owned in the toy box |
| `item` | `id` | Item id, as `{item:ID}`, at least one currently held |

Every id and level is a positive integer up to 2,147,483,647. There are no current counts, percentages or Server-supplied thresholds. Reputation targets describe ordinary faction standing, not friendship ranks or paragon cycles. `outcome` does not auto-complete Steps. Invalid outcomes are dropped with a warning; the Plan stays usable. Extra outcome fields are stripped. The 0.11 addon already ignores unknown Plan fields in `CleanPlan`, so new Plans remain readable; this part adds no progress chip yet. ADR 0066 still adapts long notes in previously stored Plans for older addons.

Step titles: 70 Unicode characters, with a 240-byte compatibility ceiling. Optional `why`: 80 UTF-8 bytes; Step `note`: 400 bytes; Plan `details`: 200 bytes. Server validation shortens excess text at a word with a warning, without splitting Unicode or entity tokens. These are output limits, not rejection rules for submissions. See the four-Step [Sporeggar fixture](../../packages/contracts/fixtures/plan-outcome.json). Reputation Conditions are deferred; existing Condition kinds are unchanged.

### Place lookup

`get_place({mapID, questID?, npcID?, lang?: "en" | "ru"})` takes a **UiMap** id. It returns `{mapID, name, continent: {mapID, name} | null, expansion, label, questPoints, flightPoints, nearestFlightPoint, unavailable}`. Names, labels and the nearest point can be null. Quest points contain `{mapID, x, y, questID}`; flight points contain `{mapID, x, y, id, name}`. Coordinates are fractions. The label includes the parent continent, for example `Shattrath City (Outland)`; expansion labels and NPC positions are currently unknown. Nearest means map distance from one unambiguous quest point, not travel distance, faction access or an unlocked flight.

The Server reuses `UiMap` and the Wago CSV cache, adding bounded reads of `UiMapAssignment`, `QuestPOIBlob`, `QuestPOIPoint` and `TaxiNodes` (24 hours, 2 MB per table). Missing, malformed or oversized tables stay unavailable. Quest polygons, ambiguous map assignments, instance entrances and portal paths stay unknown. No numeric id coincidence supplies a place. Field definitions: [game table definitions](https://github.com/wowdev/WoWDBDefs/tree/master/definitions); world-to-map axes follow [DB2 map projection](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/DataStores/DB2Stores.cpp).

Plan submission reads only fresh cached points, with no network wait. A unique single-point quest POI on the same map replaces a point more than 0.05 map distance away, with a warning. Quest references come from entity tokens, Conditions and quest completion. Ambiguous or unavailable quest POIs never justify moving a Step to a guessed location; unsupported points are omitted. A quest reference alone is not coordinate evidence. Unreferenced points and route stops must match a known quest POI, flight point or cached journal encounter point within 0.005; unsupported points are dropped with warnings. Starting-position points are still dropped, including corrected points, route stops and nested proximity completion checks. The same grounding applies to MCP and HTTP submissions before storage. Planner-supplied NPC side tables are not evidence.
