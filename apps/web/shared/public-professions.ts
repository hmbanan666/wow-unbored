import type { AlbumRecipe, Profession } from "@unbored/contracts/profession-progress";
import type { RecipeDifficulty } from "@unbored/contracts/recipe-difficulty";
import type { CharacterIdentity } from "./character-page";
import type { TodaySet } from "@unbored/contracts/today-goals";

export type Game = "forever" | "retail";
export const gameName = (game: Game) => (game === "forever" ? "WoW Forever" : "WoW Retail");
export const isGame = (value: unknown): value is Game => value === "forever" || value === "retail";
export type PublicRecipe = Omit<AlbumRecipe, "known" | "band"> & {
  known: null;
  band: null;
  slug: string;
  craftedItemNames: { itemId: number; name: string | null }[];
};
export type PublicProfession = Pick<Profession, "skillLine" | "name"> & {
  slug: string;
  album: PublicRecipe[];
};
export type RecipeOverlay = {
  known: boolean | null;
  difficulty: RecipeDifficulty;
};
export type ProfessionOverlay = {
  character: CharacterIdentity;
  skill: number | null;
  max: number | null;
  known: number | null;
  total: number;
  difficultyCounts: Profession["difficultyCounts"];
  recipes: Record<number, RecipeOverlay>;
  today: TodaySet | null;
  todayUnavailable: boolean;
};
export type SingleRecipeOverlay = RecipeOverlay & {
  character: CharacterIdentity;
  skill: number | null;
  max: number | null;
};
export function overlayProfession(
  base: PublicProfession,
  overlay?: ProfessionOverlay | null,
): Profession {
  const album = base.album.map((r) => ({ ...r, ...overlay?.recipes[r.spellId] }));
  return {
    ...base,
    album,
    aliases: [],
    skill: overlay?.skill ?? null,
    max: overlay?.max ?? null,
    known: overlay?.known ?? null,
    total: album.length,
    uncatalogued: 0,
    missing: [],
    difficultyCounts: overlay?.difficultyCounts ?? { easy: 0, medium: 0, hard: 0 },
  };
}
export function professionHref(game: Game, slug: string) {
  return `/${game}/professions/${slug}`;
}
export function recipeHref(game: Game, slug: string) {
  return `/${game}/recipes/${slug}`;
}
export function professionTrail(game: Game, profession?: Pick<PublicProfession, "slug" | "name">) {
  return [
    { label: "Home", to: "/" },
    { label: gameName(game), to: game === "forever" ? "/forever" : "/guides" },
    { label: "Professions", to: `/${game}/professions` },
    ...(profession ? [{ label: profession.name, to: professionHref(game, profession.slug) }] : []),
  ];
}
