# Forever systems batch 1: research brief

Research date: 2026-11-09 UTC. Base: `fc2d8d2`, after PRs #153–#157. Decision: [ADR 0087](../adr/0087-forever-system-guides.md). Game: Forever, English, US query settings. No live-client observations are claimed.

**Search evidence decision, accepted by the owner on 2026-11-09:** Google People also ask could not be captured because Google Search returned an unusual-traffic challenge. For T5 this is not a publication blocker. Each of the four briefs uses the observed autocomplete suggestions, the task's secondary queries from the owner's 2026-11-09 autocomplete research, and accessible search results/competitor pages instead. No questions are claimed to come from PAA; this exception is scoped to this task and does not change the repository skill.

## Query ownership and observed searches

The existing beginner page, `/guides/wow-forever-beginners-guide`, owns the first-login overview. The existing leveling-class, solo-class, Enchanting and early-gold pages retain their own queries. These four new pages answer individual systems questions and should link back to the beginner page and `/forever`.

For each seed below, the autocomplete request was `https://suggestqueries.google.com/complete/search?client=firefox&q=<encoded seed>`. The attempted Google results request was `https://www.google.com/search?q=<encoded seed>&hl=en&gl=us`, also tried with `gbv=1&num=5`. Autocomplete lists are observed wording, not search-volume estimates. Raw responses remain in ignored `.scratch/forever-systems/`.

| Planned slug | Primary query | Observed secondary autocomplete queries | Intent and reader decision |
| --- | --- | --- | --- |
| `wow-forever-camping-guide` | wow forever camping | wow forever camping buffs; wow forever camping bonuses; wow forever camping system; wow forever camping features; wow forever camping 101; wow forever camping items; wow forever camping tent | How-to: make a useful camp and choose a contribution before a questing evening. |
| `wow-forever-cozy-sleeping-bag` | wow forever sleeping bag | wow forever sleeping bag quest; wow forever sleeping bag quest alliance; wow forever sleeping bag quest horde; wow forever sleeping bag buff; wow forever sleeping bag worth it; wow forever sleeping bag quest start | How-to: follow the correct faction order and decide when the cross-continent trip fits leveling. |
| `wow-forever-legacy-talents` | wow forever legacy talents | wow forever legacy talents calculator; wow forever legacy talents tree; wow forever legacy talents tier list; wow forever legacy talents reset; wow forever legacy talents respec; wow forever best legacy talents; wow forever legacy talents how to get | Decision/reference: earn points on the current character and choose benefits for the activities actually played. |
| `wow-forever-enhanced-vs-classic-preset` | wow forever enhanced or classic | wow forever enhanced vs classic; wow forever classic or enhanced ui; wow forever classic or enhanced preset; wow forever classic or enhanced reddit | Comparison: choose defaults and know which individual settings can change later. |

### Accessible result samples

These are result positions returned by the accessible search tool, not verified Google rankings. Sources were opened where possible; inaccessible bodies are identified. They do not stand in for People also ask.

Camping, query `"wow forever camping"`, first five organic results:

