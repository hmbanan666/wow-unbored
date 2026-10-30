# Entity markup

Plan Step `title` and `note`, and the `message` of an answer, may name game things with short tokens. Wisp turns them into native links in the Bubble: hover shows the game tooltip, click opens it, shift-click puts the link in chat. Names always come from the game ([ADR 0034](../../docs/adr/0034-entity-markup.md)).

| Token | Means | Example |
| --- | --- | --- |
| `{item:ID}` | an item | `{item:6948}` |
| `{quest:ID}` | a quest, in the log or not | `{quest:78713}` |
| `{ach:ID}` | an achievement | `{ach:964}` |
| `{spell:ID}` | a spell | `{spell:2006}` |
| `{currency:ID}` | a currency | `{currency:2815}` |
| `{npc:ID}` | an npc from `entities.npc` | `{npc:12345}` |
| `{pin:MAPID:X:Y}` | a map spot; click sets the waypoint | `{pin:2339:52.1:47.3}` |

Each token may end with `|label`: `{npc:12345|Fixer Kev}`. The label is shown while the game has not loaded the thing, and wherever links cannot show (the tracker, chat). Labels are at most 80 bytes and cannot contain `{`, `}` or `|`.

- Ids are whole numbers from 1. Use only ids a tool returned; never guess one.
- `X` and `Y` of a pin are map percent from 0 to 100 with at most one decimal (`52.1`), the numbers wowhead shows. This differs from Step `x`/`y`, which are fractions.
- At most 12 tokens per Step (title and note together) and per message.
- Anything in braces that is not `{type:payload}` stays plain text, so `{Space}` is fine.

## Entities

Npc names and places live in a side table on the Plan (or the answer), not inside the text:

```json
"entities": {
  "npc": {
    "12345": { "name": "Fixer Kev", "mapID": 2339, "x": 52.1, "y": 47.3 }
  }
}
```

`name` is required, at most 80 bytes. `mapID`, `x` and `y` are optional and go together; `x` and `y` are percent like a pin. At most 40 npcs. Wisp's npc tooltip shows the name, the zone and the coordinates; a click sets the waypoint when the place is known.

## What the Server does

`put_plan` and `answer_request` check every token. An unknown type, a malformed id, an npc without an entity, a pin out of range or a token past the 12th is replaced by its label, or dropped when it has none, and each one is listed in `warnings` in the reply. Entities nobody links to are dropped. When the Server has Blizzard Game Data API credentials (`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`) it also checks that each item, quest, achievement, spell and npc (creature) id exists, with a cache; without them only the structure is checked.

## What the addon does

An id the game still cannot resolve after a short wait shows as its label (or nothing) in plain text, and the id is logged in the next Game data upload.

[`fixtures/markup.json`](fixtures/markup.json) holds the cases every side tests against.
