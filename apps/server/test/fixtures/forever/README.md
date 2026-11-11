# Forever client CSV slices

Fetched from `https://wago.tools/db2/<table>/csv?build=1.60.1.70888&locale=enUS` on 2026-11-11. Headers and selected cell values are unchanged from the client CSVs; line endings are normalized to LF. Only needed relationships for the example spells are included; SkillLine retains all rows to exercise profession exclusions.

The examples cover direct item learning (Elixir of Minor Fortitude), indirect SpellEffect learning (Carrie's Cookbook), absent item targets (Goblin Mortar's stale item link), reagents, created items, category names and unusual thresholds (Coarse Sharpening Stone has minimum 75, yellow 40, grey 55). Tests simulate a missing SpellName row without dropping its catalog entry. These are client facts, not proof of current in-game availability or trainer sources.

See `docs/forever-recipe-evidence.md` for the separate 33-example AcquireMethod observation and full import counts.

T4 adds UiMap, fetched from the same build and locale on 2026-11-11. The fixture selects ids 1429 (Elwynn Forest) and 1453 (Stormwind City), preserving the imported columns. NPC sightings in the shared test fixtures are synthetic.
