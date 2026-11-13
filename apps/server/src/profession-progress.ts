import { professionProgress } from "@unbored/contracts/profession-progress";
import { professionSkills } from "@unbored/contracts/skill-route";
import { SIGHTING_COLUMNS, type RecipeSighting } from "@unbored/contracts/recipe-sources";
import { type Db, fromJson } from "./db.ts";
import type { CharacterRow } from "./data.ts";
import { currentRecipes } from "./recipe-sources.ts";

export async function readProfessionProgress(
  db: Db,
  character: Pick<CharacterRow, "game" | "id">,
  skillLine: number,
) {
  const sections = Object.fromEntries(
    (
      await db.all<{ section: string; body: unknown }>(
        `SELECT section, ${db.body} AS body FROM sections_latest WHERE owner_kind = 'char' AND owner_id = ? AND section IN ('professions', 'recipes', 'bags', 'bank', 'reagentBank')`,
        character.id,
      )
    ).map((r) => [r.section, fromJson(r.body)]),
  );
  const skills = professionSkills(sections.professions).map((p) => p.skillLine);
  if (!skills.length) return null;
  const catalog = (await currentRecipes(db, character.game)).filter((r) =>
    skills.includes(r.skillLine),
  );
  const spells = catalog.map((r) => r.spellId);
  const items = [
    ...new Set(catalog.flatMap((r) => [...r.teachingItems, ...r.reagents.map((v) => v.itemId)])),
  ];
  const params = (ids: number[]) => (ids.length ? ids.map(() => "?").join(",") : "NULL");
  const sightings = await db.all<RecipeSighting>(
    `SELECT ${SIGHTING_COLUMNS} FROM recipe_sightings WHERE game = ? AND
    ((kind = 'trainer' AND (skill_line IN (${params(skills)}) OR spell_id IN (${params(spells)})))
    OR (kind = 'vendor' AND item_id IN (${params(items)}))) ORDER BY last_seen, npc_name`,
    character.game,
    ...skills,
    ...spells,
    ...items,
  );
  const ids = [
    ...new Set([
      ...items,
      ...sightings.flatMap((s) => (s.ui_map_id === null ? [] : [s.ui_map_id])),
    ]),
  ];
  const rows = db.pg ? "game.rows" : "game_rows";
  const builds = db.pg ? "game.builds" : "game_builds";
  const names = ids.length
    ? await db.all<{ table_name: string; id: number; body: unknown }>(
        `SELECT table_name, id, ${db.body} AS body FROM ${rows} WHERE game = ? AND build =
    (SELECT build FROM ${builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1)
    AND locale = 'enUS' AND table_name IN ('UiMap', 'ItemSparse') AND id IN (${params(ids)})`,
        character.game,
        character.game,
        ...ids,
      )
    : [];
  const zones = new Map<number, string>(),
    itemNames = new Map<number, string>();
  for (const row of names) {
    const name = fromJson<Record<string, unknown>>(row.body)?.[
      row.table_name === "UiMap" ? "Name_lang" : "Display_lang"
    ];
    if (typeof name === "string" && name)
      (row.table_name === "UiMap" ? zones : itemNames).set(row.id, name);
  }
  return (
    professionProgress({
      game: character.game,
      professions: sections.professions,
      recipes: sections.recipes,
      bags: sections.bags,
      bank: sections.bank,
      reagentBank: sections.reagentBank,
      catalog,
      sightings,
      zones,
      items: itemNames,
    }).find((p) => p.skillLine === skillLine || p.aliases.includes(skillLine)) ?? null
  );
}
