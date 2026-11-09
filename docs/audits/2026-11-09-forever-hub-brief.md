# Forever topic hub: editorial and delivery record

Scope: English `/forever`, 9 November 2026. Reference/navigation intent for a player arriving from search. Primary query: **wow forever guides**, supplied in T6. ADR 0084 sets the narrower 400–700-word hub scope and defers a standalone FAQ; existing guides retain their own queries and URLs.

## Search evidence

Searched `wow forever guides` on 9 November. The search tool returned these first five organic hub results, opened the same day. These are an observed result sample, not a claim about Google's ranking or search volume:

| Result | Observed structure | What our smaller hub needs |
| --- | --- | --- |
| [Mobalytics](https://mobalytics.gg/wow-forever/guides) | Leveling/class/dungeon entry points, topic filters, recent creator posts | Direct first decisions without needing a filter |
| [Wowhead](https://www.wowhead.com/forever/guides) | Featured and all-guide headings, dungeon/raid/zone/class navigation; fetched body needs scripts for most content | Complete server-rendered guide links |
| [Method](https://www.method.gg/wow-forever) | Featured guides, leveling by class, profession guides and tools | Separate choosing a class from understanding a new system |
| [TheWoWDB](https://thewowdb.com/wow-forever/guides/) | Gold, Legacy, quests and profession navigation, dated beta evidence | Clear evidence dates and an official schedule |
| [Warcraft Forever](https://warcraftforever.games/guides) | Dated profession/economy entries, FAQ and beta-client references | An obvious beginner entry and topic sections with no empty destinations |

Google autocomplete was retrieved through ordinary HTTPS from `suggestqueries.google.com/complete/search?client=firefox&q=wow%20forever%20guides`. Relevant observed secondary phrases: `class guides wow forever`, `wow forever leveling guides`, `wow forever profession guides`, `wow forever dungeon guides`, `wow forever build guides`. Existing class comparisons own the specific leveling/solo queries; the hub directs readers to those pages instead of ranking classes itself.

Access gap: the web reader could not open Google results or autocomplete. The direct Google results response contained a JavaScript retry page and no People also ask text. No PAA questions, search volume or rankings are invented. Search research remains incomplete on that input; T6 supplies the hub's query, situations and shape, and explicitly asks only for a future FAQ link. No FAQ article or FAQPage schema is created here. This draft implementation does not publish content or claim a complete PAA pass.

## Factual evidence

| Claim | Source and section, opened 9 November 2026 | Treatment |
| --- | --- | --- |
| Permanent game alongside modern/Classic, original continents, level 60, position after Forsaken Kingdom and before Molten Core | [Blizzard launch article](https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live), opening | Fact; opening two sentences |
| More than 1,000 quests, Skyborne, camping and Legacy | Same article, zones/race/camping/Legacy sections | Fact; names the new systems without importing other games' mechanics |
| Legacy advantages can be unlocked on one character | Same article, Legacy section | Fact; supports staying with a preferred character |
| Normal/PvP expectations and roleplay naming/behaviour rules | Launch article, Choose Your Ruleset | Fact; first-steps navigation |
| Enhanced starting recommendation and later individual settings changes | Same article, Experience Preset | Fact; Start here paragraph |
| Launch 4 November 2026 at 3 p.m. PST | [Blizzard launch announcement](https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever), opening/access section | Fact; 23:00 UTC is the PST conversion |
| Raids 9 December for level 60 players | Launch article, Dungeons and Raids | Official date now explicit; no third-party report needed |
| Hardcore sometime after launch | Launch article, Choose Your Ruleset | No precise date claimed |
| November 2 development notes | [Blizzard forum](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9) | Web reader failed; no new claim depends on it |

The four topic introductions give editorial navigation advice: choose a class comparison by intended play, pick a system activity that fits the evening, check local prices before buying supplies. They add no class ranking, game number, recipe or profit forecast. Their destinations are the nine actual 0023/0024 publications. No images are added or edited.

## Copy and validation

Title: `WoW Forever Guides: Classes, Systems and Gold`, 45 characters; rendered with ` | Unbored`, 55. Description: 147 characters. Authored copy: **461 words** in the server-rendered `data-hub-copy` blocks, including the intro, Start here paragraph, four topic descriptions, dates, date-heading and source labels. This excludes cards, navigation, main title/description and Recently updated link titles. Including the title, description and remaining section headings still stays within 400–700 words.

Review: the opening names level 60 and identifies the game, then directs the player to existing topics. Each topic separates a practical situation and a destination. No em dashes, hype, generic welcome, unsupported numerical claim or rhetorical contrast. Article cards retain their existing published titles/descriptions. The page promises classes, systems and gold because all three have publications. Empty future groups are hidden. No own hub image is available, so the page adds none.

Update triggers: a newly populated group; beginner or preset slug changes; publication of `wow-forever-faq`; changed Blizzard dates; revised guide advice that makes a topic introduction inaccurate. Keep the single dates file's checked date honest. Metadata backfill does not alter publication timestamps or make an article appear newly updated.

Delivery and rollback are in [Content authoring](../content-authoring.md#forever-topic-groups-and-migration-0025). The migration and web page are tested against isolated PostgreSQL publications, then the production HTML audit, schema tests and browser checks. No live database or server is changed.
