# 0095. Forever professions and a private character page

Status: accepted (2026-11-11)

For [ADR 0094 T2](0094-forever-port-professions-and-character-history.md), Forever reads professions through guarded `C_SkillInfo` calls into the existing skillLine/name/skill/max shape, omitting unavailable fields; Retail keeps its reader, and both games collect learned recipes on profession-window events through `GetAllRecipeIDs` or `GetFilteredRecipeIDs`, keeping Packed id sets and optional orange/yellow/green/grey difficulty, with missing APIs quiet and probed by SelfCheck until T0.
The owner-only, noindex `/my/<game>/<realm>/<name>` page (URL-encoded realm/name, `retail` or `forever`) uses ADR 0073 sessions, returns 404 for characters outside the signed-in Account, is linked from My page, and shows profession names, available skill/max and known recipe counts with English/Russian guidance when unseen.
Existing Section storage serves both games without a migration or Game DB additions; recipe names, totals, sources, leveling routes, history and public profiles remain outside T2, and public install/listing claims remain T7.
