# Agents

Goal: a helper players want to use, that never annoys and genuinely helps.

Read these first, before you guess:

1. [`CONTEXT.md`](CONTEXT.md): the glossary. Use its words in code, docs, and UI copy, and keep its _Avoid_ words out of anything the player sees.
2. [`docs/adr/`](docs/adr/): the decisions behind the product. Work within them; if a change contradicts one, ask the owner first.

Process: decisions that are hard to reverse or that players will see are grilled with the owner and recorded as an ADR before they are built. Do not invent product behaviour. If you are unsure, leave a `TODO` in the code and note it in the Friction section of your report instead of improvising.

Hard to reverse means things like data flow, privacy, pairing, what the addon may do under Blizzard rules, and how Plans are made. Record each decision as the next numbered ADR: a title, `Status: accepted`, and one to three sentences. Link it from `docs/adr/README.md`.

Wisp's voice is warm, short, with light humour and no cringe. Plans are 3 to 7 Steps, one shown at a time, the full list on click. Every UI string goes in `Core/Locale.lua`, in English and Russian.

Every state the player can be in has a line from Wisp and a way forward: no silent waits, no raw errors or ids, no slash command or manual `/reload` needed. Never reload per message (ADR 0012): answer locally first, let the Companion prepare the rest in the background, and offer one Refresh only when something is waiting. No clipboard tricks. Never touch protected or secure frames outside a hardware event, and add no overlays on game UI. [`TESTING.md`](TESTING.md) is the owner's live-client checklist (in Russian); update it when a player-visible flow changes.

Request payloads live in `packages/contracts/`; the Companion and Server tests both read them, so change both sides together. A short pointer is in `docs/contract/`.

Commits and PR titles use Conventional Commits with a scope, for example `feat(addon): ...`, `fix(companion): ...`, `docs: ...` (types feat, fix, perf, refactor, docs, chore, test, ci). Release notes are generated from them ([ADR 0022](docs/adr/0022-releases-and-docs.md)), so write the subject as a short sentence a player could read. `README.md` is for players; build, data and release details go in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

Checks that CI runs: `pnpm test` (addon luacheck and Lua tests, `vp test` for the Server and contracts, and `cargo test --lib --no-default-features` in `apps/companion/src-tauri/`). `pnpm lint` also runs `vp check`, cargo fmt, and clippy. The Windows installer is built by `.github/workflows/companion.yml`.
