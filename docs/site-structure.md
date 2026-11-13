# Site structure

How playunbored.com is organised (ADRs 0072-0074). The site is an authored portal plus the addon, not a game database: there is no page per mount, pet, item, NPC or quest, and none is planned.

## Sections

| URL | What it is | Indexed |
| --- | --- | --- |
| `/` | What Unbored is, how Bory works in three steps, featured Collections and Paths, a WoW Forever link when a guide is published, install | yes |
| `/guides` | Published Retail Guides, plus one link card to `/forever`: short articles such as "What to do at max level in Midnight" | yes |
| `/forever` | Published WoW Forever Guides, kept separate from Retail | yes |
| `/guides/<slug>` | One Guide for either Game: headed sections of original text, checked facts, links to the Collections and Paths it points at | yes |
| `/collections` | Every published Collection: authored top lists such as "Top mounts to get first" | yes |
| `/collections/<slug>` | One Collection: why the list, then each item with what it is and exactly how to get it | yes |
| `/paths` | Every published Path, grouped by content and tier (Basic, Deeper, Complete) | yes |
| `/paths/<slug>` | One Path: what it covers, goals by Topic, how to finish each | yes |
| `/about` | The independent project, guide checks and review policy, corrections, news and code | yes |
| `/install` | Bory landing page, live Windows download, manual addon zip, setup, privacy and visible FAQ | yes |
| `/my` | My page: your Characters, active Paths with progress, Path completion history, Plans and Wins, after signing in from the Companion | no |

Header: Guides, WoW Forever, Collections, Paths, Get Bory, My page. The active header section follows a Guide’s Game: a Forever Guide highlights WoW Forever even at `/guides/<slug>`. Footer: the same links, About, Telegram, privacy ("What Bory knows"), source on GitHub. Every page below the home has breadcrumbs (Home > Collections > Top mounts to get first), mirrored in `BreadcrumbList` structured data.

## A list item

Each item of a Collection (and each Path goal) shows: the game name, what it is (mount, battle pet, toy, achievement), how you get it (vendor and cost, achievement, quest, reputation or renown, drop, profession, event), where (zone), and a short original note on why it is worth it. Names, ids, sources, zones and costs come only from the Game DB (client DB2, the same build the Server imported), the Blizzard Game Data API, or a primary page cited per item; an item that cannot be verified is left out. A chance drop is marked "chance drop" and never counts as the guaranteed way; Plans use it only as a bonus.

## Visitor flow

Search result > a Collection or Path page > "Track this in game with Bory" > install, then My page from the Companion > the same page shows your progress (20 / 50) > pick it as your Path, and Bory's next Plans come from its unfinished items.

## SEO

Every page is English, including signed-in views. Public pages are server-rendered, with one H1, a unique title and description, a canonical URL on playunbored.com, an og-image, and structured data: `ItemList` for a Collection, `Article` for a Guide, `Article` plus `ItemList` for a Path, `BreadcrumbList` everywhere below the home. Article `about` names the VideoGame: "World of Warcraft: Forever" for Forever, "World of Warcraft" for Retail. Forever guide breadcrumbs are Home > WoW Forever > Title, including `BreadcrumbList`, while their canonical URLs stay `/guides/<slug>`; Retail keeps Home > Guides > Title. The sitemap lists the home, `/guides`, `/forever`, `/collections`, `/paths`, `/install`, `/about` and every published Guide, Collection and Path; signed-in pages are `noindex`.

[ADR 0082](adr/0082-site-seo-foundation.md) gives every page one Organization identity: Unbored, with `/bory.png` as its logo and Telegram/GitHub as its external identities. Articles reference it as author and publisher. `publishedAt` is the first version’s non-null publication timestamp, including retired versions; `updatedAt` remains the current publication timestamp. These supply Article `datePublished`/`dateModified` and `article:published_time`/`article:modified_time`. Drafts do not move either date, and source-check dates remain separate. No migration or backfill is needed. The Server content read (including `get_content`) adds `publishedAt`; the web reader derives it from the same version history, so either service may deploy first.

