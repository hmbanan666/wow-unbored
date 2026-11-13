import type { ProfessionRecipe } from "@unbored/contracts/profession-catalog";
import {
  aggregateRecipeSources,
  SIGHTING_COLUMNS,
  type RecipeSighting,
} from "@unbored/contracts/recipe-sources";
import { recipeDifficulty } from "@unbored/contracts/recipe-difficulty";
import { professionName, professionSlug } from "#shared/profession-album";
import { type Game, type PublicProfession } from "#shared/public-professions";
import type { Sql } from "./db";

/** Two queries for a complete game's catalog, names and aggregated observations. No session input.
 * Addresses are retained across imports; only named recipes in the latest build are published. */
export async function readPublicProfessions(sql: Sql, game: Game): Promise<PublicProfession[]> {
  const rows = await sql<
    {
      body: ProfessionRecipe;
      slug: string | null;
      items: Record<string, string>;
      profession: string | null;
    }[]
  >`
    WITH latest AS (SELECT build FROM game.builds WHERE game = ${game} ORDER BY build_number DESC LIMIT 1)
    SELECT p.body, s.slug, skill.body->>'DisplayName_lang' AS profession,
      COALESCE((SELECT jsonb_object_agg(i.id, i.body->>'Display_lang')
        FROM game.rows i WHERE i.game = p.game AND i.build = p.build AND i.locale = 'enUS'
        AND i.table_name = 'ItemSparse' AND i.id = ANY(ARRAY(
          SELECT value::int FROM jsonb_array_elements_text(p.body->'teachingItems')
          UNION SELECT value::int FROM jsonb_array_elements_text(p.body->'craftedItems')
          UNION SELECT (value->>'itemId')::int FROM jsonb_array_elements(p.body->'reagents')
        ))), '{}'::jsonb) AS items
    FROM game.profession_recipes p JOIN latest l USING (build)
    LEFT JOIN game.recipe_slugs s ON s.game = p.game AND s.spell_id = p.spell_id
    LEFT JOIN game.rows skill ON skill.game = p.game AND skill.build = p.build
      AND skill.locale = 'enUS' AND skill.table_name = 'SkillLine' AND skill.id = p.skill_line
    WHERE p.game = ${game}
    ORDER BY p.skill_line, p.spell_id`;
  if (!rows.length) return [];
  const named = rows.filter((r) => r.body.name?.trim());
  const skills = [...new Set(rows.map((r) => r.body.skillLine))];
  const items = new Map<number, string>();
  for (const row of rows)
    for (const [id, name] of Object.entries(row.items)) if (name) items.set(Number(id), name);
  const sightings = await sql<
    (RecipeSighting & { zone_name: string | null; parent_skill: string | null })[]
  >`
    SELECT ${sql(SIGHTING_COLUMNS.split(", ").map((c) => `s.${c}`))}, z.body->>'Name_lang' AS zone_name, line.body->>'ParentSkillLineID' AS parent_skill
    FROM recipe_sightings s
    LEFT JOIN game.rows z ON z.game = s.game AND z.locale = 'enUS' AND z.table_name = 'UiMap'
      AND z.id = s.ui_map_id AND z.build = (SELECT build FROM game.builds WHERE game = ${game} ORDER BY build_number DESC LIMIT 1)
    LEFT JOIN game.rows line ON line.game = s.game AND line.locale = 'enUS' AND line.table_name = 'SkillLine'
      AND line.id = s.skill_line AND line.build = (SELECT build FROM game.builds WHERE game = ${game} ORDER BY build_number DESC LIMIT 1)
    WHERE s.game = ${game} AND (
      (s.kind = 'trainer' AND (s.skill_line = ANY(${skills}::int[]) OR (${game} = 'forever' AND line.body->>'ParentSkillLineID' = ANY(${skills.map(String)}::text[])) OR s.spell_id = ANY(${rows.map((r) => r.body.spellId)}::int[])))
      OR (s.kind = 'vendor' AND s.item_id = ANY(${named.flatMap((r) => r.body.teachingItems)}::int[])))
    ORDER BY s.last_seen, s.npc_name`;
  const zones = new Map(
    sightings.flatMap((s) =>
      s.ui_map_id !== null && s.zone_name ? [[s.ui_map_id, s.zone_name] as const] : [],
    ),
  );
  const sources = new Map(
    aggregateRecipeSources(
      named.map((r) => r.body),
      sightings.map((s) => ({
        ...s,
        skill_line:
          game === "forever" && skills.includes(Number(s.parent_skill))
            ? Number(s.parent_skill)
            : s.skill_line,
      })),
      zones,
      items,
    ).map((s) => [s.spellId, s]),
  );
  const professions = new Map<number, PublicProfession>();
  for (const { body: r, slug, profession: englishName } of rows) {
    const name = professionName({ skillLine: r.skillLine, name: englishName || "Profession" });
    const profession = professions.get(r.skillLine) ?? {
      skillLine: r.skillLine,
      name,
      slug: professionSlug({ skillLine: r.skillLine, name }),
      album: [],
    };
    professions.set(r.skillLine, profession);
    if (!r.name?.trim() || !slug) continue;
    const evidence = sources.get(r.spellId)!;
    // Never display a raw map id when the English zone name has not been imported.
    const observed = evidence.sources.map((s) => ({
      ...s,
      zone: s.zone.startsWith("Unknown zone") ? "Unknown zone" : s.zone,
    }));
    profession.album.push({
      ...r,
      slug,
      name: r.name!.trim(),
      known: null,
      band: null,
      sources: observed,
      difficulty: recipeDifficulty({
        recipe: r,
        sources: observed,
        skill: null,
        rankMax: null,
        game,
        base: true,
      }),
      reagents: r.reagents.map((v) => ({ ...v, name: items.get(v.itemId) ?? null })),
      craftedItemNames: r.craftedItems.map((itemId) => ({
        itemId,
        name: items.get(itemId) ?? null,
      })),
      teachingItemNames: evidence.teachingItems.map((t) => ({
        ...t,
        quality: r.teaching?.find((v) => v.itemId === t.itemId)?.quality ?? null,
        bindOnPickup: r.teaching?.find((v) => v.itemId === t.itemId)?.bindOnPickup ?? null,
      })),
    });
  }
  return [...professions.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}
