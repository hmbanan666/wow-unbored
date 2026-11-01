# 0052. Ready now

Status: accepted (amended in 0.11: at most 5 items per kind, and `title` from the name the game gives achievement, faction, renown and currency rows)

The Server computes Ready now per Character on demand (MCP `get_ready_now`): things the player can do or finish now (renown and standing close to the next level, paragon rewards, achievements at 70 % or more from the new `achProgress` Section, open lockouts, the Great Vault, the keystone, currency caps and weekly room, open Chains and events), each with ids only from Sections or client APIs and a fixed score, plus `alts` where another Character is further along on an achievement and `missing` Sections. `reputation` v2 adds renown `next` rewards and paragon; vendor prices and the mats-to-crafter rule are deferred because they would need name matching or invented data (D179-D188, D210-D211).
