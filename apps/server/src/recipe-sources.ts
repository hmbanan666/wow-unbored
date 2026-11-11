import { readFileSync } from "node:fs";
import {
  aggregateRecipeSources,
  resolveSighting,
  SIGHTING_COLUMNS,
  type RecipeSighting,
} from "@unbored/contracts/recipe-sources";
import type { ProfessionRecipe } from "@unbored/contracts/profession-catalog";
import type { Game } from "@unbored/contracts";
import { type Db, fromJson } from "./db.ts";
import { readProfessionCatalog } from "./profession-catalog.ts";

export const SIGHTINGS_SQLITE_SCHEMA = readFileSync(
  new URL("../migrations/0031_recipe_sightings.sql", import.meta.url),
  "utf8",
)
  .replaceAll("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");

export async function currentRecipes(db: Db, game: Game): Promise<ProfessionRecipe[]> {
  const builds = db.pg ? "game.builds" : "game_builds";
  const recipes = db.pg ? "game.profession_recipes" : "game_profession_recipes";
  return (
    await db.all<{ body: unknown }>(
      `SELECT ${db.body} AS body FROM ${recipes} WHERE game = ? AND build = (SELECT build FROM ${builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1) ORDER BY skill_line, spell_id`,
      game,
      game,
    )
  ).map((r) => fromJson<ProfessionRecipe>(r.body)!);
}

function integer(value: unknown, min = 0): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= 2147483647
    ? value
    : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === "string" &&
    value.trim() &&
    value.length <= max &&
    !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c === "|")
    ? value
    : null;
}
function coordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value * 10) / 10
    : null;
}

export async function ingestRecipeSightings(
  db: Db,
  account: string,
  game: Game,
  kind: "trainer" | "vendor",
  body: Record<string, unknown>,
  now: number,
) {
  if (!Array.isArray(body.entries)) return;
  const catalog = await currentRecipes(db, game);
  for (const raw of body.entries.slice(-200)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const npc = integer(r.npcId, 1),
      name = text(r.npcName, 100),
      at = integer(r.seenAt, 1);
    if (npc === null || name === null || at === null || at > now + 300) continue;
    const row: RecipeSighting = {
      kind,
      npc_id: npc,
      npc_name: name,
      spell_id: kind === "trainer" ? integer(r.spellId, 1) : null,
      recipe_spell_id: null,
      item_id: kind === "vendor" ? integer(r.itemId, 1) : null,
      skill_line: integer(r.skillLine, 1),
      recipe_name: text(r.name, 160),
      locale: text(r.locale, 8),
      ui_map_id: integer(r.uiMapID, 1),
      x: coordinate(r.x),
      y: coordinate(r.y),
      cost:
        typeof r.cost === "number" && Number.isSafeInteger(r.cost) && r.cost >= 0 && r.cost <= 1e12
          ? r.cost
          : null,
      required_skill: integer(r.requiredSkill),
      limited: 0,
      first_seen: at,
      last_seen: at,
    };
    if (kind === "vendor") {
      const available = integer(r.numAvailable, -1);
      if (!row.item_id || available === null) continue;
      row.limited = available >= 0 ? 1 : 0;
    } else if (!row.spell_id && (!row.recipe_name || !row.skill_line || !row.locale)) continue;
    const resolved = resolveSighting(row, catalog);
    row.recipe_spell_id = resolved.length === 1 ? resolved[0]! : null;
    const key = row.item_id
      ? `i${row.item_id}`
      : row.spell_id
        ? `s${row.spell_id}`
        : `n${row.locale}:${row.skill_line}:${row.recipe_name}`;
    await upsertSighting(db, row, account, game, key);
  }
}

