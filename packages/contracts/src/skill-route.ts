import { recipeBand, type ProfessionRecipe } from "./profession-catalog.ts";
import type { RecipeSource, RecipeSources, RecipeSighting } from "./recipe-sources.ts";
import { isPackedIdSet, unpackIds, unpackRows } from "./packed.ts";

export type RouteReagent = {
  name?: string;
  itemId: number;
  count: number;
  unitCopper: number | null;
  totalCopper: number | null;
};
export type SkillStretch = {
  spellId: number;
  name: string;
  from: number;
  to: number;
  expectedCrafts: number;
  slow: boolean;
  reagents: RouteReagent[];
  trainer: RecipeSource | "catalog" | null;
};
export type RankTrainer = Pick<RecipeSource, "npcId" | "npcName" | "uiMapID" | "x" | "y">;
export type SkillRoute = {
  rankTraining?: { profession: string; previousMax: number; trainer: RankTrainer | null };
  game: "retail" | "forever";
  skillLine: number;
  from: number | null;
  target: number | null;
  reached: number | null;
  status: "complete" | "gap" | "unavailable" | "at_cap" | "needs_rank";
  stretches: SkillStretch[];
  reagents: RouteReagent[];
};
export type SkillRouteInput = {
  name?: string;
  rankTrainer?: RankTrainer | null;
  game: "retail" | "forever";
  skillLine: number;
  skill: number | null;
  max: number | null;
  target?: number;
  recipes: ProfessionRecipe[];
  known: number[];
  sources?: RecipeSources[];
  itemNames?: Record<number, string>;
  held?: Record<number, number>;
  prices?: Record<number, number>;
};

/** Invalid or unplaceable client thresholds never become a proposed craft. */
export function skillUpChance(recipe: ProfessionRecipe, skill: number): number {
  const t = recipe.thresholds;
  if (
    !t ||
    ![t.orange, t.yellow, t.green, t.grey, recipe.minSkill, skill].every(Number.isFinite) ||
    t.orange > t.yellow ||
    t.yellow > t.green ||
    t.green > t.grey ||
    skill < Math.max(recipe.minSkill, t.orange) ||
    skill >= t.grey
  )
    return 0;
  if (skill < t.yellow) return 1;
  return Math.max(0, Math.min(1, (t.grey - skill) / (t.grey - t.yellow)));
}

