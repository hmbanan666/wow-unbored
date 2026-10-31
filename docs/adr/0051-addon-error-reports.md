# 0051. Addon error reports

Status: accepted

A caught Lua error becomes one Error report row in the account Section `errors` (`at`, `lastAt`, `count`, `version`, `where`, `text`, `stack`), deduplicated by `where`, `text` and version and capped at 10 rows; quoted strings are blanked and only Unbored and `[C]` stack lines are kept, so it carries code location, stack and addon version only. It travels in the normal snapshot upload, is not essential (data sharing off keeps it local), and the Server keeps it in `addon_errors` for the MCP tool `list_errors`, erased with the rest of an Account (D173-D178).
