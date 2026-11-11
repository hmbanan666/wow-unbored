import type { ProfessionRecipe } from "@unbored/contracts/profession-catalog";
import { type Db, fromJson } from "./db.ts";
import type { Game, GameFields } from "./game-content.ts";

export const RECIPE_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS game_profession_recipes (
  game TEXT NOT NULL, build TEXT NOT NULL, skill_line INTEGER NOT NULL, spell_id INTEGER NOT NULL,
  body_json TEXT NOT NULL, PRIMARY KEY (game, build, skill_line, spell_id),
  FOREIGN KEY (game, build) REFERENCES game_builds(game, build)
);`;

// Explicit real professions: CategoryID 9 also includes racial, weapon and riding skills;
// CategoryID 11 includes a prototype profession in this build.
const PROFESSIONS = new Set([129, 164, 165, 171, 182, 185, 186, 197, 202, 333, 356, 393]);

export async function materializeRecipes(db: Db, game: Game, build: string, signal: AbortSignal) {
  const source = db.pg ? "game.rows" : "game_rows";
  const target = db.pg ? "game.profession_recipes" : "game_profession_recipes";
  const tables = new Map<string, GameFields[]>();
  for (const row of await db.all<{ table_name: string; body: unknown }>(
    `SELECT table_name, ${db.body} AS body FROM ${source} WHERE game = ? AND build = ? AND locale = 'enUS' ORDER BY id`,
    game,
    build,
  )) {
    const rows = tables.get(row.table_name) ?? [];
    rows.push(fromJson<GameFields>(row.body)!);
    tables.set(row.table_name, rows);
  }
  const rows = (name: string) => tables.get(name) ?? [];
  const byId = (name: string) => new Map(rows(name).map((r) => [Number(r.ID), r]));
  const skills = byId("SkillLine"),
    categories = byId("TradeSkillCategory"),
    names = byId("SpellName"),
    items = byId("ItemSparse"),
    itemEffects = byId("ItemEffect");
  const effects = new Map<number, GameFields[]>();
  for (const row of rows("SpellEffect")) {
    const spell = Number(row.SpellID);
    effects.set(spell, [...(effects.get(spell) ?? []), row]);
  }
  const taught = new Map<number, Set<number>>();
  for (const link of rows("ItemXItemEffect")) {
    const effect = itemEffects.get(Number(link.ItemEffectID));
    if (!effect || !items.has(Number(link.ItemID))) continue;
    const spells = Number(effect.TriggerType) === 6 ? [Number(effect.SpellID)] : [];
    for (const row of effects.get(Number(effect.SpellID)) ?? [])
      if (Number(row.Effect) === 36) spells.push(Number(row.EffectTriggerSpell));
    for (const spell of spells) {
      const found = taught.get(spell) ?? new Set<number>();
      found.add(Number(link.ItemID));
      taught.set(spell, found);
    }
  }
  const reagents = new Map(rows("SpellReagents").map((r) => [Number(r.SpellID), r]));
  await db.run(`DELETE FROM ${target} WHERE game = ? AND build = ?`, game, build);
  for (const row of rows("SkillLineAbility")) {
    signal.throwIfAborted();
    const skillLine = Number(row.SkillLine),
      spellId = Number(row.Spell);
    if (!PROFESSIONS.has(skillLine) || !skills.has(skillLine) || !Number(row.TradeSkillCategoryID))
      continue;
    const category = categories.get(Number(row.TradeSkillCategoryID));
    const name = names.get(spellId)?.Name_lang;
    if (!category) throw new Error("Recipe category missing");
    const low = Number(row.TrivialSkillLineRankLow),
      high = Number(row.TrivialSkillLineRankHigh);
    const recipe: ProfessionRecipe = {
      spellId,
      skillLine,
      name: name ? String(name) : null,
      category: {
        id: Number(category.ID),
        name: String(category.Name_lang),
        order: Number(category.OrderIndex),
      },
      minSkill: Number(row.MinSkillLineRank),
      thresholds: {
        orange: Number(row.MinSkillLineRank),
        yellow: low,
        green: Math.ceil((low + high) / 2),
        grey: high,
      },
      skillUps: Number(row.NumSkillUps),
      acquireMethod: Number(row.AcquireMethod),
      reagents: [],
      craftedItems: [
        ...new Set(
          (effects.get(spellId) ?? [])
            .filter((e) => Number(e.Effect) === 24 && items.has(Number(e.EffectItemType)))
            .map((e) => Number(e.EffectItemType)),
        ),
      ].sort((a, b) => a - b),
      teachingItems: [...(taught.get(spellId) ?? [])].sort((a, b) => a - b),
    };
    const reagent = reagents.get(spellId);
    for (let i = 0; reagent && i < 8; i++) {
      const itemId = Number(reagent[`Reagent_${i}`]),
        count = Number(reagent[`ReagentCount_${i}`]);
      if (itemId > 0 && count > 0) recipe.reagents.push({ itemId, count });
    }
    // Multiple ability rows can describe the same profession/spell. First client id wins.
    await db.run(
      `INSERT INTO ${target} (game, build, skill_line, spell_id, ${db.body}) VALUES (?, ?, ?, ?, ?) ON CONFLICT (game, build, skill_line, spell_id) DO NOTHING`,
      game,
      build,
      skillLine,
      spellId,
      JSON.stringify(recipe),
    );
  }
}

export async function readProfessionCatalog(db: Db, game: Game, skillLine: number) {
  const builds = db.pg ? "game.builds" : "game_builds";
  const recipes = db.pg ? "game.profession_recipes" : "game_profession_recipes";
  const build =
    (
      await db.get<{ build: string }>(
        `SELECT build FROM ${builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1`,
        game,
      )
    )?.build ?? null;
  const rows = build
    ? await db.all<{ body: unknown }>(
        `SELECT ${db.body} AS body FROM ${recipes} WHERE game = ? AND build = ? AND skill_line = ? ORDER BY spell_id`,
        game,
        build,
        skillLine,
      )
    : [];
  return { game, build, skillLine, recipes: rows.map((r) => fromJson<ProfessionRecipe>(r.body)!) };
}
