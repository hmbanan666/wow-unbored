# 0011. Server-side player profile

Status: accepted (the public trimming is superseded by [0027](0027-game-data-snapshot.md))

The Companion uploads as much player state as it can (location, progress, collections, bags and bank, currencies, gold, recent sessions and activity), with each Request and on each reload, so the Server keeps an up-to-date Player profile and the Planner can assemble context at once instead of pulling Battle.net each time; MCP exposes it as `get_player_profile`. For a public product this follows 0009 and is cut down to what each Request needs.
