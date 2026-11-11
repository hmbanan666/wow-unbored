import type { SkillRoute } from "@unbored/contracts/skill-route";
import {
  SOURCE_GROUPS,
  recipeSourceGroup,
  type RecipeSources,
  type RecipeSource,
} from "@unbored/contracts/recipe-sources";
import {
  recipeBand,
  type ProfessionRecipe,
  type RecipeBand,
} from "@unbored/contracts/profession-catalog";
import { isPackedIdSet, unpackIds } from "@unbored/contracts/packed";
import type { MyCharacter } from "./my-page";

export type CharacterIdentity = Pick<MyCharacter, "game" | "realm" | "name">;
export type Profession = {
  routes?: { name: string; route: SkillRoute }[];
  skillLine: number;
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
      band: RecipeBand | null;
      sources: RecipeSource[];
      teachingItemNames: RecipeSources["teachingItems"];
    })[];
  }[];
};
export type CharacterPage = CharacterIdentity & { professions: Profession[] };

export function characterHref(character: CharacterIdentity): string {
  return `/my/${character.game}/${encodeURIComponent(character.realm)}/${encodeURIComponent(character.name)}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function rank(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function professionViews(
  professions: unknown,
  recipes: unknown,
  catalog: ProfessionRecipe[] = [],
  sources: RecipeSources[] = [],
): Profession[] {
  const bySpell = new Map(sources.map((s) => [s.spellId, s]));
  const list = record(professions).list;
  if (!Array.isArray(list)) return [];
  const byProfession = record(record(recipes).byProfession);
  return list.flatMap((entry) => {
    const row = record(entry);
    const skillLine = rank(row.skillLine);
    if (!skillLine || typeof row.name !== "string" || !row.name.trim()) return [];
    const learned = record(byProfession[String(skillLine)]).learned;
    const known = isPackedIdSet(learned) ? new Set(unpackIds(learned)) : null;
    const entries = catalog.filter((recipe) => recipe.skillLine === skillLine);
    const ids = new Set(entries.map((recipe) => recipe.spellId));
    const missing: Profession["missing"] = [];
    const skill = rank(row.skill);
    if (known) {
      for (const recipe of entries) {
        if (known.has(recipe.spellId)) continue;
        const evidence = bySpell.get(recipe.spellId) ?? {
          spellId: recipe.spellId,
          sources: [],
          teachingItems: recipe.teachingItems.map((itemId) => ({ itemId, name: null })),
        };
        const id = recipeSourceGroup(evidence);
        let group = missing.find((group) => group.id === id);
        if (!group) {
          group = { ...SOURCE_GROUPS.find((g) => g.id === id)!, recipes: [] };
          missing.push(group);
        }
        group.recipes.push({
          ...recipe,
          band: skill === null ? null : recipeBand(recipe, skill),
          sources: evidence.sources,
          teachingItemNames: evidence.teachingItems,
        });
      }
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
    return [
      {
        skillLine,
        name: row.name,
        skill: rank(row.skill),
        max: rank(row.max),
        known: known?.size ?? null,
        total: entries.length || null,
        uncatalogued: entries.length && known ? [...known].filter((id) => !ids.has(id)).length : 0,
        missing,
      },
    ];
  });
}

export const CHARACTER_COPY = {
  en: {
    title: "Character",
    professions: "Professions",
    skill: "Skill",
    known: "Known recipes",
    of: "of",
    missing: "Missing recipes",
    minSkill: "Minimum skill",
    unnamed: "Recipe name unavailable",
    uncatalogued: "Known recipes not yet in this list",
    catalogEmpty:
      "Bory's recipe list isn't ready yet. Your known count is saved; check back later.",
    complete: "You know every recipe in this list.",
    bands: { orange: "Orange", yellow: "Yellow", green: "Green", grey: "Grey" },
    open: "Open your profession window once in game so Bory can see what you know.",
    empty: "Bory hasn't seen your professions yet.",
    loading: "Bory is checking your professions…",
    failed: "Bory couldn't check your professions just now.",
    retry: "Try again",
    back: "My page",
    view: "View character",
    notFound: "This character isn't on your My page.",
  },
  ru: {
    title: "Персонаж",
    professions: "Профессии",
    skill: "Навык",
    known: "Известные рецепты",
    of: "из",
    missing: "Недостающие рецепты",
    minSkill: "Нужный навык",
    unnamed: "Название рецепта пока неизвестно",
    uncatalogued: "Известные рецепты, которых пока нет в списке",
    catalogEmpty: "Список рецептов Бори ещё не готов. Число известных сохранено; загляни позже.",
    complete: "Ты знаешь все рецепты из этого списка.",
    bands: { orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", grey: "Серый" },
    open: "Открой окно профессии в игре один раз, чтобы Бори увидел, что ты знаешь.",
    empty: "Бори ещё не видел твои профессии.",
    loading: "Бори проверяет твои профессии…",
    failed: "Бори пока не удалось проверить твои профессии.",
    retry: "Попробовать ещё раз",
    back: "Моя страница",
    view: "Открыть персонажа",
    notFound: "Этого персонажа нет на твоей странице.",
  },
} as const;
