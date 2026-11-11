# 0099. Private character history

Status: accepted (2026-11-11)

Following [0094 T6](0094-forever-port-professions-and-character-history.md), [0073](0073-website-and-account-link.md) and [0097](0097-recipe-sightings-and-advice.md), owner-scoped `character_events` retain level rises, profession skill changes, learned recipes, UTC daily gold closes, equipped item changes and reputation tier changes, derived in the Section transaction with source timestamps and unique character/type/key/time identities; first Sections are baselines except level and gold chart points, and events survive retention until Forget my data or account deletion.
A batched, idempotent background pass after boot backfills the retained 13 months for both Games, logs progress and records completion without blocking readiness; the private `/my/<game>/<realm>/<name>/history` page uses the existing session, private caching and noindex/nofollow, inline SVG level/gold/profession charts, English text, catalog recipe names where known, and a day-grouped filtered timeline with 100-row cursor pages.
MCP adds `get_character_history(game, character, types?, since?, limit?)` within the existing Account/Game lease scope; only the player's data and the existing Game DB are used, with no public profiles, third-party imports, auction data or compatibility/release claims.
