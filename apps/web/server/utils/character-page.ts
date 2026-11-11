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
  return {
    game: row.game,
    realm: row.realm,
    name: row.name,
    professions: professionViews(
      row.professions,
      row.recipes,
      catalog.map((r) => r.body),
    ),
  };
}
