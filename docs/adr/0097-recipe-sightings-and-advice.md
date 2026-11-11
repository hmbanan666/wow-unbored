# 0097. Recipe sightings and personal recipe Advice

Status: accepted (2026-11-11)

Following [0094 T4](0094-forever-port-professions-and-character-history.md) and [0096](0096-forever-recipe-catalog.md), guarded Forever/Retail trainer and merchant window reads keep the latest 200 profession-recipe sightings per Section, per NPC and recipe/item, under the existing sharing setting; the Server retains idempotent per-Account observations, erases them with Forget my data and aggregates sources without Account identities.
Vendor items resolve through teachingItems, trainers through spell ids or unique English catalog names within the skill line only for enUS clients; enUS UiMap supplies zones (otherwise Unknown zone plus id), and missing recipes are grouped Trainer, Vendor, Limited supply, From item, Not seen yet, with explanations and no guessed locations or unvetted drop/quest links.
MCP exposes get_recipe_sources(game, skillLine), the private character page shows those groups in English, and the existing Companion delivery carries a bounded game-specific teaching map for lookup-only recipe Advice using the current character and known same-Account Alts; client tables from wago.tools and player sightings are the only data sources, with routes, history and release claims deferred.