/** Re-evaluate at each skill point, then coalesce adjacent choices into stretches. */
export function computeSkillRoute(input: SkillRouteInput): SkillRoute {
  const { game, skillLine, skill, max, recipes } = input;
  const ceiling = game === "forever" ? Math.min(300, max ?? 300) : max;
  const cap = game === "forever" ? ([75, 150, 225, 300].find((n) => n > (skill ?? 0)) ?? 300) : max;
  const target =
    input.target === undefined
      ? cap === null
        ? null
        : Math.min(cap, ceiling ?? cap)
      : Number.isInteger(input.target) && input.target > 0 && ceiling !== null
        ? Math.min(input.target, ceiling)
        : null;
  const route: SkillRoute = {
    game,
    skillLine,
    from: skill,
    target,
    reached: skill,
    status: "unavailable",
    stretches: [],
    reagents: [],
  };
  if (
    skill === null ||
    target === null ||
    !Number.isSafeInteger(skill) ||
    skill < 0 ||
    target > 2000
  )
    return route;
  if (game === "forever" && max !== null && max > 0 && max < 300 && skill >= max) {
    route.status = "needs_rank";
    route.rankTraining = {
      profession: input.name ?? "your profession",
      previousMax: max,
      trainer: input.rankTrainer ?? null,
    };
    return route;
  }
  if (skill >= target) {
    route.status = "at_cap";
    return route;
  }
  const known = new Set(input.known);
  const sources = new Map((input.sources ?? []).map((r) => [r.spellId, r.sources]));
  const candidates = recipes.filter(
    (r) =>
      r.skillLine === skillLine &&
      r.name &&
      r.skillUps > 0 &&
      r.reagents?.length &&
      r.reagents.every(
        (v) =>
          Number.isInteger(v.itemId) && v.itemId > 0 && Number.isInteger(v.count) && v.count > 0,
      ),
  );
  route.status = "gap";
  for (let point = skill; point < target; point++) {
    const choices = candidates.flatMap((r) => {
      const chance = skillUpChance(r, point);
      if (!chance) return [];
      const trainer = (sources.get(r.spellId) ?? [])
        .filter(
          (s) => s.kind === "trainer" && (s.requiredSkill === null || s.requiredSkill <= point),
        )
        .sort((a, b) => a.npcId - b.npcId)[0];
      if (!known.has(r.spellId) && !trainer && !r.trainer) return [];
      const count = r.reagents.reduce((sum, item) => sum + item.count, 0);
      const held = r.reagents.reduce(
        (sum, item) => sum + Math.min(item.count, input.held?.[item.itemId] ?? 0),
        0,
      );
      return [{ r, chance, trainer, band: recipeBand(r, point), weight: count / chance, held }];
    });
    const bandOrder = { orange: 0, yellow: 1, green: 2, grey: 3 };
    choices.sort(
      (a, b) =>
        bandOrder[a.band] - bandOrder[b.band] ||
        a.weight - b.weight ||
        b.held - a.held ||
        a.r.spellId - b.r.spellId,
    );
    const choice = choices[0];
    if (!choice) break;
    const { r, chance, trainer, band } = choice;
    let stretch = route.stretches.at(-1);
    if (!stretch || stretch.spellId !== r.spellId || stretch.slow !== (band === "green")) {
      stretch = {
        spellId: r.spellId,
        name: r.name!,
        from: point,
        to: point,
        expectedCrafts: 0,
        slow: band === "green",
        reagents: [],
        trainer: known.has(r.spellId) ? null : (trainer ?? "catalog"),
      };
      route.stretches.push(stretch);
    }
    known.add(r.spellId);
    stretch.to = point + 1;
    stretch.expectedCrafts += 1 / chance;
    stretch.reagents = r.reagents.map(({ itemId, count }) =>
      priceReagent(itemId, Math.ceil(stretch.expectedCrafts) * count, input.prices),
    );
    route.reached = point + 1;
  }
  const totals = new Map<number, number>();
  for (const stretch of route.stretches)
    for (const reagent of stretch.reagents)
      totals.set(reagent.itemId, (totals.get(reagent.itemId) ?? 0) + reagent.count);
  route.reagents = [...totals]
    .sort(([a], [b]) => a - b)
    .map(([id, count]) => priceReagent(id, count, input.prices));
  for (const reagent of [...route.reagents, ...route.stretches.flatMap((s) => s.reagents)]) {
    const name = input.itemNames?.[reagent.itemId];
    if (name) reagent.name = name;
  }
  if (route.reached === target) route.status = "complete";
  return route;
}
function priceReagent(
  itemId: number,
  count: number,
  prices: SkillRouteInput["prices"],
): RouteReagent {
  const value = prices?.[itemId];
  const unitCopper =
    value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    itemId,
    count,
    unitCopper,
    totalCopper: unitCopper === null ? null : unitCopper * count,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function professionSkills(body: unknown) {
  const list = record(body).list;
  const entries = (Array.isArray(list) ? list : []).flatMap((value) => [
    value,
    ...(Array.isArray(record(value).tiers) ? (record(value).tiers as unknown[]) : []).map(
      (tier) => ({ ...record(tier), parentSkillLine: record(value).skillLine }),
    ),
  ]);
  return entries.flatMap((value) => {
    const r = record(value);
    const rank = (v: unknown) =>
      typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
    const skillLine = rank(r.skillLine);
    return skillLine && typeof r.name === "string" && r.name.trim()
      ? [
          {
            skillLine,
            name: r.name.trim().slice(0, 60),
            skill: rank(r.skill),
            max: rank(r.max),
            parentSkillLine: rank(r.parentSkillLine),
          },
        ]
      : [];
  });
}
export function learnedRecipes(body: unknown, skillLine: number): number[] {
  const learned = record(record(record(body).byProfession)[skillLine]).learned;
  return isPackedIdSet(learned) ? unpackIds(learned) : [];
}
/** Character bags/bank only; no guessed holdings when a Section has not been seen. */
export function heldReagents(bodies: unknown[]): Record<number, number> {
  const held: Record<number, number> = {};
  for (const body of bodies) {
    const items = record(body).items;
    const rows = isPackedIdSet(items)
      ? unpackRows(items).map((r) => ({ id: r.id, count: r.values[0] ?? 1 }))
      : Array.isArray(items)
        ? items
        : [];
    for (const item of rows) {
      const r = record(item);
      if (typeof r.id === "number" && typeof r.count === "number" && r.count > 0)
        held[r.id] = (held[r.id] ?? 0) + r.count;
    }
  }
  return held;
}
/** Latest priced observation per item. NPC id resolves simultaneous visits deterministically. */
export function vendorPrices(sightings: RecipeSighting[]): Record<number, number> {
  const prices: Record<number, number> = {};
  const sorted = sightings
    .filter((s) => s.kind === "vendor" && s.item_id !== null)
    .sort(
      (a, b) =>
        b.last_seen - a.last_seen ||
        a.npc_id - b.npc_id ||
        (a.cost ?? Infinity) - (b.cost ?? Infinity),
    );
  const seen = new Set<number>();
  for (const s of sorted) {
    if (seen.has(s.item_id!)) continue;
    seen.add(s.item_id!);
    if (s.cost !== null) prices[s.item_id!] = s.cost;
  }
  return prices;
}

/** Recipe sightings locate profession trainers, but do not prove rank fees or requirements. */
export function observedRankTrainer(
  sightings: RecipeSighting[],
  skillLine: number,
): RankTrainer | null {
  const placed = (s: RecipeSighting) =>
    s.ui_map_id !== null && s.x !== null && s.y !== null ? 1 : 0;
  const row = sightings
    .filter((s) => s.kind === "trainer" && s.skill_line === skillLine)
    .sort(
      (a, b) =>
        placed(b) - placed(a) ||
        b.last_seen - a.last_seen ||
        a.npc_id - b.npc_id ||
        (a.ui_map_id ?? 0) - (b.ui_map_id ?? 0) ||
        (a.x ?? 0) - (b.x ?? 0) ||
        (a.y ?? 0) - (b.y ?? 0) ||
        (a.npc_name < b.npc_name ? -1 : a.npc_name > b.npc_name ? 1 : 0),
    )[0];
  return row
    ? { npcId: row.npc_id, npcName: row.npc_name, uiMapID: row.ui_map_id, x: row.x, y: row.y }
    : null;
}