1. [WoW Classic Forever camping planner](https://wowclassicforever.info/camping/): opened; client-derived feature planning, build 1.60.1.70862, reviewed November 6. Clearly separates client values from beta guides. Gap: a compact solo packing decision and evening sequence.
2. [Mobalytics community camping guide](https://mobalytics.gg/wow-forever/profile/rampagewow-1zhvs5/guides/wow-forever-camping-guide): result describes onboarding and shared camps; direct fetch returned 403. No facts accepted solely from its snippet.
3. [LFCarry camping guide](https://lfcarry.com/guides/wow-forever-camping): opened; broad objects, buffs and blueprint coverage. Commercial guide, so consequential claims require independent confirmation.
4. [Mobalytics campfire guide](https://mobalytics.gg/wow-forever/guides/camping-guide): opened; named profession contributions, placement rules, class-buff conflicts and Legacy perks. Its campfire-material instructions conflict with wow-professions.
5. [Warcraft Tavern camping news](https://www.warcrafttavern.com/forever/news/camping-profession-buffs-in-world-of-warcraft-forever/): opened; system introduction. The site's detailed camping guide is a more useful factual source for this commission.

Sleeping bag, query `wow forever cozy sleeping bag quest guide horde alliance`, first five organic results:

1. [WoWForever.gg quest guide](https://wowforever.gg/en/guides/quest-guides/wow-forever-cosy-sleeping-bag-guide/): result offers both factions and the XP bonus; body not inspected, so this remains a competitor lead.
2. [Wowhead quest guide](https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards): opened; faction order and object-by-object route; explicitly says one-hour buff duration.
3. [Wow Buddy walkthrough](https://wowbuddyguides.com/forever/guides/cozy-sleeping-bag): opened; own video/quest-window provenance and rounded player-position coordinates. Useful independent route cross-check; positions are not identical to object coordinates.
4. [Method sleeping-bag guide](https://www.method.gg/wow-forever/how-to-unlock-the-cozy-sleeping-bag-in-wow-forever): opened; November 8 route and travel advice, two-hour buff, one Old Toolbox. Its Stonetalon camp coordinate differs substantially from other guides.
5. [Warcraft Tavern sleeping-bag guide](https://www.warcrafttavern.com/forever/guides/cozy-sleeping-bag/): opened through ordinary HTTP after the web reader returned 403; faction travel and combined camp/food routine. Lists one bag per faction, not two together.

Legacy, query `wow forever legacy talents`, first five organic results in the multi-query search sample:

1. [AllThingsHow best Legacy talents](https://allthings.how/wow-forever-best-legacy-talents/): opened; activity-specific 16-point lists. Some lists omit prerequisite spending and some rank values disagree with other sources. Do not copy these builds.
2. [Oracle News Network calculator](https://www.oraclenewsnetwork.com/talents): opened; primarily class talents from a named beta dataset, not a complete answer about earning Legacy points.
3. [AllThingsHow class talent trees](https://allthings.how/wow-forever-talent-trees-for-every-class-gold-medals-and-full-lists/): opened; adjacent class-talent intent. Keep normal class points separate from Legacy points.
4. [WoW Forever Wiki Legacy guide](https://www.wow--forever.wiki/en/talents/wow-forever-legacy-talents): opened; full-tree/points framing. Use Blizzard for limits and challenge totals.
5. [WoWGuildHub guide hub](https://wowguildhub.com/wow-forever/guide): opened; links to tools and game data rather than giving a complete first-points decision.

Preset, query `wow forever enhanced or classic preset guide`, first five organic results:

1. [Blizzard starter guide](https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever): opened; authoritative six-setting comparison and the individual-settings change path.
2. [AllThingsHow preset comparison](https://allthings.how/wow-forever-experience-preset-classic-vs-enhanced/): opened; direct answer and settings table. Gap: connect the first changes to an actual evening without repeating the whole beginner guide.
3. [Forever Mastery interface guide](https://forevermastery.com/en/guides/forever-interface-settings): opened; broader interface reference with a separate preset guide. Do not expand this small comparison into an addon/UI manual.
4. [Wowhead starter-guide news](https://www.wowhead.com/ptr-2/news/new-player-s-starter-guide-for-world-of-warcraft-forever-383632): opened; republishes Blizzard material. Not independent confirmation.
5. [Bind on Forever preset comparison](https://bindonforever.com/articles/wow-forever-classic-or-enhanced-preset): opened; setting differences and changing them later, alongside its own product promotion. No promotion belongs in this commission.

Additional searches used: quoted versions of all four primary queries; `wow forever camping buffs camp features guide warcrafttavern`; `wow forever enhanced classic preset settings`; `site:news.blizzard.com "24307383"`; `site:news.blizzard.com/en-us "Legacy System" "Forever"`; `site:news.blizzard.com/en-us "Starter Guide" "Enhanced"`; `site:news.blizzard.com "New Player" "Classic" "Enhanced" "Forever"`; `site:mobalytics.gg/wow-forever "Sleeping Bag" "40.6"`; `site:warcrafttavern.com/forever/guides/cozy-sleeping-bag "40.6"`; `site:wowhead.com/forever "Legacy" "Thrill" "5%"`.

### FAQ selection status

PAA was blocked by an unusual-traffic challenge for all four briefs. The owner authorized the following replacements on 2026-11-09; the query table and competitor samples above provide provenance.

| Brief | Replacement evidence and final FAQ questions | Answer evidence |
| --- | --- | --- |
| Camping | Observed camping buffs/system/features/tent autocomplete plus task's campfire/profession queries and C1–C3: How do I make a campfire? Is camping a separate profession? Do camping buffs stack with class buffs? Can I add three features by myself? Does the Camp Tent give the sleeping-bag bonus? | L, C1–C3, B1/B2, G |
| Sleeping bag | Observed faction-start/buff/worth-it queries plus task quest-chain queries and B1–B6: Where does the Horde quest start? Where does the Alliance quest start? What level can I start? How long does the XP buff last? Is it worth leaving my leveling route? Do I get two 12-slot bags? | B1–B6, with disputed duration/rewards explicitly qualified |
| Legacy | Observed how-to-get/best/respec/tree queries plus task's points queries and G/G1–G3: How do I unlock Legacy talents? Do I need alts? Are points spent separately on each character? Which talents should a solo leveler take first? Can I reset Legacy talents? Does Well Rested increase all XP? | G, G1–G3 |
| Preset | Observed enhanced-vs-classic/UI/preset queries plus task's switch/HD-vs-SD queries and L/P: Should I choose Enhanced or Classic? How do I switch later? Can I use SD models with quest guidance? Does Enhanced change character power? | L/P |

Each guide's primary query, distinct intent, useful gap, source ledger, table plan and sibling links are recorded below. FAQs translate observed intents into natural questions; their wording is editorial, not a purported verbatim Google capture.

## Evidence ledger

All successful source accesses below occurred on **2026-11-09 UTC**. The dates/builds named in the scope column describe source evidence; they are not live-client tests. Each final guide includes its own relevant subset of these URLs with the 2026-11-09 access date.

| Key and source | Supported claims and scope | Publication treatment |
| --- | --- | --- |
| L: [Blizzard, Forever Now Live](https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live) | Launch announcement: shared campsite, three features with one contribution per player, at least a minute sitting or crafting, corresponding class-buff exclusion. Preset defaults and HD/SD appearance choice. | Primary authority for rules, numbers and defaults. |
| P: [Blizzard, New Player's Starter Guide](https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever) | Six settings differ: models, quest guidance, one-bag, transmog, movement binds, layout. Enhanced is the recommendation when unsure. Initial screen does not reappear; individual settings change in Game Menu > Options. | Do not promise a later one-click preset switch. Models are character-specific and changeable through Options or a Barbershop. |
| G: [Blizzard, Get to Know the Legacy System](https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system) | Launch cap 16 spent per character; points shared, allocations independent. One character can earn 3 leveling, 6 tradeskill, 12 PvP, 2 Adventure and 6 dungeon/raid points. Unlock on first point. Field Guide, Permanence, Reagent Economy and Well Rested are explicitly described. | Supersedes sources that say 16 was only a beta grant. No need to make alts for all character advantages. |
| C1: [wow-professions, Camping Guide](https://www.wow-professions.com/forever/camping-guide) | Basic Campfire Kit via Cooking/Professions; feature names, benefits, recipes and class-buff conflicts. Says only Simple Wood is required for the basic kit. Camp Benefits is inspectable. | Read alongside C2/C3. Avoid a definitive Flint and Tinder requirement. |
| C2: [Mobalytics, Campfire Guide](https://mobalytics.gg/wow-forever/guides/camping-guide) | Updated Nov 3. Named profession features and benefits, shared feature cooldown, relevant profession requirement, buff conflicts, upgrade examples and cooked-food XP. Says Flint and Tinder is needed. | Corroborates feature functions, not proof of every current recipe requirement. |
| C3: [Warcraft Tavern, Camping Guide](https://www.warcrafttavern.com/forever/guides/camping/) | Profession table, combined Camp Benefits, shared contributions, sleeping-bag and cooked-food compatibility, Legacy camping benefits. | Useful routine evidence. Has the same tool-requirement disagreement as C2. |
| B1: [Wowhead, Cozy Sleeping Bag locations and rewards](https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards) | Updated Nov 8, patch 1.60.1. Level 14, 1% per minute up to 3%, both faction orders, common route and named objects. Says buff lasts one hour. | Duration remains disputed. Student Fodder is health recovery here; never import its Season of Discovery XP effect. |
| B2: [Method, How to Get the Cozy Sleeping Bag](https://www.method.gg/wow-forever/how-to-unlock-the-cozy-sleeping-bag-in-wow-forever) | Nov 8. Confirms XP stacks and one-hour item cooldown, but says two-hour buff. Documents one 12-slot Old Toolbox. Provides travel guidance and decimal coordinates. | Distinguish buff duration from item cooldown. Do not promise two inventory bags. |
| B3: [Mobalytics/RampageWow, How to Get the Cozy Sleeping Bag](https://mobalytics.gg/wow-forever/profile/rampagewow-1zhvs5/quests/how-to-get-the-cozy-sleeping-bag-in-wow-forever) | Oct 9 walkthrough with linked video, opened this run. Matches B1's route and coordinates. | Beta-era corroboration must remain identified as such; does not alone establish live changes. |
| B4: [ConquestCapped, Cozy Sleeping Bag Guide](https://conquestcapped.com/guides/wow-forever/wow-forever-cozy-sleeping-bag/) | Updated Nov 7. Matches B1's detailed route, but labels two 12-slot bag rewards as beta data. Calls the dam object Carved Figurine; two-hour buff. | Not sufficient to claim two live bag rewards. Similar route text is not assumed to prove independent verification. |
| B5: [Wow Buddy, How to Get the Cozy Sleeping Bag](https://wowbuddyguides.com/forever/guides/cozy-sleeping-bag) | Own walkthrough/video provenance. Confirms faction order, landmark route, Pocket Litter, Mound of Dirt and Carved Figurine. Player-marker coordinates differ slightly from B1's object positions. | Independent landmark check; do not turn nearby player positions into exact object coordinates. |
| B6: [Warcraft Tavern, Cozy Sleeping Bag Guide](https://www.warcrafttavern.com/forever/guides/cozy-sleeping-bag/) | Route and shared camp/food routine. Confirms level 14 and the one-hour item cooldown. Lists Old Toolbox for Alliance and Sturdy Lunchbox for Horde, one each. Student Fodder totals differ from B1. | Exclude disputed totals and bag names from promises until checked. |
| G1: [ForeverCalc, Legacy perks](https://forevercalc.com/legacy/) | Explicit beta build 1.60.1.70425; export Nov 4. Rank text and prerequisite relationships. | Do not present as a live-build verification. Some descriptions differ from newer official text, notably Reagent Economy's camping component. |
| G2: [Wowhead, Legacy System Overview](https://www.wowhead.com/forever/guide/legacy-system-overview-rewards) | Updated Oct 24, patch 1.60.1. Rank table, trainer respec, challenge list. Performance Bonus and Luremaster rank counts disagree with G1. | Only agreeing rank details may be considered; no complete live build can be claimed from these two alone. |
| G3: [Method, Best Way to Spend Legacy Points](https://www.method.gg/wow-forever/the-best-way-to-spend-your-legacy-points-in-wow-forever-best-legacy-talent-builds) | Oct 9. Explains prerequisites and activity choices. Respec at a class trainer in a major city; quoted price explicitly beta and final fee/escalation unconfirmed. | State trainer location as reported; omit numeric respec price. Recommendations remain editorial choices, not measured fastest builds. |

### Camping table plan and useful specifics

Plan columns: **Camp feature / Profession / What it gives / When it helps**. C1, C2 and C3 agree on these core matches: Mana Well/Alchemy/mana recovery; Sharpening Wheel/Blacksmithing/Strength; Enchanted Lute/Enchanting/attributes and resistances; First Aid Kit/First Aid/Stamina; Fish Bowl/Fishing/attributes; Incense Candle/Herbalism/Intellect; Camp Tent/Leatherworking/rested XP; Lodestone/Mining/melee attack power; Camp Chair/Skinning/critical chance; Faction Banner/Tailoring/Spirit; Reagent Bot/Engineering/vendor service. Basic Campfire/Cooking establishes the campsite. Use qualitative buff descriptions unless the final ledger has two current independent sources for a number.

The actionable solo decision is which missing benefit the player's own profession can provide. Existing corresponding class buffs change that choice. Do not imply one solo player can fill all feature slots. Explain Camp Features and rested XP with sourced terms. Use a natural link to the sleeping-bag page for obtaining the reusable item and to the Legacy page for camping perks; the beginner page supplies wider first-login context.

Plan the evening sequence as editorial advice: check needed benefits, make/use the camp and a supported contribution, rest with the sleeping bag, eat suitable cooked food, inspect the active buffs before leaving. Well Rested changes rested accumulation/cap (G); it must not be described as the sleeping bag's flat XP bonus. Recipe/tool requirements need one local caveat, not repeated empty hedges.

### Sleeping-bag route reconciliation

Plan one table with **Faction/step / Quest or object / Zone / Coordinates / Action**. Use both opening orders, then shared steps. It is an object chain; inventing an NPC quest giver would mislead.

| Stop | Agreement and remaining issue |
| --- | --- |
| Alliance first, Horde second: Westfall | B1, B2 and B6 agree on approximately 37, 50 at Alexston Farmstead. B2 gives 37.14, 50.13. B5 has a nearby player marker. Remains/plank labels differ across walkthroughs; refer to the remains and adjacent plank, with the quest state determining interaction. |
| Horde first, Alliance second: Barrens | B1, B2 and B6 agree on approximately 46, 74 south of Camp Taurajo. B2 gives 46.12, 74.32. |
| Stonetalon path and Pocket Litter | B1/B3/B4 give path 50.9, 52.3 and camp 40.6, 52.4; B5 places its character around 40.8, 52.6. B2 instead prints 54.63, 52.44 for the camp. Exact live camp coordinates remain disputed; the guide states that discrepancy locally. The entrance coordinate is omitted because independent current agreement is not established; the northeast-of-Sun-Rock-Retreat landmark remains. |
| Stonetalon Mound of Dirt | B1/B3/B4/B5 agree on 39.6, 49.8. B2 gives 39.61, 49.88. Complete Scramble and accept Wet Job before leaving the mountains. |
| Loch Modan dam | B1/B3/B4 agree on 49.4, 12.9; B2 gives 49.45, 12.91. B5 confirms the ledge and Carved Figurine. Avoid calling a player-marker coordinate an exact object position. |
| Hillsbrad side of Thoradin's Wall | B1/B3/B4 give cart 87.3, 49.6; B2 gives 87.36, 49.62. B5 shows a different nearby approach. Climb, interact with Messenger Bag, then the final satchel. |

Do not print the two 12-slot bags as a confirmed reward: B4 explicitly derives that from beta data, B2 reports one, B6 separates the names by faction. Do not resolve the one-hour versus two-hour buff conflict by majority vote. The practical recommendation is to inspect the actual active buff timer. Do not include XP totals, a completion time, guaranteed safe low-level travel, or a claim that the quest is the fastest leveling detour.

M scope only if supported detail warrants it. The faction order, long crossings, dangerous opposing territory, climbs and routine supply the substance. Link to camping for feature selection and the beginner guide for starting decisions. Term candidates: rested XP and Student Fodder only if the latter remains in the final text.

### Legacy point and recommendation plan

Plan columns: **Source / Points on one character / What earns them**. Use G's totals rather than combining an account total with a single-character total. Account challenges total 65, while Blizzard's single-character example totals 29; neither is the spending cap. Leveling milestones are 25/45/60, crafting milestones 150/225/300 for eligible non-gathering primary professions. PvP has rank, reputation and seasonal quest requirements. Dungeon and raid points require the listed completion challenges, not every ordinary boss kill.

For the first 16 points, distinguish solo recovery, crafting/gathering and PvP priorities. Thrill of Adventure, Well Rested, Working Overtime, Bountiful Harvest, For Great Honor and Diplomat have different purposes. A recommendation needs its activity condition and the prerequisite cost. G1/G2 rank disagreements prevent importing a supposedly complete optimal build. The final rank pass reopened G1 and G2 on 2026-11-09: the used rank limits agree, while the plans explicitly retain the beta scope. G1 gives the prerequisite arrows; G3 supplies the activity/prerequisite cross-check. Performance Bonus and Luremaster are excluded from the allocations because their rank counts disagree. Trainer respec location is reported by G2/G3; live price and repeat-reset scaling remain unconfirmed.

The camping connection uses G's explicit Field Guide, Permanence, Reagent Economy, Gourmand and Well Rested descriptions. Link camping and sleeping bag for the routine; link the beginner page for the larger system overview. Term candidates: account-wide points, rested XP, eligible tradeskill. M depth is a scope target, not permission to fill gaps with generic build advice.

### Preset comparison plan

Plan columns: **Setting / Classic default / Enhanced default**. P and L agree on all six rows: SD versus HD models; quest points of interest/objective areas off versus on; one-bag off versus on; transmog off versus on; camera turning versus strafe keyboard binds; Classic versus centralized layout. The first answer should recommend Enhanced when unsure, conditional on wanting guidance; Classic suits a deliberate preference for fewer prompts.

Explain later adjustment through Game Menu > Options, explicitly at the individual-setting level. HD/SD is per character and appearance-only. Do not claim difficulty, combat stats, progression, ruleset or XP changes. Practical first changes can be framed as advice about finding quest destinations, reading inventory and movement preference. Link camping for the evening stop, sleeping bag for the route, and beginner for ruleset/character choices. S depth, 600–1,000 words only if the factual answer supports it. Term candidate: quest objective areas, using P's actual description and no invented controls.

## Failed access and excluded leads

- Google's HTML retry pages and Chromium unusual-traffic challenge are failed access, not empty search results. No challenge-solving or access bypass was attempted.
- The short Blizzard Legacy URL redirected in a loop; its full titled URL opened successfully.
- The web reader returned 403 for both Warcraft Tavern guides. Ordinary HTTP subsequently returned readable article bodies, which were inspected.
- Guessed Wowhead Legacy paths `/forever/guide/legacy-system` and `/forever/guide/legacy-system-overview` failed. The discovered `/forever/guide/legacy-system-overview-rewards` succeeded.
- Guessed Mobalytics `/wow-forever/guides/cozy-sleeping-bag-guide` and Forever Mastery `/en/guides/forever-classic-or-enhanced` failed. Discovered quest/interface pages are recorded above.
- The Mobalytics Legacy guide was opened, but its overview's crafting unlock statement and swapped tree heading make it unsuitable as authority over Blizzard.
- Ragetusk's search result disputed the launch cap using beta context; the opened Blizzard article explicitly establishes the launch cap. No claim is sourced to that result.
- No third-party images were downloaded for guide publication. The four new guides contain no image blocks.

## Final guide metadata and review

Counts below include spaces in metadata. Word counts include headings, prose, table captions/headers/cells and FAQ; term markup counts as its visible label. Sources, term definitions, navigation and template text are excluded.

| Guide | Title | Title characters | Description characters | Words | Scope |
| --- | --- | --- | --- | --- | --- |
| Camping | WoW Forever Camping: Buffs and Camp Features | 44 | 132 | 1,233 | M: making a camp, profession contributions, solo packing and buff routine |
| Sleeping bag | WoW Forever Sleeping Bag: Both Faction Routes | 45 | 133 | 1,446 | M: both starting orders, shared object route, crossings, rewards and use |
| Legacy | WoW Forever Legacy Talents: Your First 16 Points | 48 | 138 | 1,533 | M: point sources, prerequisite-aware starting allocations, activity tradeoffs and resets |
| Preset | WoW Forever Enhanced or Classic: Which Preset? | 46 | 135 | 765 | S: six defaults, individual changes and appearance choice |

The final Legacy examples allocate 16 points each: solo uses 5 Thrill of Adventure, 5 Well Rested, 5 Talented and 1 Field Guide; the crafter/gatherer/cook uses 5 Working Overtime, 5 Bountiful Harvest, 5 Master Chef and 1 Thrill of Adventure; the Honor/reputation plan uses 3 Gourmand, 2 The Quick and the Dead, 5 For Great Honor, 5 Diplomat and 1 Reagent Economy. G1/G2 agree on the used rank limits. The spending order includes G1's five-point tree gates, Well Rested before Talented and The Quick and the Dead before Reagent Economy. These are conditional editorial starting plans, not measured optimal builds or a claim to have tested live ranks.

Editorial rubric pass:

- Query record and FAQ: distinct query ownership, dated autocomplete and five accessible result samples per topic. Each brief's FAQ row records the owner-authorized PAA replacement; all answers have separate factual evidence.
- Promise and opening: concrete campsite rule, level-14 faction starts, level-25 first-point route and the Options path. Each primary query is answered in the first two sentences.
- Decision, truth and interest: missing camp benefits determine the contribution; crossings determine when to obtain the bag; played activities determine Legacy spending; guidance preference determines the preset. The named objects, coordinates and point sources remain actionable without opening source tabs. Unresolved claims are qualified locally.
- Tables and FAQ: all four have authored tables and one visible FAQ each (5, 6, 6 and 4 entries respectively). Legacy also has an allocation table. All answers mirror FAQPage in rendered server HTML.
- Links: every page links to the beginner guide and `/forever`; camping and sleeping bag link each other, with relevant Legacy links. The preset links to camping and sleeping bag. The nine-guide bundle validates internal destinations and unique metadata.
- Metadata, length and clarity: rendered title/description limits pass; system and short-comparison scopes fit their facts. Openings, headings and link labels form an action sequence. Useful terms have sourced definitions and working inline explanations. No new player-facing em dashes, generic introductions, invented anecdotes or image placeholders.
- Uncertainty and images: source dates/builds are distinct from live-client testing. Camp tools, Stonetalon position, bag duration/rewards and Legacy rank/reset scope are qualified at the relevant claims. No third-party art or new guide images.
- Technical search and maintenance: canonical URLs, indexability, sitemap, one H1, visible bodies and term definitions pass locally. Recheck after camping recipe changes, sleeping-bag quest/reward changes, Legacy tree or reset changes, and preset-default changes. Replace disputed data only with the required agreement or an own in-game capture; publish revisions through the content store.

## Delivery and validation

Migration `0024_forever_systems.sql` follows 0023's existing-site policy. A fresh database stays empty. Existing sites receive four new version-1 publications plus beginner version 3. Any target slug collision or changed/missing beginner publication aborts the transaction. History, content hashes, runtime timestamps and replay markers are preserved, including later owner publications and drafts.

The existing beginner document has preset, camp and Legacy sections, but **does not mention the sleeping bag by name**. Its four new link blocks place the sleeping-bag destination beside the camp section. All other blocks, metadata, sources, evidence dates and its own hero are preserved byte-for-byte in the normalized document.

The Forever hub groups the four published slugs under Systems. Other guides remain in the main grid. Topics remain unused because the parser reserves them for Paths. The default content checker validates the effective nine-guide catalog from migrations 0023 and 0024. The HTML audit discovers all published slugs and checks tables, visible FAQ answers and schema together, including JSON-LD type arrays.

Local validation uses an isolated user-space PostgreSQL database seeded with the prior publications, then both content migrations, and a production web build. All nine guides and the hub pass `scripts/audit-guides.py --expect-terms`. Migration tests cover publication, hashes, beginner preservation, retained history, empty databases, replay after later publication/draft, slug/Game collisions and changed/missing beginner content. Browser checks cover 360, 390, 768 and 1280-pixel layouts, table scrolling, hub/beginner links, hover/keyboard/touch explanations and no-script definition links. Final full-suite results and checked commit are recorded in the draft PR.

Server changes are the content migration, migration tests and content-check tooling; no Server runtime or schema changes. Deploy the compatible web first, then start the Server with migration 0024 through its normal runner. See [the rollout and rollback notes](../content-authoring.md#migration-0024-handoff). This task performs no deployment.
