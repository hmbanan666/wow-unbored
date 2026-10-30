# 0034. Entity markup in Plans

Status: accepted

Plan text may carry `{item:ID}`, `{quest:ID}`, `{ach:ID}`, `{spell:ID}`, `{currency:ID}`, `{npc:ID}` and `{pin:MAPID:X:Y}`, each with an optional `|label`, at most 12 per Step, with NPC details in an `entities` side table (D72). The Server checks structure and returns `warnings` from `put_plan`/`answer_request`, and checks existence against the Blizzard Game Data API only when credentials are configured (D73). The addon renders native hyperlinks in the Bubble with names always from the game; an id that does not resolve shows as plain text (D74).
