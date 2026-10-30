# Agents

Goal: a helper players want to use, that never annoys and genuinely helps.

Read these first, before you guess:

1. [`CONTEXT.md`](CONTEXT.md): the glossary. Use its words in code, docs, and UI copy, and keep its _Avoid_ words out of anything the player sees.
2. [`docs/adr/`](docs/adr/): the decisions behind the product. Work within them; if a change contradicts one, ask the owner first.

Process: decisions that are hard to reverse or that players will see are grilled with the owner and recorded as an ADR before they are built. Do not invent product behaviour. If you are unsure, leave a `TODO` in the code and note it in the Friction section of your report instead of improvising.

Hard to reverse means things like data flow, privacy, pairing, what the addon may do under Blizzard rules, and how Plans are made. Record each decision as the next numbered ADR: a title, `Status: accepted`, and one to three sentences. Link it from `docs/adr/README.md`.

Wisp's voice is warm, short, with light humour and no cringe. Plans are usually 3 to 7 Steps, one shown at a time, the full list on click; a Plan for one goal covers all of it and has no time budget (ADR 0037). Every UI string goes in `Core/Locale.lua`, in English and Russian.

Every state the player can be in has a line from Wisp and a way forward: no silent waits, no raw errors or ids, no slash command or manual `/reload` needed. Never reload per message (ADR 0012): answer locally first, let the Companion prepare the rest in the background, and offer one Refresh only when something is waiting. No clipboard tricks. Never touch protected or secure frames outside a hardware event, and add no overlays on game UI. [`TESTING.md`](TESTING.md) is the owner's live-client checklist (in Russian); update it when a player-visible flow changes.

Request, Plan, snapshot and markup payloads live in `packages/contracts/` (`schema/`, `fixtures/`, `markup.md`); the addon, Companion and Server tests all read the same fixtures, so change every side together. A short pointer, including the Packed id set spec, is in `docs/contract/`.

Game data rules (ADRs 0027-0031): collect only the player's own characters and Account. Never read other players (chat, whispers, mail sender/subject/body, group or guild rosters, names, combat log), never read in combat (`InCombatLockdown()`), and drop every value where `issecretvalue(v)` is true. Read at three moments only: the staged login pass (PLAYER_ENTERING_WORLD + 10 s, ~4 ms per frame), settled event deltas, and while a window (bank, profession) is open; logout only stamps time. Each SavedVariables file stays under 400 KB (Character) / 300 KB (Account) target, 1 MB cap and 30k unique literals; big id lists go through `Core/Pack.lua` as Packed id sets. Every Section is listed in `docs/DEVELOPMENT.md`; add yours there.

Commits and PR titles use Conventional Commits with a scope, for example `feat(addon): ...`, `fix(companion): ...`, `docs: ...` (types feat, fix, perf, refactor, docs, chore, test, ci). Release notes are generated from them ([ADR 0022](docs/adr/0022-releases-and-docs.md)), so write the subject as a short sentence a player could read. `README.md` is for players; build, data and release details go in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

Checks that CI runs: `pnpm test` (addon luacheck and Lua tests, `vp test` for the Server and contracts, and `cargo test --lib --no-default-features` in `apps/companion/src-tauri/`). `pnpm lint` also runs `vp check`, cargo fmt, and clippy. The Windows installer is built by `.github/workflows/companion.yml`.
