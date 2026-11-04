import { catalogHref, isSlug } from "./catalog";
import type { PageLang } from "./sign-in";

export const MY_PAGE_COPY = {
  en: {
    title: "My page",
    level: "Level",
    ilvl: "Item level",
    keystone: "Keystone",
    renown: "Renown",
    plans: "Plans",
    wins: "Wins",
    completions: "Finished Paths",
    emptyCompletions: "No finished Paths yet. Pick a Path and Bory will help you along.",
    emptyCharacters: "Bory hasn't seen your characters yet. Play once, and they'll show up here.",
    emptyPlans: "No plans yet. Pick one with Bory in the game.",
    emptyWins: "Nothing from a plan has come home yet.",
    kinds: {
      mount: "Mount",
      ach: "Achievement",
      toy: "Toy",
      pet: "Pet",
      item: "Item",
      quest: "Quest",
    },
  },
  ru: {
    title: "Моя страница",
    level: "Уровень",
    ilvl: "Уровень предметов",
    keystone: "Ключ",
    renown: "Известность",
    plans: "Планы",
    wins: "Победы",
    completions: "Завершённые Пути",
    emptyCompletions: "Завершённых Путей пока нет. Выбери Путь — Бори поможет пройти его.",
    emptyCharacters: "Бори ещё не видел твоих персонажей. Поиграй разок, и они появятся здесь.",
    emptyPlans: "Планов пока нет. Выбери один с Бори в игре.",
    emptyWins: "Пока ничего из плана не пришло.",
    kinds: {
      mount: "Маунт",
      ach: "Достижение",
      toy: "Игрушка",
      pet: "Питомец",
      item: "Предмет",
      quest: "Задание",
    },
  },
} as const;

export type MyCharacter = {
  name: string;
  realm: string;
  className: string | null;
  level: number | null;
  ilvl: number | null;
  keystone: number | null;
  renown: { name: string; level: number }[];
};

export type MyEntry = {
  at: number;
  character: string;
  realm: string;
  title: string;
};

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function characterView(row: {
  name: string;
  realm: string;
  className: string | null;
  level: number | null;
  charBody: unknown;
  mplusBody: unknown;
  reputationBody: unknown;
}): MyCharacter {
  const char =
    row.charBody && typeof row.charBody === "object"
      ? (row.charBody as Record<string, unknown>)
      : {};
  const mplus =
    row.mplusBody && typeof row.mplusBody === "object"
      ? (row.mplusBody as Record<string, unknown>)
      : {};
  const reputation =
    row.reputationBody && typeof row.reputationBody === "object"
      ? (row.reputationBody as Record<string, unknown>)
      : {};
  const level = whole(char.level) ?? (row.level && row.level > 0 ? row.level : null);
  const ilvl =
    typeof char.ilvl === "number" && Number.isFinite(char.ilvl) && char.ilvl > 0
      ? Math.round(char.ilvl)
      : null;
  const renown: { name: string; level: number }[] = [];
  if (Array.isArray(reputation.renown)) {
    for (const entry of reputation.renown) {
      if (renown.length >= 3 || !entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const name = text(item.name);
      const rank = whole(item.level);
      if (name && rank) renown.push({ name, level: rank });
    }
  }
  return {
    name: row.name,
    realm: row.realm,
    className: text(char.class) || row.className,
    level,
    ilvl,
    keystone: whole(mplus.keyLevel),
    renown,
  };
}

export function planTitle(body: unknown, planBody: unknown): string {
  const plan =
    planBody && typeof planBody === "object" ? (planBody as Record<string, unknown>) : {};
  const titled = text(plan.title);
  if (titled) return titled;
  const history = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (Array.isArray(history.steps)) {
    for (const step of history.steps) {
      if (step && typeof step === "object") {
        const title = text((step as Record<string, unknown>).title);
        if (title) return title;
      }
    }
  }
  return "";
}

export function winTitle(body: unknown, lang: PageLang): string {
  const history = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const title = text(history.planTitle);
  if (title) return title;
  const kind = text(history.kind);
  const label = MY_PAGE_COPY[lang].kinds[kind as keyof (typeof MY_PAGE_COPY)["en"]["kinds"]];
  return label || "";
}

export function formatDay(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  return new Date(at * 1000).toISOString().slice(0, 10);
}

export type MyCompletion = MyEntry & { href: string; version: number };

export function completionView(
  body: unknown,
): Pick<MyCompletion, "title" | "href" | "version"> | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (
    (row.kind !== "path" && row.kind !== "collection") ||
    !isSlug(row.slug) ||
    !text(row.title) ||
    !whole(row.version)
  )
    return null;
  return {
    title: text(row.title),
    href: catalogHref(row.kind, row.slug)!,
    version: whole(row.version)!,
  };
}
