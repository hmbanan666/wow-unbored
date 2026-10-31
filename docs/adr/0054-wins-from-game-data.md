# 0054. Wins from game data

Status: accepted

A Win is a mount, toy, pet, achievement, item or quest that a Plan linked to a Request promised (its rewards, `contains`, or the last Step's `complete`) and that game data later shows newly obtained, after the plan and within 30 days; never the Done button, never an `initial` upload. Wins are Player history entries of kind `win`, one per Account and id, read over MCP `list_wins` and `get_player_history`; there is no player-facing display in 0.10 (D193-D199).