export async function readRecipeSources(db: Db, game: Game, skillLine: number) {
  const catalog = await readProfessionCatalog(db, game, skillLine);
  const teachingIds = [...new Set(catalog.recipes.flatMap((r) => r.teachingItems))];
  const spellIds = catalog.recipes.map((r) => r.spellId);
  const params = (ids: number[]) => ids.map(() => "?").join(", ") || "NULL";
  const sightings = catalog.recipes.length
    ? await db.all<RecipeSighting>(
        `SELECT ${SIGHTING_COLUMNS} FROM recipe_sightings WHERE game = ? AND
      ((kind = 'trainer' AND (skill_line = ? OR spell_id IN (${params(spellIds)})))
        OR (kind = 'vendor' AND item_id IN (${params(teachingIds)}))) ORDER BY last_seen, npc_name`,
        game,
        skillLine,
        ...spellIds,
        ...teachingIds,
      )
    : [];
  const rows = db.pg ? "game.rows" : "game_rows";
  const nameIds = [
    ...new Set([
      ...teachingIds,
      ...sightings.flatMap((r) => (r.ui_map_id === null ? [] : [r.ui_map_id])),
    ]),
  ];
  const names =
    catalog.build && nameIds.length
      ? await db.all<{ table_name: string; id: number; body: unknown }>(
          `SELECT table_name, id, ${db.body} AS body FROM ${rows} WHERE game = ? AND build = ? AND locale = 'enUS' AND table_name IN ('UiMap', 'ItemSparse') AND id IN (${params(nameIds)})`,
          game,
          catalog.build,
          ...nameIds,
        )
      : [];
  const zones = new Map<number, string>(),
    items = new Map<number, string>();
  for (const row of names) {
    const data = fromJson<Record<string, unknown>>(row.body)!;
    const name = data[row.table_name === "UiMap" ? "Name_lang" : "Display_lang"];
    if (typeof name === "string" && name)
      (row.table_name === "UiMap" ? zones : items).set(row.id, name);
  }
  return {
    game,
    build: catalog.build,
    skillLine,
    recipes: aggregateRecipeSources(catalog.recipes, sightings, zones, items),
  };
}

/** Only unambiguous item links fit the compact tuple delivery. Missing links stay silent. */
export async function recipeTeachingMap(db: Db, game: Game) {
  const items: Record<string, [number, number, number]> = {};
  const ambiguous = new Set<number>();
  for (const recipe of await currentRecipes(db, game)) {
    for (const item of recipe.teachingItems) {
      const tuple: [number, number, number] = [recipe.spellId, recipe.skillLine, recipe.minSkill];
      if (items[item] && JSON.stringify(items[item]) !== JSON.stringify(tuple)) ambiguous.add(item);
      items[item] = tuple;
    }
  }
  for (const item of ambiguous) delete items[item];
  return { v: 1, game, items: Object.fromEntries(Object.entries(items).slice(0, 4000)) };
}

async function upsertSighting(
  db: Db,
  row: RecipeSighting,
  account: string,
  game: Game,
  key: string,
  mergedCount?: number,
) {
  const columns = SIGHTING_COLUMNS.split(", ");
  const newer = "excluded.last_seen > recipe_sightings.last_seen";
  await db.run(
    `INSERT INTO recipe_sightings (account_id, game, source_key, ${SIGHTING_COLUMNS}, seen_count) VALUES (?, ?, ?, ${columns.map(() => "?").join(", ")}, ?)
    ON CONFLICT (account_id, game, kind, npc_id, source_key) DO UPDATE SET
    ${columns
      .filter((c) => !["kind", "npc_id", "first_seen"].includes(c))
      .map((c) => `${c} = CASE WHEN ${newer} THEN excluded.${c} ELSE recipe_sightings.${c} END`)
      .join(", ")},
    first_seen = ${db.least("recipe_sightings.first_seen", "excluded.first_seen")},
    seen_count = ${mergedCount === undefined ? `recipe_sightings.seen_count + CASE WHEN ${newer} THEN 1 ELSE 0 END` : db.greatest("recipe_sightings.seen_count", "excluded.seen_count")}`,
    account,
    game,
    key,
    ...columns.map((c) => row[c as keyof RecipeSighting]),
    mergedCount ?? 1,
  );
}

/** A legacy key and its hash are one Account, so overlapping observations never double-count. */
export async function mergeSightingAccount(db: Db, from: string, to: string) {
  for (const row of await db.all<
    RecipeSighting & { game: Game; source_key: string; seen_count: number }
  >(
    `SELECT ${SIGHTING_COLUMNS}, game, source_key, seen_count FROM recipe_sightings WHERE account_id = ?`,
    from,
  )) {
    await upsertSighting(db, row, to, row.game, row.source_key, row.seen_count);
  }
  await db.run("DELETE FROM recipe_sightings WHERE account_id = ?", from);
}
