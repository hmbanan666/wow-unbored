# 0077. Game media on the website

Status: accepted (2026-11-04)

## Context

A player who lands on playunbored.com from Google has never seen Unbored. Text-only lists of mount, pet and achievement names do not tell them at a glance what a page is about. They need the game's own icons and pictures, plus a little of the "hover to see it" feel players know from database sites. The site stays an authored portal (ADR 0072, 0074): no page per item, mount, NPC or achievement.

## Decision

### Sources (only what we may use)

1. **Blizzard Game Data API media**, fetched by the Server, which already holds the API client:
   - item and toy icons: `/data/wow/media/item/{itemId}` (content stores a toy by its item id, so a toy uses the same endpoint).
   - achievement icons: `/data/wow/media/achievement/{id}`.
   - battle pet icon: `/data/wow/pet/{speciesId}`.icon; pet render: `.creature.id` -> `/data/wow/creature/{id}`.creature_displays[0] -> `/data/wow/media/creature-display/{displayId}` (asset `zoom`, 600x600).
   - mount render: `/data/wow/mount/{mountId}`.creature_displays[0] -> creature-display media as above.
   - dungeon/raid tile: `/data/wow/media/journal-instance/{id}` (asset `tile`, 600x300).
2. **Blizzard render CDN by file data id** where the API has no media document: mount icons (spell icon, `SpellMisc.SpellIconFileDataID` of `Mount.SourceSpellID`) and currency icons (`CurrencyTypes.InventoryIconFileID`). The URL is `https://render.worldofwarcraft.com/{region}/icons/56/{fileDataId}.jpg`, the same host the API's own media documents point at. The authored content carries the file data id (from the game client data of the current build, ADR 0071).
3. **Our own images** (screenshots we capture ourselves), imported by the owner with a command. Until we have one, a figure slot renders nothing.

Not allowed: hotlinking or copying images from Wowhead or any other fan site, images from search results, and screenshots we did not take or license. Item links to a database site stay plain outbound links.

Blizzard Developer API terms: data is kept at most 30 days, so the Server refreshes every stored Blizzard asset before it is 30 days old and deletes one Blizzard no longer serves. Calls stay far below the hourly limit (one sync per publish, a daily refresh in small batches). The site footer credits Blizzard: "World of Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. Game icons and renders come from the Blizzard Game Data API. Unbored is a fan project, not affiliated with Blizzard."

### Storage and serving

- One Docker named volume `unbored-media` on de2, mounted at `/srv/media` in both the Server (writes) and the website (reads). Path from `UNBORED_MEDIA_DIR`, default `/srv/media`. The Server entrypoint chowns it like `/data`.
- The pipeline only compresses, converts and resizes; it never crops, trims, keys, recolors or otherwise edits an image. Fitting an image into a frame is the site's job (CSS object-fit).
- The Server fetches each source once, converts with `sharp` and writes content-hashed files: `<sha256 of pipeline version + source bytes, 16 hex>-<width>.<avif|webp>`. Icons: up to 56 px. Renders keep their full frame: 320 and 640 px wide. Tiles: 300 and 600 px wide. Own images: 320 and 640 px wide. Never upscale: clamp each width to the source width and deduplicate sizes (a 600x600 render gets 320x320 and 600x600 variants). AVIF and WebP for every size.
- Postgres `content.media` records each asset: `ref_kind`, `ref_id`, `role` (`icon`, `render`, `tile`, `image`), `source` (`blizzard` | `own`), source URL, hash, intrinsic width/height, variants, alt, `fetched_at`, `checked_at`. The website reads it with its read-only role. No table per mount or item: one media table keyed by game reference.
- The website serves `GET /media/<file>` from the volume with `Cache-Control: public, max-age=31536000, immutable`; names that do not match the pattern or do not exist are 404 with a short cache. Same origin, so no extra DNS and no third-party request on page load.
- Publishing content queues a sync for the page's references; `apps/server/scripts/media.ts sync|refresh|add-image|gc` does the same by hand. Rows record their pipeline version; `sync` and `refresh` re-convert older Blizzard rows even if recently fetched. Re-import own images from their originals after a pipeline change. `gc` removes files no row points at.

### Content schema

- Collection/Path item: optional `media: { icon?: fileDataId, display?: creatureDisplayId }` overrides what the resolver finds. Kinds without game art (level, reputation, renown, quest, chain) use a drawn glyph from the design system.
- Any page body: optional `hero: { kind, id, alt? }`, where `kind` is `mount`, `pet` or `instance` (render or tile), or `{ image: "<own media hash>", alt }`.
- New block `figure`: `{ type: "figure", ref?: { kind, id }, image?: "<own media hash>", alt, caption? }`. A figure whose media is missing is not rendered.
- Inline references in paragraph and list text: `[[mount:460]]`, `[[pet:1890]]`, `[[achievement:6]]`, `[[item:84101]]`, `[[toy:84101]]`, `[[currency:3008]]`. They render as icon plus game name with a tooltip; the name comes from the page's items or the media row, never from the visitor.

### Tooltip and icons (design system)

- `DsGameIcon`: server-rendered `<picture>` (AVIF, WebP) with width/height set, gold frame, kind glyph fallback, no layout shift. Decorative (`alt=""`) when the name is printed next to it.
- `DsTooltip`: opens on hover and keyboard focus on desktop, on tap on touch screens (a second tap or tap outside or Escape closes). Absolutely positioned, flips to stay on screen, never moves the page. Its content is in the server HTML, so search engines see the same words players do. Renders inside it load lazily.
- Renders and hero images have real alt text: "Grand Expedition Yak, a World of Warcraft mount".
- Index and home cards show a strip of the first item icons.

## Consequences

- Pages are understandable at a glance and stay fast: small same-origin images, immutable caching, lazy renders, fixed sizes.
- The Server needs `sharp` and outbound access to the Blizzard API and render CDN. A failed fetch leaves the glyph fallback; a page never breaks on missing media.
- Our own screenshots need a person to capture them in game; the slots exist but stay empty until then.
