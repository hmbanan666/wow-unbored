# Design system

The player site (`apps/web`) has one look: a dark, warm "lamp" background with gold accents and a gold gradient on display lines. There is no light theme and no theme switch. Tokens live in [`apps/web/app/assets/css/main.css`](../apps/web/app/assets/css/main.css); components live in [`apps/web/app/components/ds`](../apps/web/app/components/ds) and are auto-imported with the `Ds` prefix. Pages only compose components: a page or `error.vue` has no `<style>` block (a test checks this).

## Principles

- Mobile first. Every layout starts at 360px and widens at 640px, 768px and 1024px.
- Tap targets are at least 44px (`--tap`); buttons are 48px. Links inside a sentence are the only exception.
- No horizontal scroll at any width. Long words wrap (`overflow-wrap: anywhere` on headings).
- Body text meets WCAG AA on the background: text about 13:1, muted about 7:1, gold about 9:1.
- One H1 per page, then H2 for sections and list items, so the outline stays in order.

## Type

Two families, self-hosted through `@nuxt/fonts` (latin subset only):

- **Alegreya** (400, 700) for reading and headings: a calligraphic old-style serif in the family of the Iowan Old Style / Palatino stack the site used before. 400 and 700 are one preloaded file.
- **Alegreya Sans** (500, 700), its sister sans, for small UI text: nav, buttons, chips, breadcrumbs, meta lines.

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 13px | eyebrows, chips |
| `--text-sm` | 15px | meta lines, breadcrumbs |
| `--text-base` | 18px | body |
| `--text-lg` | 20px | lead, step and item titles |
| `--text-xl` | 24px | card titles, wordmark |
| `--text-2xl` | 26-30px | H2 |
| `--text-3xl` | 34-48px | H1 (gold gradient) |

Line heights: `--leading-tight` 1.15 (headings), `--leading-snug` 1.3, `--leading-body` 1.55.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `--lamp-deep` | `#140d0a` | page edge, text on gold |
| `--lamp-bg` | `#1e1410` | background |
| `--lamp-glow` | `#2a1c15` | top of the radial background |
| `--render-bg` | `#181818` | solid inside of every creature-render frame, matching Blizzard's stored background |
| `--lamp-surface` | glow at 72% | cards |
| `--lamp-line` / `--lamp-line-soft` | `#4a3810` | borders, dividers |
| `--lamp-text` | `#eadbc0` | body text |
| `--lamp-muted` | `#b8a385` | secondary text |
| `--lamp-gold` | `#e8b04a` | links, accents |
| `--lamp-gold-light` | `#f5d27a` | headings, hover |
| `--lamp-gold-dark` | `#a87820` | gold borders |
| `--lamp-chance` | `#d9b98a` | chance-drop chip |
| `--lamp-gold-gradient` | `#f5d27a` to `#c4922e` | H1, wordmark, primary button |

## Spacing, radius, shadow

- Spacing on a 4px grid: `--space-1` 4px, `-2` 8px, `-3` 12px, `-4` 16px, `-5` 24px, `-6` 32px, `-7` 48px, `-8` 64px.
- Layout: `--container-narrow` 42rem (reading), `--container-wide` 64rem (grids), `--gutter` 16-32px.
- Radius: `--radius-sm` 6px, `--radius-md` 12px (buttons), `--radius-lg` 16px (cards), `--radius-pill`.
- Shadow: `--shadow-card` (cards), `--glow-gold` (card hover), `--focus-ring` (keyboard focus).

Global helpers are limited to `.ds-lead` (lead paragraph), `.ds-meta` (small muted UI line) and `.site` (the app shell).

## Components

| Component | What it is |
| --- | --- |
| `DsContainer` | Centred column with the gutter; `width="narrow"` or `"wide"` |
| `DsPage` | The `<main>` landmark in a container, with page padding |
| `DsNav` | Header: gradient wordmark and main links; below 768px a 44px Menu button opens a full-width panel (works before hydration, closes on navigation) |
| `DsFooter` | Footer links, privacy line, fan-made note |
| `DsBreadcrumbs` | Trail plus `BreadcrumbList` data; on phones it hides the last crumb because the H1 names the page |
| `DsPageHeader` | Breadcrumbs, eyebrow, H1, lead, meta: the top of every page below the home |
| `DsHero` | Home opening: H1, text and actions, Bory beside them from 768px |
| `DsHeading` | Levels 1-3; level 1 is the gradient display line; `tag` decouples look from outline |
| `DsSection` | Titled block with optional lead, `more` link and a divider |
| `DsProse` | Reading rhythm for authored blocks (paragraphs, lists, H2s) |
| `DsSteps` | Numbered steps with a gold number |
| `DsButton` | Link styled as a button: `primary` (gold gradient), `secondary`, `ghost`; https links open in a new tab |
| `DsActions` | A row of buttons that stacks full width below 480px |
| `DsCard` | Summary card (eyebrow, title, text, slot); with `to` the whole card is the link |
| `DsCardGrid` | One column, two from 640px, three from 1024px |
| `DsItemCard` | One Collection pick: rank, name (H2), chips, note, "How to get it", source link |
| `DsItemList` | Ordered list of item cards |
| `DsChip` | Badge for item kind, source type, guaranteed (`gold`) or chance (`chance`, dashed) |
| `DsChipRow` | Wrapping row of chips |
| `DsPortrait` | Bory in his frame (decorative) |
| `DsEmptyState` | Bory, one line and actions: empty lists, signed-out My page, errors |

