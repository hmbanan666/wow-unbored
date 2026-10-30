# Brand

How Unbored names and shows itself. Bory and this palette shipped in 0.8; some code names inside still say `wisp` (for example the `MENU_WISP_SIZE` locale key), which players never see.

## Names

| What | Name |
| --- | --- |
| Project and brand | **Unbored** |
| Description line | "Unbored for World of Warcraft" |
| Windows app (Tauri) | **Unbored Companion** |
| In-game addon | **Unbored** |
| Mascot | **Bory** |

- "WoW" and "World of Warcraft" are Blizzard trademarks. Use them only to describe what Unbored works with ("for World of Warcraft"), never inside a product name: no "WoW Unbored", "Unbored WoW" or "WoW Companion".
- No Blizzard logos, game art, icons or screenshots in the brand, the store pages or the site. In-game screenshots are fine where they show Unbored working.

## Mascot

**Bory** is a ginger cat. The name is said like the Russian "Бори" (BOR-ee). He lives in the addon, the Companion, and later the site.

Bory replaced Wisp in 0.8. Wisp's art is gone; "Wisp" stays only in old records (ADRs, decision logs, past release notes).

## Slogan

> Bored? Bory's got a plan.

## Palette

Warm, matched to Bory, with no teal anywhere. Defined once: `ns.PALETTE` in `addon/Core/Namespace.lua` and the CSS variables at the top of `apps/companion/ui/app.css`.

| Token | Hex | Used for |
| --- | --- | --- |
| gold | `#E8B04A` | the accent: borders, glyphs, links in the window |
| highlight | `#F5D27A` | titles, the selected chip, the ready glow |
| burgundy | `#7A2230` | Bory's scarf: selected fills, the error glow |
| bg | `#1E1410` | bubbles, the window |
| raised | `#2A1C15` | buttons, chips, the disc behind Bory |
| cream | `#EADBC0` | body text |
| muted | `#B8A385` | secondary text |
| faint | `#806E5C` | done and skipped rows |

## Portrait

The portrait is layers, never one baked picture:

1. **Disc**: a dark warm circle behind him, so he reads on any game scene (in the window, CSS draws it).
2. **Bory**: his bust on a transparent background, cut round to sit inside the ring.
3. **Frame**: a thin gold ring with a soft sheen from the top left, no ornaments, drawn on top.

Moods swap only the Bory layer: idle, thinking (working on a plan), waiting (a yawn, when a plan takes long or the PC waits for approval) and happy (something is ready). The ring never moves against him: in the game the bob moves all layers together.

`python3 art/build_assets.py` makes every texture, the window pictures and the icons from `art/bory/`.
