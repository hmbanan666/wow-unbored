import { isPackedIdSet, unpackIds } from "@unbored/contracts/packed";
import type { MyCharacter } from "./my-page";

export type CharacterIdentity = Pick<MyCharacter, "game" | "realm" | "name">;
export type Profession = {
  skillLine: number;
  name: string;
  skill: number | null;
  max: number | null;
  known: number | null;
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

export function professionViews(professions: unknown, recipes: unknown): Profession[] {
  const list = record(professions).list;
  if (!Array.isArray(list)) return [];
  const byProfession = record(record(recipes).byProfession);
  return list.flatMap((entry) => {
    const row = record(entry);
    const skillLine = rank(row.skillLine);
    if (!skillLine || typeof row.name !== "string" || !row.name.trim()) return [];
    const learned = record(byProfession[String(skillLine)]).learned;
    return [
      {
        skillLine,
        name: row.name,
        skill: rank(row.skill),
        max: rank(row.max),
        known: isPackedIdSet(learned) ? new Set(unpackIds(learned)).size : null,
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
