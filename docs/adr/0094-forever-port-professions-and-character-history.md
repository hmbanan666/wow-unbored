# 0094. Bory in WoW Forever: professions first, then a character history page

Status: accepted (2026-11-11). Supersedes ADR 0091.

## Context

The owner wants Bory in WoW Forever, ideally as the main game, because most players and search demand moved there. His two priorities, in order:

1. Profession leveling and recipe collecting: which recipes this character knows and which it misses, where each missing one comes from (trainer, vendor, limited supply, drop, quest), and a skill-up route. In the game and synced to the website.
2. A personal character page on the website with the history of the character: level, professions and skill, recipes learned, gold, gear and reputation over time.

Everything else (leveling next steps, camping, Merchant's Favor, raid prep) is secondary.

Facts checked on 2026-11-11 (sources at the end):

- Forever is a modern client with Classic content: client 1.60.1, interface 16001, launcher product `wowf`, install folder `_forever_` next to `_retail_` [S1, S3, S4]. Blizzard's UI source for 1.60.1 (70888) ships the Retail-style `Blizzard_Professions`, `Blizzard_Collections`, `Blizzard_AchievementUI`, `Blizzard_Calendar`, `Blizzard_LegacySystem` and the `C_` namespaces [S1].
- Of the 91 `C_` functions the addon calls today, 77 are documented in Forever. Missing: all of `C_ToyBox`, six `C_PetJournal` calls and two non-functions [S1, own diff]. Most Retail-only data (M+, Great Vault, renown, delves) will simply read empty; the code already guards with `pcall` and nil checks, but this is untested in the client.
- Professions: `C_TradeSkillUI.GetRecipeInfo`, `GetBaseProfessionInfo`, `GetChildProfessionInfos` and `C_SkillInfo` exist. `GetAllRecipeIDs`, which our `recipes` Section uses, is not in Forever's API documentation; Blizzard's own UI lists recipes with `GetFilteredRecipeIDs` and turns "show unlearned" off by default on Forever [S1]. Questie reads Forever skill lines with `C_SkillInfo` because the old global skill API is gone [S2].
- Trainer (`GetTrainerServiceInfo`, `GetTrainerServiceSkillReq`, `GetTrainerServiceCost`) and merchant (`C_MerchantFrame.GetItemInfo`) APIs exist [S1].
- Client tables for Forever builds are on wago.tools as product `wowf` (build 1.60.1.70888): `SkillLine`, `SkillLineAbility` with `MinSkillLineRank`, `TrivialSkillLineRankLow/High`, `NumSkillUps`, `AcquireMethod`, plus `SpellReagents`, `ItemSparse`, `ItemEffect`, `SpellEffect`, `TradeSkillCategory`, `Faction`, `Achievement` [S5]. Blacksmithing alone has 527 ability rows. Our Game DB already imports Retail tables from wago.tools (`game-content.ts`, `game-watch.ts` accept only product `wow`).
- No client table or Blizzard API says which NPC sells or drops a recipe item. That is server data.
- Battle.net API: Blizzard has not documented Forever, but third-party probes found working namespaces `profile-forever-{region}`, `static-forever-{region}`, `dynamic-forever-{region}`. Character profile path is `/profile/wow/character/{first}-{surname}` (no realm), level 10+ only, with a `professions` document that lists skill and known recipes; static `profession/{id}/skill-tier/{id}` lists every recipe; auctions hang off rulesets [S6, S7]. Unofficial, may change.
- Forever characters have a first name plus surname, unique per region, and rulesets instead of realms [S6]. Our character id is `realm/name` (`data.ts characterId`).
- `section_history` already keeps every change of every Section for 13 months (`retention.ts`). The `char` Section has level, xp, money, ilvl; `gear`, `professions`, `recipes`, `reputation` exist. The data for a history page is already collected on Retail.
- BigWigs packager knows game type `forever` (interface 16xxx, `_Camelot` TOC suffix) and accepts a mainline TOC that lists both Retail and Forever interfaces [S8].

## Decisions

### 1. One addon, one zip, both games
`Unbored.toc` lists `16001` next to the Retail interfaces. At load `ns.Game` is `forever` when the interface number is 16000 to 16999, else `retail` (the same rule Questie uses; `WOW_PROJECT_ID` is not trusted, Questie saw 1 on beta while the UI source defines 18). Each Section and Provider declares the games it runs in; Retail-only ones (mplus, vault, toys, pets, transmog, renown ideas, delves, Retail presets, Retail Knowledge base) do not register on Forever. If the first in-game probe shows the client ignores the shared TOC, fall back to `Unbored_Camelot.toc` with the same file list.

Rejected: a separate `Unbored_Forever` addon (two code bases, two listings, two Companion paths); Forever-only fork (Retail users keep the product).

### 2. Forever characters get their own identity
Every character, Section and Request carries `game`. A Forever character id is `forever/<region>/<Name-Surname>` once T0 shows how the client exposes the surname and region; until then `forever/<realm as GetRealmName returns it>/<name>`. Retail ids stay unchanged. Server tables `characters`, `sections_latest` (via owner id), `history` and the Game DB get a `game` column, default `retail`.

### 3. Professions are the core of Forever Bory
- **Game data (Server).** The Game DB imports Forever builds (product `wowf`) next to Retail. A Forever profession catalog is built from `SkillLine`, `SkillLineAbility`, `SpellReagents`, `ItemSparse`, `ItemEffect`, `SpellEffect`, `TradeSkillCategory`: every recipe per profession, the skill to learn it, its orange/yellow/green/grey thresholds, skill-ups, reagents, and which recipe item teaches it. `AcquireMethod` values are mapped only after checking them against known trainer and recipe-item recipes; until then the source kind comes from the item link (taught by an item) or the trainer sightings below.
- **What the character knows (addon).** `professions` reads skill lines through `C_SkillInfo` on Forever. `recipes` reads learned recipes whenever the profession window opens, using `GetAllRecipeIDs` if present, else `GetFilteredRecipeIDs`, and stores each recipe's difficulty colour. Forever gets the same Packed id sets as Retail.
- **Where missing recipes come from.** Three sources, each shown with where it came from, never guessed:
  1. Trainer: the addon records what a trainer offers when the player opens one (recipe, skill needed, cost, trainer NPC and map). Sightings from all sharing Accounts are merged on the Server.
  2. Vendor and limited supply: the addon records recipe items on merchants the player opens (item, price, `numAvailable` for limited supply, NPC and map).
  3. Drops, quests and anything not yet sighted: a vetted Catalog row with a primary source URL, or "comes from {item}" with no place. Third-party databases are read for research only, never imported; Questie's data is GPL and wowhead-style sites have their own terms.
- **Skill-up route.** Deterministic Server code, not the Planner: from the current skill to a target, pick the cheapest recipes this character knows or can train whose orange or yellow range covers each stretch, with reagent counts and the trainer visits in between. Prices come from vendor prices in `ItemSparse`; auction prices from the Forever ruleset auction houses are a later step. The Planner may phrase the Plan but never changes the recipe choice.
- **In the game.** Bory offers a Profession idea ("Tailoring 112 / 150: next 3 crafts") that starts a Quick plan from the route the Companion delivered; a recipe item's tooltip gets an Advice line ("Bory: new recipe for you, Tailoring 125" or "Mira can learn this"); the Bubble can show "Recipes: known 34 of 120".
- **On the website.** The character page shows each profession with skill, known of total recipes, the missing ones grouped by source, and the route.

### 4. Character page with history
A signed-in page per character (`/my/<character>`; noindex, owner only, same session as ADR 0073). The Server derives a small `character_events` table at ingest from Section changes: level up, profession skill step, recipe learned, gold change (daily close), gear slot change, reputation standing change. The page shows a timeline plus two charts (level and gold over time, skill per profession). Events are backfilled once from `section_history` for the last 13 months. Events stay until Forget my data. Works for Retail characters too.

Rejected: diffing `section_history` on every page view (slow, partitions drop after 13 months); a public profile (privacy, not asked).

### 5. Companion finds Forever
`wow.rs` detects `_forever_` beside `_retail_` (same roots, same registry and Battle.net config scan), installs the same addon zip into each found game, reads both WTF trees and tags every upload with `game`.

### 6. Battle.net API is a later supplement
The profile API could fill professions and recipes for level 10+ characters without the addon. It is undocumented for Forever and needs the character's full name and region, so it is not on the critical path. Revisit after the addon path works.

### 7. Release and catalogs
The single zip is uploaded to CurseForge and Wago for Retail and Forever. Listings and `/install` say "Retail and WoW Forever" only after the owner's in-game check of the Forever build. ADR 0079's "no install prompt on Forever pages" ends then; Forever profession guides get the install prompt first. Release tags still need the owner.

### 8. Secondary, after the core
Leveling next steps from the quest log, camping, Merchant's Favor and Waylaid Crates, raid preparation (opens 2026-12-09), Legacy System progress (it is built on renown and achievements in the client, so the existing readers may already see it).

## Unknowns to settle in T0 (one in-game probe by the owner, about five minutes)
- Does the client load an addon whose TOC lists `120107, 16001`, or does it need `_Camelot`?
- What do `GetRealmName()`, `UnitName("player")`, `GetNormalizedRealmName()` return, and is the surname available to addons?
- Exact WTF path under `_forever_` (account, realm folder name).
- Do `C_TradeSkillUI.GetAllRecipeIDs` and `GetFilteredRecipeIDs` exist and return unlearned recipes on Forever?
- `SkillLineAbility.AcquireMethod` meaning (values 0 to 3 seen).
- Do the Midnight-era addon restrictions (secret values) apply in Forever? The client shares the modern UI code.
- Forever Battle.net API stability and whether Blizzard documents it.

## Consequences
- Forever traffic can turn into installs, which ADR 0091 ruled out.
- The Server carries two Game DBs and a `game` dimension everywhere; every query that reads Game DB rows must pass the game.
- Recipe sources grow with players who share data; early on many recipes show "comes from {item}" without a place.
- Retail gets the character history page for free.

## Sources
- S1 Blizzard UI source, `forever` branch, 1.60.1 (70888), https://github.com/Gethe/wow-ui-source/tree/forever (read 2026-11-11)
- S2 Questie, Forever compatibility notes, https://github.com/Questie/Questie/blob/master/docs/forever-development.md
- S3 Questie `Questie_Forever.toc` (`## Interface: 16001`)
- S4 InvurseUI project, https://github.com/InvurseStudio/InvurseUI (client 1.60.1, interface 16001)
- S5 wago.tools builds API (product `wowf`) and DB2 CSVs for build 1.60.1.70888
- S6 WoW: Forever API notes (third party, probed), https://mhuijskens.com/WoWForever/Api/ (checked 2026-11-05 by its author)
- S7 Blizzard API forum threads 59774, 60334, 60355, https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334
- S8 BigWigs packager `release.sh`, https://github.com/BigWigsMods/packager