Domain components map data onto these: `PageView` (home, Collection, Path and Guide pages), `CatalogCard` and `CatalogGrid` (index pages), `CollectionItems` (items), `EntryBody` (authored blocks; consecutive links share one button row, the first one primary).

## Checking a change

Build the site and run the checks at 360, 390, 640, 768, 1024 and 1280px with headless Chromium: no horizontal scroll, no tap target under 44px outside running text, the Menu opens and closes. Lighthouse mobile performance stays at 90 or above.

Personal Path controls use the same tokens and layout:

- `DsSelect`: a labelled native select with a generated label association, full-width mobile layout, and a minimum `--tap` height. The Character switcher lists only the signed-in Account's Characters.
- `DsProgress`: visible X / Y text and a labelled native progress element. With zero required goals it renders the text alone.
- `DsConfirm`: a native modal dialog with a labelled heading, focus containment, Escape to cancel, initial focus on cancel, and native return of focus to its opener. Both actions use `DsButton`.
- `DsButton` also renders a native `button` when `to` is absent, with disabled support for pending actions.
- `DsItemCard` accepts a slot for personal done/not-done and optional-goal chips. Public item text still renders without JavaScript.

`PersonalPaths` composes these controls for a detail page or catalog. It fetches personal data only after mounting, announces loading/save/error states, and never changes public metadata or server-rendered content.

## Game media

Game art comes from the same-origin media store (ADR 0077), with AVIF before WebP and fixed dimensions. `DsGameIcon` has 32/44/56px sizes, a gold frame and drawn kind glyphs when art is missing; names beside icons make them decorative. `DsGameArt` selects appropriately sized variants and defaults to lazy loading. Only the hero uses eager loading and high fetch priority. Public home, Guide, Collection and Path HTML is also gzipped when the browser accepts it, with `Vary: Accept-Encoding`; personal pages and APIs keep their existing responses.

Photos, instance tiles and own images fill their frames with `object-fit: cover` and `object-position: center 40%`. Set `--game-art-position` on a component to override its focal point. `DsGameArt` reserves a 16:9 photo box or a 4:3 render box before loading; `--game-art-ratio` overrides this for figures. Heroes keep their own 16:9 box at every breakpoint, with both picture and image filling its inside edge to edge.

Creature renders (role `render`) always use centered `object-fit: contain`, so the whole creature stays visible. Their solid background is exactly `--render-bg: #181818`, matching Blizzard's stored pixels, throughout the picture, hero frame, tooltip render box and containing panel, Collection thumbnail and render figure including its caption. No render gradient, vignette or overlay is allowed; gold frame borders remain. Existing body, muted and gold text tokens retain AA contrast on this background (muted text is about 7.3:1). These are presentation rules only; stored media and the media pipeline are unchanged.

`DsTooltip` owns hover (120ms), keyboard focus, touch toggle, outside tap and Escape. Only one opens at a time. Its server-rendered text is hidden with CSS; the fixed panel is measured once on open, flips vertically, clamps to 16px viewport gutters and closes on outside scrolling or resize. Hovering the panel keeps it open. `DsGameTooltip` supplies the compact game name, kind, sources, chance/guaranteed chip and note; its 320px render mounts only while open. Trigger slots must contain only phrasing content, with no links or other controls.

`DsGameRef` turns authored references in paragraphs and lists into a small icon and dotted gold name, never navigation. Missing art leaves a plain name; missing names and invalid references disappear. `DsItemCard` uses the same details for its icon/name trigger and preserves progress, notes and source links. Mount/pet thumbnails select image sources only from 768px up. Item lists render fully on the server and hydrate within 200px of the viewport, keeping long lists off the initial interaction path.

`DsGameHeader` puts a framed hero above the heading on phones and alongside it from 768px. Collections and Paths without a hero show the first six icons; Guides keep their existing text header. `DsGameFigure` omits missing art and otherwise renders a framed image with authored alt and optional caption. `DsGameIconStrip` shows up to five overlapping decorative icons above a catalog card's title; the card remains one real link.

Run `pnpm --filter @unbored/web test` for component rendering and interaction checks, alongside the repository checks and website build. Check media-rich Guide, Collection and Path pages locally at 360/390/640/768/1024/1280px with render, tile and own-image heroes, Collection rows, figures and open tooltips. Check cover fitting and focal points, solid render interiors, tooltip placement, touch dismissal, keyboard focus, no layout shifts during delayed image loading and no hidden tooltip image requests.
