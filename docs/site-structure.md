# Site structure

How playunbored.com is organised (ADRs 0072-0074). The site is an authored portal plus the addon, not a game database: there is no page per mount, pet, item, NPC or quest, and none is planned.

## Sections

| URL | What it is | Indexed |
| --- | --- | --- |
| `/` | What Unbored is, how Bory works in three steps, featured Collections and Paths, install | yes |
| `/guides` | Every published Guide: short articles such as "What to do at max level in Midnight" | yes |
| `/guides/<slug>` | One Guide: headed sections of original text, checked facts, links to the Collections and Paths it points at | yes |
| `/collections` | Every published Collection: authored top lists such as "Top mounts to get first" | yes |
| `/collections/<slug>` | One Collection: why the list, then each item with what it is and exactly how to get it | yes |
| `/paths` | Every published Path, grouped by content and tier (Basic, Deeper, Complete) | yes |
| `/paths/<slug>` | One Path: what it covers, goals by Topic, how to finish each | yes |
| `/install` | Get the addon and the Companion (the GitHub release feed), what Bory knows about you | yes |
| `/my` | My page: your Characters, active Paths with progress, Path completion history, Plans and Wins, after signing in from the Companion | no |

Header: Guides, Collections, Paths, Install, My page. Footer: the same links, privacy ("What Bory knows"), source on GitHub. Every page below the home has breadcrumbs (Home > Collections > Top mounts to get first), mirrored in `BreadcrumbList` structured data.

## A list item

Each item of a Collection (and each Path goal) shows: the game name, what it is (mount, battle pet, toy, achievement), how you get it (vendor and cost, achievement, quest, reputation or renown, drop, profession, event), where (zone), and a short original note on why it is worth it. Names, ids, sources, zones and costs come only from the Game DB (client DB2, the same build the Server imported), the Blizzard Game Data API, or a primary page cited per item; an item that cannot be verified is left out. A chance drop is marked "chance drop" and never counts as the guaranteed way; Plans use it only as a bonus.

## Visitor flow

Search result > a Collection or Path page > "Track this in game" > install, then My page from the Companion > the same page shows your progress (20 / 50) > pick it as your Path, and Bory's next Plans come from its unfinished items.

## SEO

Public pages are English, server-rendered, with one H1, a unique title and description, a canonical URL on playunbored.com, an og-image, and structured data: `ItemList` for a Collection, `Article` plus `ItemList` for a Path, `BreadcrumbList` everywhere below the home. The sitemap lists the home, the two index pages, `/install` and every published Collection and Path; signed-in pages are `noindex`.

## Content

All texts live in Postgres (`content.paths` and its goals, `web.pages`), versioned with draft and published states, and are written through owner tools that check every id against the Game DB. No content in repo files.

## Guides

A Guide is the third kind in `content.paths` (`kind = 'guide'`, migration 0016), authored through the same `/owner/content` route. Its blocks may include `heading` (an H2). Items are optional; when present they follow the Collection item rules. Every game fact in a Guide (names, vendors, costs, achievement titles) comes from the Game DB build it was checked against; anything that cannot be checked is left out. A Guide links to at least one Collection, and the Collections it points at link back.

Signed-in additions to `/paths`, `/paths/<slug>` and `/collections/<slug>` load after mounting: a Character switcher, progress, and (on detail pages) active Path selection with replacement confirmation. These additions never enter public SSR HTML or shared caches; no new public URLs are introduced.
