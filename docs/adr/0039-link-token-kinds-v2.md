# 0039. Link token kinds v2

Status: accepted

Entity tokens add `mount`, `toy`, `pet`, `zone` and `instance`, each resolved by the client from an id; at most 12 tokens per Step, Goal or details and 6 Rewards, and an unresolved id is plain text (D98-D100). Ids come only from the player's data, tool results (`check_ids` now covers mount, toy and pet) or the Catalog; there is no name lookup tool, and Answers use the same renderer (D101-D102). This amends [0034](0034-entity-markup.md).
