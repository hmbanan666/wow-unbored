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

## Packed id sets

A big list of ids is stored as a few strings instead of thousands of numeric literals, so SavedVariables stay small and far from the game's 262,144 unique literal limit.

- `["ids1", "<chunk>", ...]`: the ids, unique and sorted ascending. The first is written as is, every next one as the gap to the previous one, each in lowercase base36 (`0-9a-z`), joined by `,`.
- Chunks split only between numbers and hold at most 4,000 characters. Joining the chunks with `,` gives the whole list; the gaps run on across chunks. An empty set is `["ids1"]`.
- `["idv1", ...]` is the same with whole-number values after each id: `<gap>:<value>[:<value>...]`, all base36. Used for item counts (`bags`, `bank`, `reagentBank`, `warband`: one value, the count) and pet species (`pets.species`: count, best level, best quality).

Example: ids `6, 7, 11, 25, 1792, 2187` pack to `["ids1", "6,1,4,e,1d3,az"]`.

One packer in the addon ([`addon/Core/Pack.lua`](../../addon/Core/Pack.lua)), unpackers in Rust (`apps/companion/src-tauri/src/snapshot.rs`) and TypeScript (`packages/contracts/src/index.ts`), all tested on [`packed-ids.json`](../../packages/contracts/fixtures/packed-ids.json).

## Entity markup

Plan text may carry Entity tokens such as `{item:ID}`; see [`packages/contracts/markup.md`](../../packages/contracts/markup.md).
