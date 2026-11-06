# Forever editorial audit — 6 November 2026

## Scope and baseline

Inspected all five English published guide documents through the public catalog API, their rendered HTML, migrations 0008–0022, owner HTTP/MCP/script authoring, `ContentStore`, web sanitizers, media resolution, `EntryBody`, `PageView`, `DsTooltip`, catalog routing, robots and sitemap. Baseline: `0a08b7e`; public guide versions were all 1. No repository skills or local rules directories existed. Existing global skill-authoring, writing, test-first and review guidance informed the workflow; the task's publication authorization and constraints take precedence.

The pipeline already had structured JSONB, immutable published versions, source/build fields, safe link blocks, server-rendered article metadata and a reusable hover/touch component. Gaps: no procedural content brief/review, no Forever-compatible explanations, no repeatable editorial validation or public HTML audit, and a publication label that could imply a live build test instead of a source check. Retail references were correctly rejected for Forever; that boundary remains.

## Briefs and findings

| Existing URL suffix | Reader question and revised answer | Structural defect repaired | Evidence and update trigger |
| --- | --- | --- | --- |
| `best-solo-class-wow-forever` | Which solo inconvenience can I tolerate? Start with Affliction for resource recovery; compare pet upkeep, Paladin kill time and Mage positioning. | Repeated forecast caveats, tier letters and raid simulation numbers replaced with consequences and a choice sequence. | Solo forecast plus official tuning notes; revisit pet/drain/control changes and measured solo clears. |
| `best-leveling-class-wow-forever` | Which class makes the journey easier? Start with Hunter, accounting for its petless opening and ongoing costs. | Previously overlapped the solo article; now compares early power, travel, recovery and training. | Leveling forecast and official training/action-bar notes; revisit verified 1–60 runs and class changes. |
| `wow-forever-enchanting-guide` | Should I learn this craft, and should I destroy this item? Compare intended uses, intact gear value and material value. | Recipe counts and a long beta table crowded out the decision; now provides a sell/disenchant sequence and small camp project. | Profession data and calculator method; route remains blocked on current recipes/skill targets and price evidence. |
| `how-to-make-gold-early-in-wow-forever` | How do I fund progress without tying up my gold? Gather, reserve training money and cost crate turn-ins. | Repeated profession ratings replaced with gathering-pair tradeoffs, opportunity cost and an actual material-bundle example. | Economy forecast, supply-camp guide and training notes; revisit observed sales and changed crate rewards. |
| `wow-forever-beginners-guide` | What do I need to decide before and just after creating a character? Access → preset → ruleset → class → training/camp/Legacy. | Feature inventory lacked an order of action. Removed repeated edition warnings and corrected raid-date uncertainty. | Official launch/edition articles and development notes; revisit access, rulesets and release announcements. |

All five titles/descriptions now match those distinct questions. Internal links sit at the point where another guide answers the next question. Three to four explanations per guide (two for leveling) address terms that affect decisions; no decorative term density target was used. No price sample, firsthand play, leveling time, dungeon clear or guaranteed outcome is claimed.

## Evidence ledger

Public pages were fetched and their bodies read on **2026-11-06 UTC**, not merely copied from the older guide brief. HTTP 200 does not make a forecast or beta result a live observation.

| Source | Claims retained and scope |
| --- | --- |
| [Blizzard launch article](https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live) | Preset defaults and reversibility, rulesets, two-part names, Skyborne choices, camps, Legacy, zones. It now directly announces **December 9** for three raids; the old guide's “reported only” wording was stale. No Hardcore date is supplied. |
| [Blizzard introduction and editions](https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever) | Subscription/Game Time access, global launch and optional Skyborne access. No price is quoted. |
| [Blizzard development notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9) | Title says November 2; post displays November 3 UTC. Training total, action bars and tuning plans. Warlock pet health scaling changed; no promise of a pet surviving every elite. |
| [Solo forecast](https://wowfdb.com/tier-lists/solo-pve/) | 3 Nov, source builds 1.60.1.70755/70790. Mechanics and assumptions support comparison, not proven clears. Its pet assumptions partly come from Classic Era; stated explicitly in the revised solo article. |
| [Leveling forecast](https://wowfdb.com/tier-lists/leveling/) | Same source-build range/date. Pet at 10, Mend Pet at 12, Cheetah at 20, resource/travel tradeoffs. Later performance is projected. No timings or talent-by-talent route imported. |
| [Enchanting data](https://wowfdb.com/professions/enchanting/) | 3 Nov, build 1.60.1.70790. Camp craft thresholds/Blueprint requirements and craft categories. Gear binding restrictions remain unconfirmed; page says its in-game trainer/vendor survey has not reached Enchanting. |
| [Disenchant calculator](https://forevermastery.com/en/tools/disenchant) | Material-band interpretation and required level versus item level. Prices are a single-player **15 Oct beta** sample. No prices, probabilities or full table reproduced as live truth. |
| [Gold forecast](https://wowfdb.com/tier-lists/professions-gold-launch/) | 27 Oct, build 1.60.1.70658. Input-cost/demand rationale only; page explicitly says live prices are pending. Choosing a pair is editorial advice based on questing style, not an earnings measurement. |
| [Supply-camp guide](https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce) | Crate → Sealed crate → camp, binding, currency versus reputation, camp locations; Apprentice Textiles accepts 40 Linen Cloth **or** 20 Light Leather. No gold profit inferred. |
| [Simulation method](https://brokenmeta.gg/en/wow-forever/tier-list/) | 4 Nov, build 1.60.1.70753. Its raid-buffed stationary-boss method explicitly excludes solo play. Used to explain a category mismatch, not to promote a damage number. |

Also fetched the old citations at endgametools, expcarry, wowcarry, roadto60forever, theforeverguides, stillsixty and wowforeverleveling; all returned 200. They are omitted from the new source lists where they add no necessary independent evidence. The mmonster link returned 200 after redirecting to German; it is not used. [Overgear's old gold citation](https://overgear.com/guides/wow-forever/earning-gold/) returned **403**, so its claims were not treated as refreshed or carried forward on its authority. No access bypass was attempted.

Remaining evidence gaps: measured current 1–60/solo results, live auction prices and sales, settled Enchanting recipe route/skill target, verified new-gear restrictions, and pet performance above 30. These are publication scope limits, not reasons to invent detail.

## Before and after

- Before: “The early forecast puts it in A tier.” After: “Protection Paladin offers shields, absorbs and self-healing for standing your ground. Repeated Consecration uses mana, and low damage can turn a safe fight into a long one.” The reader now has a cost to compare.
- Before: repeated warnings that rankings are early forecasts. After: one scoped evidence note, then choices about pet upkeep, recovery, distance or kill time. Separate uncertain mechanics retain local labels.
- Before: “The available routes also disagree on the final skill target.” After: confirm one current recipe, fund a small batch, inspect the result, then restock. The gap remains explicit, but the reader has a useful next action.
- Before: the raid date was merely reported. After: attribute the scheduled December 9 opening to the official launch article checked this run.

## Technical baseline

The live `/forever` and all five existing guide URLs returned HTTP 200 with one H1, unique titles/descriptions, correct `https://playunbored.com/guides/<slug>` canonicals and sitemap entries. Robots allowed the pages. Article data named Forever and breadcrumbs pointed through `/forever`. JSON-LD was inside `script[type="application/ld+json"]`, absent from readable body text; no visible-schema bug was reproduced and no speculative renderer fix was made.

The repeatable command is documented in [Content authoring](../content-authoring.md). Existing URLs, auth/API paths, Game separation and the beginner guide's own-image hero are preserved. No images were fetched or transformed for publication.
