# Forever professions, gold and FAQ batch

Research: 2026-11-09 UTC. Game: Forever. Language: English. Base: `0ddebb0` (PR #159). Decision: [ADR 0088](../adr/0088-professions-and-gold-guides.md). No live-client observations or measured auction returns.

## Research gate

Google Search returned a JavaScript retry page over HTTP and an unusual-traffic challenge in Chromium for all four primary queries. No People also ask questions were observed. The prior T5 exception does not apply automatically. A T7 exception has been requested; publication remains pending that decision. Autocomplete and accessible search results below are real observations, not Google ranking or volume claims.

## Search log and ownership

Google autocomplete endpoint: `https://suggestqueries.google.com/complete/search?client=firefox&q=<encoded seed>`. Google results: `https://www.google.com/search?hl=en&gl=us&q=<encoded primary>`, also attempted with `gbv=1&num=5`. Raw responses and browser text are in ignored `.scratch/t7/`. The accessible search reader was queried with the four primary phrases, both unquoted and quoted, and `site:news.blizzard.com "Forever" "Warrior" "Druid" "Priest" classes` to locate Blizzard's class roster.

| Slug | Primary query / intent | Observed secondary wording and origin | Distinct answer |
| --- | --- | --- | --- |
| `wow-forever-merchants-favor-waylaid-crates` | wow forever merchants favor / how-to | Autocomplete seed `wow forever merchants favor`: guide, recipes, vendor, rewards, quest, items. Seed `wow forever waylaid crate`: apprentice parts, apprentice ore, apprentice ingots, journeyman textiles, rewards, apprentice textiles. Use recipes/vendor/rewards/quest/parts/ore/textiles as the seven secondary intents. | Read and fill a crate, find the right faction camp, decide whether to fill or sell. |
| `wow-forever-best-professions-for-each-class` | wow forever best professions for each class / comparison | Autocomplete seed `wow forever best professions`: for shaman, warlock, for hunter, mage, paladin, for warrior, for druid, per class. Use seven named-class intents. | A self-supply pair and a gathering pair for each of Blizzard's nine classes; advice with reasons, not measured rankings. |
| `wow-forever-faq` | is wow forever free / quick answer | Autocomplete seed `is wow forever`: free, worth it, out. Task's dated queries: console/xbox, hardcore release date, subscription, editions, raids release date, level cap, new race. Select worth it/out/subscription/editions/console/hardcore/raids/new race as secondary intents. | Access requirement, optional upgrades and dated availability, using Blizzard alone for facts. |
| `how-to-make-gold-early-in-wow-forever` | how to make gold early in wow forever / how-to revision | Autocomplete seed `wow forever gold`: making, farm, guide, buying, buying bans, shuffle, cap. Use making/farm/buying/buying bans; omit cap and shuffle from this narrow revision. | Preserve the existing spending and gathering advice; repair the crate details and warn against buying gold. |

Adjacent ownership remains unchanged: beginner owns first-login choices; Enchanting owns disenchant-or-sell and starting that profession; the two class guides own solo and leveling class selection. Merchant's Favor owns crate mechanics, best-professions owns class pairs, early-gold owns the spending routine. The FAQ answers access and availability, linking to the beginner guide for the actual first session.

### First five organic results in the accessible search sample

These are the returned positions for the quoted primary queries, excluding news, not verified Google ranks. All URLs were opened on 2026-11-09. Snippets were used to discover leads; factual publication evidence is listed separately below.

**Merchant's Favor:**

1. [Mobalytics, Complete Merchant's Favor, Waylaid Crates & Craftsman's Writ Guide](https://mobalytics.gg/wow-forever/profile/stoyven-enbj16/guides/merchant-s-favor), updated October 26: camp landmarks, first Shipping Label, payout tiers and a walkthrough. Useful cross-check, but its pre-launch scope cannot establish current prices.
2. [Blizzard forum, The Merchants Favor system will not work as it currently is](https://us.forums.blizzard.com/en/wow/t/the-merchants-favor-system-will-not-work-as-it-currently-is/2356361): September player discussion about scarcity and recipes. Player posts are not Blizzard policy or reliable live drop rates.
3. [WoW Forever Builds, Merchant's Favor & Waylaid Crates](https://wowforeverbuilds.com/merchants-favor): September client build, bundle examples and FAQ. Older, with unconfirmed hand-in locations and unsupported rank assumptions; prefer the current corroboration below.
4. [ForEveroth, Merchants' Favor costs and recipes](https://foreveroth.com/en/guides/merchants-favor-commerce-authority/): recipe-price reference with source limitations. Gap: first crate, fill interaction and actionable sale comparison.
5. [Kami-labs, Merchant's Favor](https://kami-labs.fr/en/faveur-marchande-wow-forever/): profession vendor/recipe catalog, beta stock, costs and disputed rank count. Explicitly mixes in unconfirmed Season of Discovery leads; exclude those.

**Class professions:**

1. [Classic WoW Forever, Best professions for every class](https://classicwowforever.com/professions/best/): armor crafts, gathering and goal-based rankings; admits missing auction prices. No measured gold winner.
2. [AllThingsHow, Every profession and best pair](https://allthings.how/wow-forever-professions/), November 8: profession roster and craft/supply pairs. Useful independent recommendation, but avoid importing a leveling route.
3. [Khorium, Best professions for each class](https://khorium.pro/guide-view.html?slug=wow-forever-best-professions-for-each-class): October 22, cites Icy Veins class recommendations. Not a second independent client-data chain.
4. [Builds Forge, Best professions for each class](https://buildsforge.com/en/wow-forever/guides/best-professions-by-class/), November 5: gathering while leveling versus crafts later. Overstates that gathering never slows the player down; our advice must account for detours.
5. [ForeverDB, Best professions for each class](https://foreverdb.net/guide/best-professions-by-class), November 9: class pairs grounded in client outputs, explicitly first ten levels. Supports starter material relationships, not optimal level-60 builds.

**FAQ/access:**

1. [Undying](https://undying.app/): compact launch/access/level-cap FAQ. Gap: optional race access versus base subscription.
2. [Warcraft Forever, Is it free?](https://warcraftforever.org/pricing/is-it-free/): separates subscription and temporary invitation access, but currency price is secondary sourcing.
3. [Forever Guide, Price and editions](https://foreverguide.net/start/price-editions/): subscription and optional upgrades, older shop snapshot. Use Blizzard for current claims.
4. [Forever Mastery, Price](https://forevermastery.com/en/guides/wow-forever-price): updated November 7; broad costs, shop extras and launch invitations. Avoid importing reported prices.
5. [SenseOS, Price and editions](https://senseos.gg/guides/wow-forever/price-and-editions/): subscription-versus-packs comparison, older shop check. Our table must distinguish launched, scheduled and undated features.

**Early gold:**

1. [Lore Forever, Levels 1 to 20](https://loreforeverwow.com/guides/wow-forever-how-to-make-gold-levels-1-to-20): ordinary looting/gathering and no verified hourly return.
2. [Zolotube, Fast Start Guide](https://zolotube.com/watch?v=BI9VJl1QWns): video description promising a launch route. No quantitative claim adopted.
3. [Builds Forge, Gold guide](https://buildsforge.com/en/wow-forever/guides/gold-guide/): sell materials, avoid old vendor shuffles; broad later-game scope.
4. [Eternadex, Making Gold](https://eternadex.com/en/gold-verdienen/): separates Classic assumptions and Forever changes, warns against gold buying. Do not import Classic prices.
5. [MMOGAH, Best Early Farming & Professions](https://www.mmogah.com/news/wow-forever/how-to-make-gold-fast-in-wow-forever-best-early-farming-professions-guide): gathering and crafting comparisons alongside gold sales. No commercial promotion or invented return belongs in our guide.

## Evidence ledger

Successful source-body reads below: 2026-11-09. Brief tags S1–S19 refer to the owner's supplied evidence. New sources receive descriptive keys. Claims absent here must be excluded or verified before drafting.

| Source and title | Claims and scope | Treatment |
| --- | --- | --- |
| S1: [Blizzard, Carve a New Path](https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever) | November 4, 3 p.m. PST global launch; level 60; subscription/Game Time; optional editions and Skyborne access. | Primary availability facts. 23:00 UTC is the conversion supplied in the task. No currency prices. |
| S2: [Blizzard, Now Live](https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live) | Subscription, Skyborne, new quests/zones, gamepad support; Hardcore sometime after launch; December 9 level-60 raids: Barrow Deeps, Hyjal Summit, Onyxia's Lair. | Raid date is confirmed, not reported. Console silence is bounded to opened announcements. |
| Starter: [Blizzard, New Player's Starter Guide](https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever) | Windows/Mac, beta controller support, subscription, Skyborne upgrade, first-login settings. | No announced console platform on this page. Use one short sourced ruleset definition if helpful. |
| Classes: [Blizzard, Create the Hero You Want to Be](https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever) | Druid, Hunter, Mage, Paladin, Priest, Rogue, Shaman, Warlock, Warrior. | Exact nine-class roster for the table; no Retail classes. |
| Legacy: [Blizzard, Get to Know the Legacy System](https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system) | Performance Bonus sometimes increases Favor; Bountiful Harvest helps gather extra Scarce resources through mining, herbing or skinning. | Effects only; no ranks, rates or guaranteed bonus. Full titled URL avoids the short redirect. |
| S14: [stillsixty, Waylaid Crates](https://www.stillsixty.com/guides/waylaid-crates) | Tiers 10/10/20/35; one listed bundle in a single stack; Marcy Baker/Three Corners/Redridge and Dokimi/Crossroads/Barrens; first Shipping Label +50 Favor/+2,000 reputation; Apprentice/Journeyman payouts; bundle examples. Updated November 2. | Reopened, cross-check numbers and names against S15. Sources disagree on when Shipping Label appears, so describe completing its first-crate quest without promising a precise trigger. |
| S15: [wow-professions, Merchant's Favor & Reputation Guide](https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce) | Same camps/NPCs, tier levels, bundle examples, initial quest; profession recipes and reputation via writs; sealed crates bind. | Apprentice/Journeyman rewards agree with S14. Expert payouts have only this current table; Artisan payouts unknown. Do not print those exact rewards. |
| S10: [WoW Forever DB, Enchanting](https://wowfdb.com/professions/enchanting/) | Tailoring relationship; Warlock three-spec Enchanting/Tailoring pair; Shadow Priest Enchanting/Alchemy. Source build 1.60.1.70790. | Attribute the Shadow alternative to one source; profession choices remain advice. |
| S13: [WoW Forever DB, Launch Gold Professions](https://wowfdb.com/tier-lists/professions-gold-launch/) | October 27 forecast, build 1.60.1.70658; Herbalism S, Mining/Skinning A, Enchanting D; no recorded Forever prices. | Label forecast once; no measured live winner or hourly gold claims. |
| S16: [Road to 60Forever, How to get free gold without buying it](https://roadto60forever.com/professions/gold-making-guide/) | Gathering pair fit, sell empty crates or their inputs versus fill for Favor. | Advice cross-checked with S17, material mechanic with S14/S15. |
| S17: [Overgear, How to Make Gold](https://overgear.com/guides/wow-forever/earning-gold/) | November 2 guide: gathering during questing and pair choices. | Commercial source; no sales links or commercial claims reproduced. |
| S19: [Forever Guides, Legit Ways to Earn Gold at Launch](https://theforeverguides.com/gold-making/) | Blizzard can restrict trade, mail and auction access on suspect accounts. | Task-authorized warning; no added punishment duration, account threshold or evasion advice. |
| Pairs: [AllThingsHow, Every Profession and Best Pair](https://allthings.how/wow-forever-professions/) and [ForeverDB, Best professions for each class](https://foreverdb.net/guide/best-professions-by-class) | Agree on Leatherworking/Skinning for Druid/Hunter/Rogue/Shaman, Mining/Blacksmithing for Warrior/Paladin, Tailoring/Enchanting for Mage/Priest/Warlock. | Starter self-supply recommendations, not ranked performance. State our conditions: want crafted gear and can afford inputs; choose gathering if training cash takes priority. |

### Uncertainty and exclusions

- No gold-per-hour, guaranteed sales, contemporary item prices, currency subscription prices or riding price.
- Performance Bonus ranks disagree across search leads; omit all ranks and proc percentages.
- Expert and Artisan exact payouts excluded without two agreeing current sources. Their tier levels and example bundles are supported.
- Journeyman Textiles Wool Cloth quantity differs: S14 says 20; S15 says 40. Omit Wool Cloth; use an agreed ore example instead.
- First Shipping Label timing differs (fill/start writ versus hand-in); preserve the reward, avoid the disputed timing.
- No copied 1–300 routes, no maximum profession skill, no unsupported binding claim for every crafted item.
- Class and gold choices are editorial advice. The gold tier list is a pre-launch forecast even after today's reread.
- Hardcore date unannounced; console version unannounced in the Blizzard pages read. No guessed date or categorical claim about all future platforms.
- No change to other guides, hero media, existing gold structure or unrelated metadata. The existing gold evidence date is already November 9, so a truthful same-day recheck cannot advance it to a later day.

## Shape plan

Merchant's Favor: M scope only as supported. Open with the first-crate bonus and direct earning/spending answer. Table columns: crate/tier, level, one-bundle example, faction hand-in, reward. Cover Apprentice Herbs, Textiles, Ore, Parts, Curiosities and representative higher tiers; do not reproduce the full third-party catalog. Explain sale alternatives with opportunity cost and the linen/leather comparison. FAQ candidates from observed task/autocomplete intents: faction turn-ins, parts/ore/curiosities inputs, first quest, recipes and ordinary reputation.

Best professions: M comparison. One table, nine class rows, solo/self-supply pair, gold pair, reason. Give material relationships and reversal conditions rather than promising optimal endgame power. List primary and secondary professions in prose. Explain the single-source Shadow Priest alternative locally and Bountiful Harvest using Blizzard's effect only. FAQ candidates: Hunter, Warlock, Paladin, Shaman choices and the gold tier-list question.

FAQ: S–M quick answer. Open with level 60 and access requirement within two sentences, with the exact primary phrase in a natural question. A small dates/status table plus eight short visible answers: free/subscription, editions, worth it, console, Hardcore, raids, level cap, race. Launch date in the table. Prices link to Blizzard; no currency amounts.

Gold: preserve version-2 title/description and prose except the requested crate and gold-buying additions and links. The current document already names both NPCs, the first quest, Apprentice payouts and textile quantities. Add Expert/Artisan gates, the single-stack interaction, herb example, camp faction names and a short Never buy gold section. Keep its existing Enchanting and leveling-class links.

Links: every new page to `/forever` and `/guides/wow-forever-beginners-guide`; the three money pages link mutually; professions also links `/guides/wow-forever-enchanting-guide`, `/guides/best-solo-class-wow-forever` and `/guides/best-leveling-class-wow-forever`. FAQ links into the money cluster. All destinations are existing publications or part of this atomic batch. No figures or install prompt.

## Review and validation record

The unchanged production web build passes. The isolated baseline preview, seeded through 0023/0024/0025, passes `scripts/audit-guides.py --expect-terms` for `/forever` and all nine existing publications. The published gold version 2 was read as JSON and rendered HTML before editing; both NPC names are already visible.

The first database publication test fails as expected because migration 0026 does not exist yet. Its unfinished test and migration templates are retained in ignored `.scratch/t7/` until the research gate clears; no failing test is committed.

Drafting, migration replay/collision checks, final structured validation, revised-page audit and editorial rubric pass remain pending. Missing PAA remains explicit until the owner decides the T7 exception.
