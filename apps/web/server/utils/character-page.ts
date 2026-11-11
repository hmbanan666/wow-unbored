import {
  aggregateRecipeSources,
  SIGHTING_COLUMNS,
  type RecipeSighting,
} from "@unbored/contracts/recipe-sources";
import type { ProfessionRecipe } from "@unbored/contracts/profession-catalog";
import type { Sql } from "./db";
import {
  professionViews,
  type CharacterIdentity,
  type CharacterPage,
} from "#shared/character-page";

/** Resolve ownership in the same query as the Sections, including the game. */
export async function readCharacterPage(
  sql: Sql,
  accountId: string,
  identity: CharacterIdentity,
): Promise<CharacterPage | null> {
  const [row] = await sql<(CharacterIdentity & { professions: unknown; recipes: unknown })[]>`
    SELECT c.game, c.realm, c.name, p.body AS professions, r.body AS recipes
    FROM characters c
    LEFT JOIN sections_latest p ON p.owner_kind = 'char' AND p.owner_id = c.id AND p.section = 'professions'
    LEFT JOIN sections_latest r ON r.owner_kind = 'char' AND r.owner_id = c.id AND r.section = 'recipes'
    WHERE c.account_id = ${accountId} AND c.game = ${identity.game}
      AND c.realm = ${identity.realm} AND c.name = ${identity.name}`;
  if (!row) return null;
  const catalog = await sql<{ body: ProfessionRecipe }[]>`
    SELECT body FROM game.profession_recipes
    WHERE game = ${identity.game} AND build = (
      SELECT build FROM game.builds WHERE game = ${identity.game} ORDER BY build_number DESC LIMIT 1)
      AND skill_line = ANY(${professionViews(row.professions, row.recipes).map((p) => p.skillLine)}::int[])
    ORDER BY spell_id`;
  const skills = [...new Set(catalog.map((r) => r.body.skillLine))];
  const spells = catalog.map((r) => r.body.spellId);
  const teachingIds = [...new Set(catalog.flatMap((r) => r.body.teachingItems))];
  const sightings = catalog.length
    ? await sql<RecipeSighting[]>`
    SELECT ${sql(SIGHTING_COLUMNS.split(", "))} FROM recipe_sightings WHERE game = ${identity.game}
      AND ((kind = 'trainer' AND (skill_line = ANY(${skills}::int[]) OR spell_id = ANY(${spells}::int[])))
        OR (kind = 'vendor' AND item_id = ANY(${teachingIds}::int[])))
    ORDER BY last_seen, npc_name`
    : [];
  const ids = [
    ...new Set([
      ...sightings.flatMap((r) => (r.ui_map_id === null ? [] : [r.ui_map_id])),
      ...catalog.flatMap((r) => r.body.teachingItems),
    ]),
  ];
  const names = ids.length
    ? await sql<{ table_name: string; id: number; body: Record<string, unknown> }[]>`
    SELECT table_name, id, body FROM game.rows WHERE game = ${identity.game}
    AND build = (SELECT build FROM game.builds WHERE game = ${identity.game} ORDER BY build_number DESC LIMIT 1)
    AND locale = 'enUS' AND table_name IN ('UiMap', 'ItemSparse') AND id = ANY(${ids}::int[])`
    : [];
  const zones = new Map<number, string>(),
    items = new Map<number, string>();
  for (const row of names) {
    const name = row.body[row.table_name === "UiMap" ? "Name_lang" : "Display_lang"];
    if (typeof name === "string" && name)
      (row.table_name === "UiMap" ? zones : items).set(row.id, name);
  }
  const sources = aggregateRecipeSources(
    catalog.map((r) => r.body),
    sightings,
    zones,
    items,
  );
  return {
    game: row.game,
    realm: row.realm,
    name: row.name,
    professions: professionViews(
      row.professions,
      row.recipes,
      catalog.map((r) => r.body),
      sources,
    ),
  };
}
