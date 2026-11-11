import type { ProfessionRecipe } from "./profession-catalog.ts";

export type RecipeSighting = {
  kind: "trainer" | "vendor";
  spell_id: number | null;
  recipe_spell_id: number | null;
  item_id: number | null;
  skill_line: number | null;
  recipe_name: string | null;
  locale: string | null;
  npc_id: number;
  npc_name: string;
  ui_map_id: number | null;
  x: number | null;
  y: number | null;
  cost: number | null;
  required_skill: number | null;
  limited: number;
  first_seen: number;
  last_seen: number;
};
/** Deliberately excludes Account identity and per-Account counts at the SQL boundary. */
export const SIGHTING_COLUMNS =
  "kind, spell_id, recipe_spell_id, item_id, skill_line, recipe_name, locale, npc_id, npc_name, ui_map_id, x, y, cost, required_skill, limited, first_seen, last_seen";
export type RecipeSource = {
  kind: "trainer" | "vendor";
  npcId: number;
  npcName: string;
  uiMapID: number | null;
  zone: string;
  x: number | null;
  y: number | null;
  cost: number | null;
  requiredSkill: number | null;
  itemId: number | null;
  limited: boolean;
  firstSeen: number;
  lastSeen: number;
};
export type RecipeSources = {
  spellId: number;
  sources: RecipeSource[];
  teachingItems: { itemId: number; name: string | null }[];
};

/** No fuzzy or translated name matching. Ambiguous English names remain unresolved. */
export function resolveSighting(row: RecipeSighting, recipes: ProfessionRecipe[]): number[] {
  if (row.kind === "vendor")
    return recipes
      .filter((r) => row.item_id !== null && r.teachingItems.includes(row.item_id))
      .map((r) => r.spellId);
  if (row.spell_id !== null)
    return recipes
      .filter(
        (r) =>
          r.spellId === row.spell_id && (row.skill_line === null || r.skillLine === row.skill_line),
      )
      .map((r) => r.spellId);
  if (row.locale !== "enUS" || row.skill_line === null || !row.recipe_name) return [];
  const found = recipes.filter((r) => r.skillLine === row.skill_line && r.name === row.recipe_name);
  return found.length === 1 ? [found[0]!.spellId] : [];
}

export function aggregateRecipeSources(
  recipes: ProfessionRecipe[],
  sightings: RecipeSighting[],
  zones: ReadonlyMap<number, string> = new Map(),
  items: ReadonlyMap<number, string> = new Map(),
): RecipeSources[] {
  const bySpell = new Map<number, Map<string, RecipeSource>>();
  for (const row of sightings) {
    for (const spellId of resolveSighting(row, recipes)) {
      const sources = bySpell.get(spellId) ?? new Map<string, RecipeSource>();
      // The latest observation supplies price/stock/location; retain both kinds and teaching items.
      const key = `${row.kind}:${row.npc_id}:${row.item_id ?? 0}`;
      const old = sources.get(key);
      if (!old || row.last_seen > old.lastSeen) {
        sources.set(key, {
          kind: row.kind,
          npcId: row.npc_id,
          npcName: row.npc_name,
          uiMapID: row.ui_map_id,
          zone:
            (row.ui_map_id && zones.get(row.ui_map_id)) ||
            `Unknown zone${row.ui_map_id === null ? "" : ` (${row.ui_map_id})`}`,
          x: row.x,
          y: row.y,
          cost: row.cost,
          requiredSkill: row.required_skill,
          itemId: row.item_id,
          limited: row.limited === 1,
          firstSeen: Math.min(old?.firstSeen ?? row.first_seen, row.first_seen),
          lastSeen: row.last_seen,
        });
      } else old.firstSeen = Math.min(old.firstSeen, row.first_seen);
      bySpell.set(spellId, sources);
    }
  }
  return recipes.map((recipe) => ({
    spellId: recipe.spellId,
    sources: [...(bySpell.get(recipe.spellId)?.values() ?? [])].sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.npcId - b.npcId || (a.itemId ?? 0) - (b.itemId ?? 0),
    ),
    teachingItems: recipe.teachingItems.map((itemId) => ({
      itemId,
      name: items.get(itemId) ?? null,
    })),
  }));
}

export const SOURCE_GROUPS = [
  {
    id: "trainer",
    name: "Trainer",
    explanation:
      "A player saw this recipe offered by this trainer. Requirements and prices are from that visit.",
  },
  {
    id: "vendor",
    name: "Vendor",
    explanation:
      "A player saw the teaching item for sale with unlimited stock. Prices are from that visit.",
  },
  {
    id: "limited",
    name: "Limited supply",
    explanation:
      "The vendor has finite stock, which may be sold out when you arrive. This is a past sighting, not live availability.",
  },
  {
    id: "item",
    name: "From item",
    explanation:
      "The client tables name a teaching item, but nobody has shared a place to get it yet.",
  },
  {
    id: "unseen",
    name: "Not seen yet",
    explanation:
      "No trainer, vendor or teaching item is known yet. Visit trainers and recipe vendors with sharing on to help fill the gaps.",
  },
] as const;
export function recipeSourceGroup(sources: RecipeSources): (typeof SOURCE_GROUPS)[number]["id"] {
  if (sources.sources.some((s) => s.kind === "trainer")) return "trainer";
  if (sources.sources.some((s) => s.kind === "vendor" && !s.limited)) return "vendor";
  if (sources.sources.length) return "limited";
  return sources.teachingItems.length ? "item" : "unseen";
}
