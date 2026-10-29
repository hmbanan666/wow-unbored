# 0002. Zero-config pairing

Status: accepted

The Server URL is baked into the Companion, each Device gets its own secret, and the owner approves Devices via MCP; there is no Battle.net login and no user-facing token, URL, or registration. Planner and MCP tokens are separate Server secrets, and a Device key is scoped to its own progress and Requests (no Planner or MCP tools) and can be revoked.
