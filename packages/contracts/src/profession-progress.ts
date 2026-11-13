import { recipeDifficulty, type RecipeDifficulty } from "./recipe-difficulty.ts";
import {
  professionSkills,
  computeSkillRoute,
  learnedRecipes,
  observedRankTrainer,
  heldReagents,
  vendorPrices,
} from "./skill-route.ts";
import { aggregateRecipeSources, type RecipeSighting } from "./recipe-sources.ts";
import type { SkillRoute } from "./skill-route.ts";
import {
  SOURCE_GROUPS,
  recipeSourceGroup,
  type RecipeSources,
  type RecipeSource,
} from "./recipe-sources.ts";
import { recipeBand, type ProfessionRecipe, type RecipeBand } from "./profession-catalog.ts";
import { isPackedIdSet, unpackIds } from "./packed.ts";
export type Profession = {
  routes?: { name: string; route: SkillRoute }[];
  album: AlbumRecipe[];
  skillLine: number;
  aliases: number[];
  difficultyCounts: Record<RecipeDifficulty["label"], number>;
  name: string;
  skill: number | null;
  max: number | null;
  known: number | null;
  total: number | null;
  uncatalogued: number;
  missing: {
    id: (typeof SOURCE_GROUPS)[number]["id"];
    name: string;
    explanation: string;
    recipes: (ProfessionRecipe & {
      difficulty: RecipeDifficulty;
      reagents: { itemId: number; count: number; name: string | null }[];
      band: RecipeBand | null;
      sources: RecipeSource[];
      teachingItemNames: {
        itemId: number;
        name: string | null;
        quality: number | null;
        bindOnPickup: boolean | null;
      }[];
    })[];
  }[];
};
export type AlbumRecipe = Profession["missing"][number]["recipes"][number] & {
  /** null means the profession window has not been read. */
  known: boolean | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function professionViews(
  professions: unknown,
  recipes: unknown,
  catalog: ProfessionRecipe[] = [],
  sources: RecipeSources[] = [],
  game: "retail" | "forever" = "retail",
  items: ReadonlyMap<number, string> = new Map(),
): Profession[] {
  const bySpell = new Map(sources.map((s) => [s.spellId, s]));
  const byProfession = record(record(recipes).byProfession);
  return normalizedProfessions(professions, game, catalog).map((entry) => {
    const { skillLine, skill, max } = entry;
    const tiers =
      game === "retail"
        ? professionSkills(professions).filter((p) => p.parentSkillLine === skillLine)
        : [];
    const lines = [skillLine, ...entry.aliases, ...tiers.map((p) => p.skillLine)];
    const learnedByLine = new Map(
      lines.map((id) => {
        const packed = record(byProfession[String(id)]).learned;
        return [id, isPackedIdSet(packed) ? new Set(unpackIds(packed)) : null] as const;
      }),
    );
    const combine = (ids: number[]) => {
      const sets = ids
        .map((id) => learnedByLine.get(id))
        .filter((set): set is Set<number> => set != null);
      return sets.length ? new Set(sets.flatMap((set) => [...set])) : null;
    };
    const known = combine(lines);
    // GetBaseProfessionInfo keys the addon's all-expansion recipe read by the base id.
    const baseKnown = combine([skillLine, ...entry.aliases]);
    const difficultyCounts = { easy: 0, medium: 0, hard: 0 };
    const catalogLines = [skillLine, ...tiers.map((p) => p.skillLine)];
    const entries = catalog.filter((recipe) => catalogLines.includes(recipe.skillLine));
    const ids = new Set(entries.map((recipe) => recipe.spellId));
    const missing: Profession["missing"] = [];
    const album: AlbumRecipe[] = entries.map((recipe) => {
      const tier = tiers.find((p) => p.skillLine === recipe.skillLine);
      const recipeSkill = tier ? tier.skill : skill;
      const recipeMax = tier ? tier.max : max;
      const recipeKnown = baseKnown ?? (tier ? (learnedByLine.get(tier.skillLine) ?? null) : known);
      const evidence = bySpell.get(recipe.spellId) ?? {
        spellId: recipe.spellId,
        sources: [],
        teachingItems: recipe.teachingItems.map((itemId) => ({
          itemId,
          name: items.get(itemId) ?? null,
        })),
      };
      return {
        ...recipe,
        known: recipeKnown === null ? null : recipeKnown.has(recipe.spellId),
        band: recipeSkill === null ? null : recipeBand(recipe, recipeSkill),
        sources: evidence.sources,
        difficulty: recipeDifficulty({
          recipe,
          sources: evidence.sources,
          skill: recipeSkill,
          rankMax: recipeMax,
          game,
        }),
        reagents: recipe.reagents.map((r) => ({ ...r, name: items.get(r.itemId) ?? null })),
        teachingItemNames: evidence.teachingItems.map((t) => {
          const facts = recipe.teaching?.find((f) => f.itemId === t.itemId);
          return {
            ...t,
            quality: facts?.quality ?? null,
            bindOnPickup: facts?.bindOnPickup ?? null,
          };
        }),
      };
    });
    for (const recipe of album) {
      if (recipe.known !== false) continue;
      const id = recipeSourceGroup({
        spellId: recipe.spellId,
        sources: recipe.sources,
        teachingItems: recipe.teachingItemNames,
      });
      let group = missing.find((group) => group.id === id);
      if (!group) {
        group = { ...SOURCE_GROUPS.find((g) => g.id === id)!, recipes: [] };
        missing.push(group);
      }
      difficultyCounts[recipe.difficulty.label]++;
      group.recipes.push(recipe);
    }
    missing.sort(
      (a, b) =>
        SOURCE_GROUPS.findIndex((g) => g.id === a.id) -
        SOURCE_GROUPS.findIndex((g) => g.id === b.id),
    );
    for (const group of missing)
      group.recipes.sort(
        (a, b) =>
          a.minSkill - b.minSkill ||
          (a.name ?? "").localeCompare(b.name ?? "", "en") ||
          a.spellId - b.spellId,
      );
    return {
      skillLine,
      aliases: entry.aliases,
      difficultyCounts,
      album,
      name: entry.name,
      skill,
      max,
      known: known?.size ?? null,
      total: entries.length || null,
      uncatalogued: entries.length && known ? [...known].filter((id) => !ids.has(id)).length : 0,
      missing,
    };
  });
}

/** ADR 0101: Forever reports both legacy and expansion ids for the same profession. */
export function normalizedProfessions(
  body: unknown,
  game: "retail" | "forever",
  catalog: ProfessionRecipe[],
) {
  const all = professionSkills(body);
  if (game === "retail")
    return all
      .filter((p) => p.parentSkillLine === null)
      .map((p) => ({ ...p, aliases: [] as number[] }));
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const parent = all.find((v) => v.skillLine === p.parentSkillLine);
    const key = (parent?.name ?? p.name).toLocaleLowerCase("en");
    const group = groups.get(key) ?? [];
    group.push(p);
    groups.set(key, group);
  }
  return [...groups.values()].map((rows) => {
    const chosen = rows.find((p) => catalog.some((r) => r.skillLine === p.skillLine)) ?? rows[0]!;
    return {
      ...chosen,
      aliases: [...new Set(rows.map((p) => p.skillLine))]
        .filter((id) => id !== chosen.skillLine)
        .sort((a, b) => a - b),
    };
  });
}