Non-root paths ending with a slash return 301 to the slash-less path, preserving the query string. Canonical guide URLs stay unchanged. HTTP-to-HTTPS redirection belongs to hosting and is not changed here.

The home title names WoW and WoW Forever guides and the Retail addon’s plans, with the brand appended once. Its title/description are set in the home component; the authored home body stays in Postgres. `/about` is a static English page describing sources, build/date checks, review after patches/source changes, no paid placements and Telegram contact, without a personal byline. OG images use the page hero when available, otherwise Bory; Forever images carry a WoW Forever badge.

## Content

Authored content lives in Postgres (`content.paths` and its goals, `web.pages`), versioned with draft and published states, and is written through owner tools that check Retail ids against the Game DB. Migration 0022 adds a `game` column with default `retail`; existing rows need no content rewrite. WoW Forever never reads or validates against the Retail Game DB and reads only own images from the media store (ADR 0079). Article bodies are not a flat-file CMS; reviewed data migrations may deliver versioned replacements. Start guide work at [Content authoring](content-authoring.md).

## Guides

A Guide is the third kind in `content.paths` (`kind = 'guide'`), authored through `/owner/content`, the owner MCP tools or `apps/server/scripts/content.ts`. Its Game is `retail` by default or `forever`. Both support headed text, lists, local/external links and `callout` blocks (`tone: note | forecast`, text up to 600 characters).

Retail Guides may have items, inline game references, heroes and figures under the Collection and media rules. Every Retail game fact comes from the Game DB build it was checked against; anything that cannot be checked is left out. A Retail Guide links to at least one Collection, and the Collections it points at link back.

WoW Forever supports Guides only, with own-image heroes and figures imported through `scripts/media.ts add-image`. Items, Retail inline game references, Blizzard heroes (`kind`, `id`) and figure `ref` are rejected. Publishing never queues Blizzard media sync; the page API returns referenced `image:<hash>` entries, and own-image heroes use the same CSS cover fitting as Retail without additional image processing. Facts are checked manually against Forever sources and its own build, never Retail ids. `/forever` lists only published Forever Guides; ADR 0084 groups them by each publication's `group` metadata, with Start here, sourced key dates and five recently updated guides; empty groups stay hidden; `/guides` lists only Retail Guides and links to `/forever`. Forever pages have a WoW Forever badge, no signed-in progress controls and no addon installation prompt.

Every Guide ends with its Game’s hub and up to three other published Guides of that Game, preferring the same group for Forever, then latest publication and slug within each preference. If fewer than three exist, only those are shown; the current Guide and drafts are excluded. This is template navigation, not a rewrite of guide blocks.

Both Games may carry sourced inline explanations through `terms` and `{{term:key|label}}` in paragraphs/lists (ADR 0080). Definitions remain visible in the server-rendered page and linked without scripts; optional verified identity never triggers a cross-game lookup. See [Content authoring](content-authoring.md) for syntax, validation and editorial skills.

Both Games may carry `sources`: up to 20 `{label, url, accessed}` entries (label up to 120 characters, absolute HTTPS URL, real `YYYY-MM-DD` accessed date), rendered at the end under Sources. Links open in a new tab with `rel="nofollow noopener noreferrer"`, followed by `· Accessed 5 Nov 2026`. Optional `asOf: {date, build, note?}` records when facts were checked, with build text up to 60 and note up to 200 characters; the “Sources checked” date and source build/scope line appears near the top with the same English date format. Evidence is versioned with the guide and does not replace Retail validation.

Signed-in additions to `/paths`, `/paths/<slug>` and `/collections/<slug>` load after mounting: a Character switcher, progress, and (on detail pages) active Path selection with replacement confirmation. These additions never enter public SSR HTML or shared caches; no new public URLs are introduced.

`/download/windows`, `/download/windows-msi` and `/download/addon` redirect to GitHub release assets on demand (ADR 0085). They are not pages: noindex, excluded from the sitemap and disallowed by robots. `/install` adds SoftwareApplication with the on-domain download address, current version and size, own screenshot and zero-price offer; its FAQPage answers come from the visible FAQ (ADR 0086). No ratings are emitted.
