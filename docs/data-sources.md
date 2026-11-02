# Open data ids

Ids that are still **not** in code or the catalog because no primary source pins them down (D213). Never guess one. When a row here gets its answer, add the catalog row in a small follow-up PR with the source URL in a comment, and delete the row here.

The cheapest source is the owner's own client: during a Timewalking week, `get_game_data` on the `calendar` Section (v2: `eventID`, `texture`) and the `questLog` Section show what the game itself says. Pair that with a wowhead or warcraft.wiki.gg page before a row goes in.

Known and sourced rows live in `addon/Data/Holidays.lua` and `packages/contracts/catalog/catalog.json` (Timewalking weeks for Outland, Northrend, Cataclysm, Pandaria, Draenor and Legion, matched by the wowhead event ids 559, 562, 587, 643, 1056, 1263).

## Timewalking: does the calendar carry the event id?

| What | Why it is open | How to get it |
| --- | --- | --- |
| `CalendarDayEvent.eventID` for a Timewalking week equals the wowhead event id (559, 562, ...) | Not confirmed from the client; the catalog matches on it (TODO(verify-in-game) in `Holidays.lua`) | During a Timewalking week: `get_game_data` → `calendar` v2 → the row's `eventID` and `texture`. If it differs, add `textures` to the row's `match`. |

## Timewalking: the weekly quest

| What | Why it is open | How to get it |
| --- | --- | --- |
| Quest id of "complete five Timewalking dungeons" for each expansion week | wowhead lists several level versions per week; which one the player gets is not clear | During a week, pick the quest up and read `questLog` from `get_game_data` (its `questID`), then confirm on its wowhead quest page. |

## Timewalking: Timewarped Badge prices

| What | Why it is open | How to get it |
| --- | --- | --- |
| Badge cost of each Timewalking vendor mount and toy | The vendor price is client text with a currency name, not an id (`GetMerchantItemCostItem`, D184); no sourced table | warcraft.wiki.gg [Timewarped Badge](https://warcraft.wiki.gg/wiki/Timewarped_Badge) per item, cross-checked on wowhead; then a `cost` on the catalog task. |

## Timewalking: weeks without a row

| What | Why it is open | How to get it |
| --- | --- | --- |
| Classic, Battle for Azeroth, Shadowlands and Dragonflight Timewalking weeks: event ids and their vendor rewards | No sourced event id, vendor or reward list yet | The week's calendar row from the owner's upload (`eventID`, `texture`), plus the wowhead event page and the vendor's page. |

## Timewalking: Warlords vendor mounts by faction

| What | Why it is open | How to get it |
| --- | --- | --- |
| Which of the two Warlords Timewalking vendor mounts (ids 1242 and 1243 as named in D213, unverified) is Alliance and which Horde | The side per mount is not sourced, so a plan could offer the wrong one | warcraft.wiki.gg [MountID](https://warcraft.wiki.gg/wiki/MountID) and each mount's wowhead page (its faction tag); then two catalog tasks with `faction`. |

## Farm rewards

The checked reward table is `addon/Data/Farm.lua`: `mountSources[mountID]` records one acquisition method per mount, with Warcraft Wiki and Wowhead links beside it. Journal ids were checked against [MountID](https://warcraft.wiki.gg/wiki/MountID). HFC now has 751 (Mythic Archimonde) and 758 (achievement 10149); Glacial Tidestorm 1219 belongs to Mythic Jaina in Battle of Dazar'alor. G.M.O.D. lists Mekkatorque on Normal/Heroic/Mythic; its alternate Raid Finder source is Jaina. The table records the boss route used by the idea, not every alternate way to obtain a mount.

| What | Why it is open | How to get it |
| --- | --- | --- |
| A replacement mount reward for the removed `farm-palace` row | Its former mount 1219 comes from [Mythic Jaina](https://warcraft.wiki.gg/wiki/Glacial_Tidestorm), confirmed on [Wowhead](https://www.wowhead.com/item=166705/glacial-tidestorm); it has moved to `farm-bod`. No replacement id was guessed. | Verify an Eternal Palace reward's journal id on MountID and its boss/difficulty or achievement on its Warcraft Wiki and Wowhead pages before restoring the row. |

## Instance guides (ADR 0061)

`apps/server/src/instances.ts` reads public [JournalInstance](https://wago.tools/db2/JournalInstance/csv), [JournalEncounter](https://wago.tools/db2/JournalEncounter/csv), [UiMap](https://wago.tools/db2/UiMap/csv), [UiMapGroupMember](https://wago.tools/db2/UiMapGroupMember/csv), [Achievement](https://wago.tools/db2/Achievement/csv), [CriteriaTree](https://wago.tools/db2/CriteriaTree/csv), and [Criteria](https://wago.tools/db2/Criteria/csv) CSVs. These expose the exact join keys, journal ordering, fractional coordinates, localized floor names, and achievement descriptions without requiring credentials. English is the default; `?locale=ruRU` supplies Russian text. Files share the criteria resolver's `/data/wago` cache: 24-hour TTL, 20 MB per file, streaming download cap and 20-second timeout. Only these seven table names and two locales are requested.

The joins are deliberately typed. Criteria type 8 references a child achievement; type 165 references `JournalEncounter.DungeonEncounterID`. Type 0 references a creature: when Game Data credentials are configured, `blizzard.ts` reads `/data/wow/journal-encounter/{id}` and matches its `creatures[].id`. Those projected documents have a 24-hour cache, at most 256 entries, a 64 KB accepted document cap and at most 100 creature ids each; requests have a four-second timeout and at most three run concurrently. Failures leave the criterion unmapped. Type meanings are checked against [the game data enum implementation](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/DataStores/DBCEnums.h); journal field relationships are documented in [the DB2 definitions](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/JournalEncounter.dbd).

Never join a spell asset, creature display id, or a coincident number to a boss. A criterion is assigned only when every terminal child requirement proves the same single boss; partial, ambiguous and unsupported mappings remain in `unmapped`, including their descriptions and any partial evidence. The original criterion id always stays attached to its owning achievement; tree ids are separate. An achievement's `Instance_ID` joins `JournalInstance.MapID` to infer a unique journal; multiple candidates are returned for the caller to choose, never guessed by name.

Live public-data check: Hellfire Citadel is journal **669**, lockout Map **1448**, with **13** bosses and boss UiMaps **661–670** (not every floor has a boss). Achievement **10149** has 13 child achievements. Without Game Data credentials, the typed DB2 joins prove **10057 → Iron Reaver** and **9972 → Kilrogg Deadeye**; the remaining 11 are explicitly unmapped, with their full instructions available to the Planner. The Game Data creature path is tested with mocked responses; its live credentialed results were not verified here.

Friction: these tables provide floor destinations, not an entrance coordinate or a graph of doors and portals. The guide returns `entrance: null` and explains that limitation; the Planner can direct the player to a named floor and boss point, and may carry an unmapped description to the boss it explicitly names, but cannot invent connecting passages or mechanics absent from the supplied text. Shared criteria trees, spell-event internals and prerequisite logic are not reverse-engineered into tactics.