/** The private API and MCP use this same projection of Sections, client facts and sightings. */
export function professionProgress(input: {
  game: "retail" | "forever";
  professions: unknown;
  recipes: unknown;
  bags?: unknown;
  bank?: unknown;
  reagentBank?: unknown;
  catalog: ProfessionRecipe[];
  sightings: RecipeSighting[];
  zones: ReadonlyMap<number, string>;
  items: ReadonlyMap<number, string>;
}): Profession[] {
  const { game, catalog, items, zones } = input;
  const professions = normalizedProfessions(input.professions, game, catalog);
  const sightings = input.sightings.map((s) => ({
    ...s,
    skill_line:
      professions.find((p) => p.aliases.includes(s.skill_line ?? 0))?.skillLine ?? s.skill_line,
  }));
  const sources = aggregateRecipeSources(catalog, sightings, zones, items);
  const skills =
    game === "forever"
      ? professions
      : professionSkills(input.professions).map((p) => ({ ...p, aliases: [] as number[] }));
  const plans = skills.map((p) => ({
    name: p.name,
    route: computeSkillRoute({
      game,
      ...p,
      recipes: catalog,
      known: [p.skillLine, ...p.aliases].flatMap((id) => learnedRecipes(input.recipes, id)),
      sources,
      rankTrainer: observedRankTrainer(sightings, p.skillLine),
      itemNames: Object.fromEntries(items),
      held: heldReagents([input.bags, input.bank, input.reagentBank]),
      prices: vendorPrices(sightings),
    }),
  }));
  return professionViews(input.professions, input.recipes, catalog, sources, game, items).map(
    (p) => ({
      ...p,
      routes: plans.filter(
        (plan) =>
          plan.route.skillLine === p.skillLine ||
          skills.some(
            (tier) =>
              tier.parentSkillLine === p.skillLine && tier.skillLine === plan.route.skillLine,
          ),
      ),
    }),
  );
}
