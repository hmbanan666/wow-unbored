# Agents

Read these first, before you guess:

1. [`CONTEXT.md`](CONTEXT.md): the glossary. Use its words in code, docs, and UI copy, and keep its _Avoid_ words out of anything the player sees.
2. [`docs/adr/`](docs/adr/): the decisions behind the product. Work within them; if a change contradicts one, ask the owner first.

When you make a decision that is hard to reverse (data flow, privacy, pairing, what the addon may do under Blizzard rules, how Plans are made), add the next numbered ADR: a title, `Status: accepted`, and one to three sentences. Link it from `docs/adr/README.md`.

Wisp's voice is warm, short, with light humour and no cringe. Plans are 3 to 7 Steps, one shown at a time, the full list on click. Every UI string goes in `Core/Locale.lua`, in English and Russian.

Checks that CI runs: `luacheck .`, `lua5.1 tests/run.lua`, `lua5.1 tests/ui.lua`, `npm test` in `server/`, and `cargo test --lib --no-default-features` in `companion/src-tauri/`.
