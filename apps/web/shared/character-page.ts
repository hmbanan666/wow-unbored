import type { TodaySet } from "@unbored/contracts/today-goals";
import type { MyCharacter } from "./my-page";
import type { Profession } from "@unbored/contracts/profession-progress";
export { professionViews, type Profession } from "@unbored/contracts/profession-progress";

export type CharacterIdentity = Pick<MyCharacter, "game" | "realm" | "name">;
export type CharacterPage = CharacterIdentity & {
  professions: Profession[];
  today?: TodaySet[] | null;
};

export function characterHref(character: CharacterIdentity): string {
  return `/my/${character.game}/${encodeURIComponent(character.realm)}/${encodeURIComponent(character.name)}`;
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
