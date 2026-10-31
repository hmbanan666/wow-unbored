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
