# 0030. Data read tools and Data explorer

Status: accepted

The Planner asks questions instead of loading dumps: MCP `get_account_overview`, `get_game_data` (Packed id sets as counts unless `expand`, capped), `check_ids`, `get_data_changes`, and `data_catalog`, the Data explorer that lists every Account, Character and Section with freshness, size, counts, last diff, dropped and unknown Sections (D59, D60). The owner also gets a read-only `GET /owner/data` JSON behind the owner MCP bearer; there is no HTML UI in 0.7.
