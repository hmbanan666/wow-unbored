import type { AlbumRecipe, Profession } from "@unbored/contracts/profession-progress";

import { professionName } from "@unbored/contracts/profession-name";
export { professionName };
export function professionSlug(
  profession: Pick<Profession, "skillLine" | "name"> & Partial<Pick<Profession, "aliases">>,
): string {
  return professionName(profession)
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export const ALBUM_FILTERS = [
  { id: "all", label: "All" },
  { id: "now", label: "Can get now" },
  { id: "missing", label: "Missing" },
  { id: "trainer", label: "Trainer" },
  { id: "vendor", label: "Vendor" },
  { id: "tradable", label: "Tradable formula" },
  { id: "bop", label: "Get it yourself (BoP)" },
  { id: "unseen", label: "Not seen yet" },
] as const;
export function albumFilter(query: unknown): string {
  return typeof query === "string" &&
    (ALBUM_FILTERS.some((f) => f.id === query) ||
      query.startsWith("zone:") ||
      query.startsWith("category:"))
    ? query
    : "all";
}
export function matchesAlbumFilter(recipe: AlbumRecipe, filter: string): boolean {
  if (filter === "all") return true;
  if (filter.startsWith("zone:")) return recipe.sources.some((s) => s.zone === filter.slice(5));
  if (filter.startsWith("category:")) return String(recipe.category.id) === filter.slice(9);
  if (filter === "missing") return recipe.known === false;
  if (filter === "now") return recipe.known === false && recipe.difficulty.canGetNow;
  const source = recipe.difficulty.source;
  return filter === "vendor"
    ? source === "vendor" || source === "vendor_limited"
    : filter === "tradable"
      ? source === "tradable_formula"
      : filter === "bop"
        ? source === "bop_formula"
        : filter === "unseen"
          ? source === "not_seen"
          : source === filter;
}
export function albumCategories(recipes: AlbumRecipe[]) {
  const categories = new Map<
    number,
    { id: number; name: string; known: number; recipes: AlbumRecipe[] }
  >();
  for (const recipe of recipes) {
    const category = categories.get(recipe.category.id) ?? {
      ...recipe.category,
      known: 0,
      recipes: [],
    };
    category.recipes.push(recipe);
    if (recipe.known) category.known++;
    categories.set(category.id, category);
  }
  return [...categories.values()].sort(
    (a, b) =>
      b.known - a.known ||
      b.recipes.length - a.recipes.length ||
      a.name.localeCompare(b.name, "en"),
  );
}
export function easiestMissing(recipes: AlbumRecipe[], filter: string) {
  return recipes
    .filter((r) => r.known === false && matchesAlbumFilter(r, filter))
    .sort(
      (a, b) =>
        a.difficulty.score - b.difficulty.score ||
        (a.difficulty.requiredSkill ?? Infinity) - (b.difficulty.requiredSkill ?? Infinity) ||
        (a.name ?? "").localeCompare(b.name ?? "", "en") ||
        a.spellId - b.spellId,
    );
}
export function recipeLabel(recipe: AlbumRecipe): string {
  return `${recipe.name || "Recipe name unavailable"}, ${recipe.known === true ? "known" : recipe.known === null ? "not checked yet" : `missing, ${recipe.difficulty.label}`}`;
}
export function recipeMonogram(name: string | null): string {
  return (name ?? "?")
    .replace(/^Enchant (2H Weapon|Bracer|Chest|Cloak|Boots|Gloves|Shield|Weapon) - /, "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}
