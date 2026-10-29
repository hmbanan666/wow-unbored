# Agents

Goal: a helper players want to use, that never annoys and genuinely helps.

Read these first, before you guess:

1. [`CONTEXT.md`](CONTEXT.md): the glossary. Use its words in code, docs, and UI copy, and keep its _Avoid_ words out of anything the player sees.
2. [`docs/adr/`](docs/adr/): the decisions behind the product. Work within them; if a change contradicts one, ask the owner first.

Process: decisions that are hard to reverse or that players will see are grilled with the owner and recorded as an ADR before they are built. Do not invent product behaviour. If you are unsure, leave a `TODO` in the code and note it in the Friction section of your report instead of improvising.

Hard to reverse means things like data flow, privacy, pairing, what the addon may do under Blizzard rules, and how Plans are made. Record each decision as the next numbered ADR: a title, `Status: accepted`, and one to three sentences. Link it from `docs/adr/README.md`.

Wisp's voice is warm, short, with light humour and no cringe. Plans are 3 to 7 Steps, one shown at a time, the full list on click. Every UI string goes in `Core/Locale.lua`, in English and Russian.

Checks that CI runs: `luacheck .`, `lua5.1 tests/run.lua`, `lua5.1 tests/ui.lua`, `npm test` in `server/`, and `cargo test --lib --no-default-features` in `companion/src-tauri/`.
