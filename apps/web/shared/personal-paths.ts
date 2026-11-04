import type { PublicPage } from "./catalog";

export type PathSelection = { kind: "path" | "collection"; slug: string; locale: "en" | "ru" };
export type PathProgress = PathSelection & {
  title: string;
  version: number;
  done: number;
  total: number;
  goals: { position: number; done: boolean; required: boolean }[];
};
export type CharacterPaths = {
  character: string;
  realm: string;
  paths: PathProgress[];
  active: PathProgress | null;
};
export type PersonalPaths = { characters: CharacterPaths[] };

export function pathForPage(
  paths: PathProgress[],
  page: Pick<PublicPage, "kind" | "slug" | "version">,
) {
  return paths.find(
    (path) =>
      path.kind === page.kind &&
      path.slug === page.slug &&
      path.locale === "en" &&
      path.version === page.version,
  );
}
export function selectionOf(path: PathSelection): PathSelection {
  return { kind: path.kind, slug: path.slug, locale: path.locale };
}
export function replacementFor(
  active: PathSelection | null,
  next: PathSelection,
): PathSelection | null {
  return active &&
    (active.kind !== next.kind || active.slug !== next.slug || active.locale !== next.locale)
    ? selectionOf(active)
    : null;
}

export const PATH_COPY = {
  en: {
    install: "Get Unbored",
    title: "Your progress",
    character: "Character",
    required: "required goals",
    done: "Done",
    notDone: "Not done yet",
    optional: "Optional",
    loading: "Bory is checking your progress…",
    failed: "Bory couldn't check your Paths just now.",
    retry: "Try again",
    empty: "Bory hasn't seen your characters yet. Play once, then open My page from the Companion.",
    active: "Active Path",
    none: "No active Path yet.",
    pick: "Make this my active Path",
    selected: "This is your active Path",
    saving: "Bory is saving your choice…",
    replace: "Replace your active Path?",
    confirm: "Replace Path",
    cancel: "Keep current Path",
    replaceText: "Your progress stays. Bory will continue the new Path in game.",
    limited: "A little pause, then another step. Try again in ten minutes.",
    saved: "All set. Bory can continue this Path in game.",
    changed: "This page has a newer version. Open it again to see the latest goals.",
    reopen: "Open latest page",
    browse: "Browse Paths",
  },
  ru: {
    install: "Установить Unbored",
    title: "Твой прогресс",
    character: "Персонаж",
    required: "обязательных целей",
    done: "Готово",
    notDone: "Ещё не готово",
    optional: "Необязательно",
    loading: "Бори проверяет твой прогресс…",
    failed: "Бори пока не смог проверить твои Пути.",
    retry: "Попробовать ещё",
    empty:
      "Бори ещё не видел твоих персонажей. Поиграй разок, затем открой Мою страницу из Companion.",
    active: "Активный Путь",
    none: "Активного Пути пока нет.",
    pick: "Сделать моим активным Путём",
    selected: "Это твой активный Путь",
    saving: "Бори запоминает твой выбор…",
    replace: "Заменить активный Путь?",
    confirm: "Заменить Путь",
    cancel: "Оставить текущий Путь",
    replaceText: "Прогресс сохранится. Бори продолжит новый Путь в игре.",
    limited: "Небольшая передышка. Попробуй снова через десять минут.",
    saved: "Готово. Бори может продолжить этот Путь в игре.",
    changed: "У страницы новая версия. Открой её ещё раз, чтобы увидеть свежие цели.",
    reopen: "Открыть свежую страницу",
    browse: "Посмотреть Пути",
  },
} as const;
