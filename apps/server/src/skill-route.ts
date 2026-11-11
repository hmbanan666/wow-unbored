import { cleanPlan } from "./plan.ts";
import type { Plan, Suggestion } from "@unbored/contracts";
import {
  computeSkillRoute,
  heldReagents,
  learnedRecipes,
  professionSkills,
  vendorPrices,
  type SkillRoute,
} from "@unbored/contracts/skill-route";
import { SIGHTING_COLUMNS, type RecipeSighting } from "@unbored/contracts/recipe-sources";
import { type Db, fromJson } from "./db.ts";
import type { CharacterRow } from "./data.ts";
import { currentRecipes, readRecipeSources } from "./recipe-sources.ts";

export async function readSkillRoutes(
  db: Db,
  character: CharacterRow,
  skillLine?: number,
  target?: number,
) {
  const sections = new Map(
    (
      await db.all<{ section: string; body: unknown }>(
        `SELECT section, ${db.body} AS body FROM sections_latest WHERE owner_kind = 'char' AND owner_id = ? AND section IN ('professions', 'recipes', 'bags', 'bank', 'reagentBank')`,
        character.id,
      )
    ).map((r) => [r.section, fromJson(r.body)]),
  );
  const catalog = await currentRecipes(db, character.game);
  const items = [...new Set(catalog.flatMap((r) => (r.reagents ?? []).map((v) => v.itemId)))];
  const sightings = items.length
    ? await db.all<RecipeSighting>(
        `SELECT ${SIGHTING_COLUMNS} FROM recipe_sightings WHERE game = ? AND kind = 'vendor' AND item_id IN (${items.map(() => "?").join(",")})`,
        character.game,
        ...items,
      )
    : [];
  const prices = vendorPrices(sightings);
  const rows = db.pg ? "game.rows" : "game_rows";
  const builds = db.pg ? "game.builds" : "game_builds";
  const names = items.length
    ? await db.all<{ id: number; body: unknown }>(
        `SELECT id, ${db.body} AS body FROM ${rows} WHERE game = ? AND build = (SELECT build FROM ${builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1) AND locale = 'enUS' AND table_name = 'ItemSparse' AND id IN (${items.map(() => "?").join(",")})`,
        character.game,
        character.game,
        ...items,
      )
    : [];
  const itemNames: Record<number, string> = {};
  for (const r of names) {
    const name = fromJson<Record<string, unknown>>(r.body)?.Display_lang;
    if (typeof name === "string") itemNames[r.id] = name;
  }
  const held = heldReagents([
    sections.get("bags"),
    sections.get("bank"),
    sections.get("reagentBank"),
  ]);
  const out = [];
  for (const p of professionSkills(sections.get("professions"))) {
    if (skillLine !== undefined && p.skillLine !== skillLine) continue;
    const sources = await readRecipeSources(db, character.game, p.skillLine);
    out.push({
      name: p.name,
      route: computeSkillRoute({
        game: character.game,
        ...p,
        target,
        recipes: catalog,
        known: learnedRecipes(sections.get("recipes"), p.skillLine),
        sources: sources.recipes,
        prices,
        held,
        itemNames,
      }),
    });
  }
  return out;
}

export function skillRoutePlan(route: SkillRoute, name: string, generatedAt: number): Plan {
  const tasks: Plan["tasks"] = [];
  for (const s of route.stretches) {
    if (s.trainer) {
      const t = s.trainer === "catalog" ? null : s.trainer;
      tasks.push({
        id: `train:${s.spellId}`,
        title: `Learn ${s.name}`,
        estMinutes: 1,
        note: t ? `Visit ${t.npcName}.` : "Visit your profession trainer.",
        ...(t?.uiMapID && t.x !== null && t.y !== null
          ? { mapID: t.uiMapID, x: t.x / 100, y: t.y / 100 }
          : {}),
        complete: { kind: "manual" },
        profession: { kind: "train", recipe: s.name, ...(t ? { trainer: t.npcName } : {}) },
      });
    }
    tasks.push({
      id: `craft:${s.spellId}:${s.from}`,
      title: `Craft ${s.name}`,
      estMinutes: 1,
      note: `${s.from} to ${s.to}: about ${Math.ceil(s.expectedCrafts)} crafts.${s.slow ? " Slow skill gains." : ""} ${s.reagents.map((r) => `${r.count} {item:${r.itemId}}`).join(", ")}`,
      complete: { kind: "profession", skillLine: route.skillLine, minSkill: s.to },
      profession: {
        kind: "craft",
        recipe: s.name,
        from: s.from,
        to: s.to,
        crafts: Math.ceil(s.expectedCrafts),
        reagents: s.reagents.map((r) => `${r.count} {item:${r.itemId}}`).join(", "),
        slow: s.slow,
      },
    });
  }
  return cleanPlan(
    {
      v: 1,
      kind: "plan",
      mode: "custom",
      generatedAt,
      title: name.slice(0, 40),
      goal: `Raise ${name} to ${route.reached}.`,
      tasks,
    },
    generatedAt,
  );
}

export async function professionIdeas(db: Db, character: CharacterRow): Promise<Suggestion[]> {
  const ideas: Suggestion[] = [];
  for (const { name, route } of await readSkillRoutes(db, character)) {
    if (!route.stretches.length) continue;
    const id = `profession:${route.skillLine}`;
    const nextCrafts = Math.ceil(route.stretches[0]!.expectedCrafts);
    const title = name.slice(0, 40);
    if (route.stretches.reduce((n, s) => n + (s.trainer ? 2 : 1), 0) > 40) continue;
    const plan = skillRoutePlan(route, title, character.savedAt ?? character.lastSeen);
    ideas.push({
      id,
      kind: "profession",
      displayKind: "profession",
      title,
      goal: `${route.from}/${route.target}: next ${nextCrafts} crafts`,
      rewards: [],
      profession: {
        game: character.game,
        skillLine: route.skillLine,
        from: route.from!,
        target: route.target!,
        nextCrafts,
      },
      plan,
      request: { topic: "suggestion", suggestionId: id, wish: title },
    });
  }
  return ideas;
}
