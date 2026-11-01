import { readFileSync } from "node:fs";

import {
  unpackIds,
  type Suggestion,
  type SuggestionKind,
  type SuggestionsBody,
} from "@unbored/contracts";

import type { CharacterRow, DataStore, SectionRow } from "./data.ts";
import { fromJson, SqliteDb, type Db } from "./db.ts";
import { computeTaste, tasteMap } from "./taste.ts";

export type { Suggestion, SuggestionKind, SuggestionsBody };

/**
 * Suggestions (docs/adr/0040): ideas for the choice Bubble, made from the
 * player's own data and the addon's curated catalog only. No LLM, no guessed
 * ids: every id here is a catalog row or comes from the player's Sections.
 */

export type CharacterSuggestions = { character: string; realm: string; list: Suggestion[] };

export const SUGGESTION_LIMITS = {
  perCharacter: 10,
  perRule: 3,
  title: 40,
  goal: 140,
  why: 100,
  rewards: 3,
} as const;

const DAY = 86_400;
const SOON = 3 * DAY;
/** A chain with no progress this long was dropped (D137). */
const STOPPED_AFTER = 14 * DAY;
const SCORE = {
  event: 100,
  eventEndsSoon: 20,
  eventStartsSoon: 70,
  chain: 70,
  chainCampaign: 10,
  chainStopped: 5,
  achievement: 60,
  almostDone: 65,
  rare: 50,
  collection: 40,
  alts: 10,
};

type CatalogTask = {
  id: string;
  fallbackTitle?: string;
  achievementIDs?: number[];
  mountID?: number;
  toyID?: number;
  /** A weekly quest: open while this Character has not turned it in. */
  questID?: number;
  cost?: { currencyID: number; amount: number };
  faction?: string;
};
/** One row of the event catalog (D128): any key in `match` names the event. */
type CatalogHoliday = {
  id: string;
  match: { holidayIDs?: number[]; textures?: number[]; titles?: string[] };
  fallbackTitle?: string;
  tasks: CatalogTask[];
};
type CatalogAchievement = {
  id?: string;
  achievementID: number;
  fallbackTitle: string;
  mapID?: number;
};
type CatalogRare = {
  id: string;
  fallbackTitle: string;
  npcID?: number;
  mapID?: number;
  questID?: number;
};
type CatalogFarm = {
  id: string;
  fallbackTitle: string;
  mapID?: number;
  instanceID?: number;
  mounts?: number[];
};

export type Catalog = {
  holidays: CatalogHoliday[];
  achievements: CatalogAchievement[];
  exploration: CatalogAchievement[];
  rares: CatalogRare[];
  farm: CatalogFarm[];
};

let cached: Catalog | undefined;

/** packages/contracts/catalog/catalog.json, exported from addon/Data (D104). */
export function loadCatalog(): Catalog {
  cached ??= JSON.parse(
    readFileSync(new URL(import.meta.resolve("@unbored/contracts/catalog.json")), "utf8"),
  ) as Catalog;
  return cached;
}

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function fit(text: string, max: number, measure: (value: string) => number): string {
  if (measure(text) <= max) return text;
  let out = "";
  for (const word of text.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (measure(next) > max) break;
    out = next;
  }
  return out.replace(/[\s,;:.-]+$/, "") || [...text].slice(0, max).join("");
}

const chars = (value: string) => [...value].length;

/** The languages the addon speaks; ideas are written in the Character's own. */
export type IdeaLang = "en" | "ru";

export function ideaLang(value: unknown): IdeaLang | undefined {
  return value === "en" || value === "ru" ? value : undefined;
}

/** Russian counts: 1 день, 2 дня, 5 дней. */
function ruCount(n: number, one: string, few: string, many: string): string {
  const tens = n % 100;
  const last = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Every word an idea says, per language. Names come from the game or the catalog. */
const TEXT: Record<
  IdeaLang,
  {
    generic: Record<string, string>;
    eventGoal: (name: string, left: number) => string;
    startsSoon: string;
    startsIn: (days: number) => string;
    chainGoal: (done: number, total: number) => string;
    altDone: (name: string) => string;
    stopped: (days: number) => string;
    endsIn: (days: number) => string;
    alts: (count: number) => string;
    achievementGoal: (token: string) => string;
    rareGoal: (name: string) => string;
    farmGoal: (place: string, token: string) => string;
    almostTitle: string;
    almostGoal: (token: string) => string;
    almostWhy: (done: number, total: number) => string;
  }
> = {
  en: {
    generic: {
      ach: "an achievement",
      mount: "a mount",
      item: "an item",
      toy: "a toy",
      pet: "a pet",
      currency: "a currency",
      instance: "a dungeon",
      zone: "a zone",
    },
    eventGoal: (name, left) =>
      `${name} is on: ${left} thing${left === 1 ? "" : "s"} you have not done yet.`,
    startsSoon: "Starts soon",
    startsIn: (days) => (days <= 1 ? "Starts tomorrow" : `Starts in ${days} days`),
    chainGoal: (done, total) => `Continue: ${done} of ${total} done`,
    altDone: (name) => `Your ${name} already finished it`,
    stopped: (days) =>
      days >= 14
        ? `You stopped here ${Math.floor(days / 7)} weeks ago`
        : `You stopped here ${days} days ago`,
    endsIn: (days) => `Ends in ${days} day${days === 1 ? "" : "s"}`,
    alts: (count) => `None of your ${count} characters has it yet`,
    achievementGoal: (token) => `Earn ${token} close to where you play.`,
    rareGoal: (name) => `Hunt ${name} near where you play.`,
    farmGoal: (place, token) => `Run ${place} for ${token}.`,
    almostTitle: "Almost there",
    almostGoal: (token) => `Finish ${token}: only a little is left.`,
    almostWhy: (done, total) => `${done} of ${total} done`,
  },
  ru: {
    generic: {
      ach: "достижение",
      mount: "маунт",
      item: "предмет",
      toy: "игрушку",
      pet: "питомца",
      currency: "валюту",
      instance: "подземелье",
      zone: "зону",
    },
    eventGoal: (name, left) =>
      `Идёт «${name}»: осталось ${left} ${ruCount(left, "дело", "дела", "дел")}.`,
    startsSoon: "Скоро начнётся",
    startsIn: (days) => (days <= 1 ? "Начнётся завтра" : `Начнётся через ${days} дн.`),
    chainGoal: (done, total) => `Продолжи: сделано ${done} из ${total}`,
    altDone: (name) => `У ${name} эта цепочка уже пройдена`,
    stopped: (days) =>
      days >= 14
        ? `Цепочка стоит уже ${Math.floor(days / 7)} нед.`
        : `Цепочка стоит уже ${days} дн.`,
    endsIn: (days) => `Закончится через ${days} ${ruCount(days, "день", "дня", "дней")}`,
    alts: (count) => `Нет ни у одного из твоих ${count} персонажей`,
    achievementGoal: (token) => `Получи ${token} рядом с местами, где ты играешь.`,
    rareGoal: (name) => `Поохоться на ${name} рядом с местами, где ты играешь.`,
    farmGoal: (place, token) => `Пройди ${place}: там падает ${token}.`,
    almostTitle: "Почти готово",
    almostGoal: (token) => `Заверши ${token}: осталось совсем немного.`,
    almostWhy: (done, total) => `Сделано ${done} из ${total}`,
  },
};

/** The goal as plain words for the Request wish: labels, or a generic word. */
function plainGoal(text: string, lang: IdeaLang): string {
  const generic = TEXT[lang].generic;
  return text
    .replace(/\{([a-z]+):[^{}|]*(?:\|([^{}]*))?\}/g, (_raw, kind: string, label?: string) =>
      label?.trim() ? label.trim() : (generic[kind] ?? ""),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** The calendar's "YYYY-MM-DD HH:MM" in realm time, read as UTC: off by the realm's offset at most. */
function calendarTime(stamp: unknown): number | undefined {
  if (typeof stamp !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(stamp);
  if (!match) return undefined;
  const [, y, mo, d, h, mi] = match.map(Number);
  return Math.floor(Date.UTC(y!, mo! - 1, d!, h!, mi!) / 1000);
}

function ids(section: SectionRow | undefined, key = "ids"): Set<number> {
  return new Set(section ? unpackIds(section.body[key]) : []);
}

/** Zones of the last three play sessions, most played first. */
function recentMaps(sessions: SectionRow | undefined): number[] {
  const list = Array.isArray(sessions?.body.list) ? (sessions.body.list as unknown[]) : [];
  const minutes = new Map<number, number>();
  for (const session of list.slice(-3)) {
    const maps = (session as { maps?: unknown })?.maps;
    for (const entry of Array.isArray(maps) ? maps : []) {
      const mapID = (entry as { mapID?: unknown })?.mapID;
      const spent = Number((entry as { minutes?: unknown })?.minutes) || 0;
      if (typeof mapID === "number" && Number.isInteger(mapID) && mapID > 0) {
        minutes.set(mapID, (minutes.get(mapID) ?? 0) + spent);
      }
    }
  }
  return [...minutes.entries()].sort((a, b) => b[1] - a[1]).map(([mapID]) => mapID);
}

export type SuggestInput = {
  now: number;
  /** The Character's own Sections and its Account's, by name (data.sectionsFor). */
  sections: Map<string, SectionRow>;
  /** questsDone of every other Character on the Account. */
  altQuests: Set<number>[];
  /** Characters on the Account, this one included. */
  characters: number;
  /** The Character's language (its char Section, else its last Request); English by default. */
  lang?: IdeaLang;
  /** The other Characters by name, with their questsDone, for "Your <Alt> already finished it". */
  alts?: { name: string; quests: Set<number> }[];
  /** questLineID to the time its progress last changed on this Character (D137). */
  chainSince?: Map<number, number>;
  /** A creature's name in the idea's language, from the Blizzard cache (D154). */
  npcName?: (npcID: number) => string | undefined;
  /** Taste bonus per idea kind (D191), -15 to 15. */
  taste?: Map<string, number>;
};

/** An achievement this far along becomes an idea (D187). */
export const ALMOST_DONE_RATIO = 0.8;

type Candidate = Suggestion & { score: number; rule: SuggestionKind; key: string };

function make(
  lang: IdeaLang,
  rule: SuggestionKind,
  id: string,
  score: number,
  fields: Omit<Suggestion, "id" | "kind" | "request" | "rewards"> & { rewards?: string[] },
): Candidate {
  const title = fit(fields.title, SUGGESTION_LIMITS.title, chars);
  const goal = fit(fields.goal, SUGGESTION_LIMITS.goal, bytes);
  const rewards = (fields.rewards ?? []).slice(0, SUGGESTION_LIMITS.rewards);
  const out: Candidate = {
    ...fields,
    id,
    kind: rule,
    title,
    goal,
    rewards,
    request: { topic: "suggestion", suggestionId: id, wish: `${title}: ${plainGoal(goal, lang)}` },
    score,
    rule,
    key: rewards[0] ?? id,
  };
  if (out.why !== undefined) out.why = fit(out.why, SUGGESTION_LIMITS.why, bytes);
  return out;
}

/** Adds the Account angle (rule 5): nobody on the Account has it yet. */
function altBonus(candidate: Candidate, characters: number, lang: IdeaLang): Candidate {
  if (characters < 2) return candidate;
  candidate.score += SCORE.alts;
  candidate.why ??= fit(TEXT[lang].alts(characters), SUGGESTION_LIMITS.why, bytes);
  candidate.reason ??= { kind: "alts", count: characters };
  return candidate;
}

function holidayFor(catalog: Catalog, event: Record<string, unknown>) {
  const title = typeof event.title === "string" ? event.title.trim().toLowerCase() : "";
  return catalog.holidays.find((row) => {
    const match = row.match ?? {};
    if (typeof event.eventID === "number" && match.holidayIDs?.includes(event.eventID)) return true;
    if (typeof event.texture === "number" && match.textures?.includes(event.texture)) return true;
    return title !== "" && (match.titles ?? []).some((name) => name.toLowerCase() === title);
  });
}

export type OpenEvent = {
  holiday: CatalogHoliday;
  name: string;
  starts: number;
  ends: number;
  upcoming: boolean;
  /** Catalog tasks this Character has not done. */
  left: number;
  rewards: string[];
};

/** Catalog events on now or starting within 3 days with something left (D129); Ready now reads the same (D185). */
export function openEvents(
  sections: Map<string, SectionRow>,
  now: number,
  catalog: Catalog = loadCatalog(),
): OpenEvent[] {
  const achievements = ids(sections.get("achievements"));
  for (const id of ids(sections.get("achievementsMine"))) achievements.add(id);
  const mounts = ids(sections.get("mounts"));
  const toys = ids(sections.get("toys"));
  const questsDone = ids(sections.get("questsDone"));
  const faction = sections.get("char")?.body.faction;
  const out: OpenEvent[] = [];
  const events = sections.get("calendar")?.body.events;
  const seenEvents = new Set<string>();
  for (const event of Array.isArray(events) ? (events as Record<string, unknown>[]) : []) {
    const starts = calendarTime(event.starts);
    const ends = calendarTime(event.ends);
    if (starts === undefined || ends === undefined || ends < now || starts > now + SOON) continue;
    const holiday = holidayFor(catalog, event);
    if (!holiday || seenEvents.has(holiday.id)) continue;
    seenEvents.add(holiday.id);
    const rewards: string[] = [];
    let left = 0;
    for (const task of holiday.tasks) {
      if (task.faction && typeof faction === "string" && task.faction !== faction) continue;
      const achievementIDs = task.achievementIDs ?? [];
      if (achievementIDs.length > 0 && !achievementIDs.some((id) => achievements.has(id))) {
        left += 1;
        // A faction pair (two ids) cannot tell which side is yours; only a single id is linked.
        if (achievementIDs.length === 1) rewards.push(`{ach:${achievementIDs[0]}}`);
      }
      if (task.mountID !== undefined && !mounts.has(task.mountID)) {
        left += 1;
        rewards.unshift(`{mount:${task.mountID}}`);
      }
      if (task.toyID !== undefined && !toys.has(task.toyID)) {
        left += 1;
        rewards.push(`{toy:${task.toyID}}`);
      }
      if (task.questID !== undefined && !questsDone.has(task.questID)) left += 1;
    }
    if (left === 0) continue;
    const name =
      (typeof event.title === "string" && event.title.trim()) || holiday.fallbackTitle || "";
    if (!name) continue;
    out.push({
      holiday,
      name,
      starts,
      ends,
      upcoming: starts > now,
      left,
      rewards: [...new Set(rewards)],
    });
  }
  return out;
}

export type OpenChain = {
  questLineID: number;
  done: number;
  total: number;
  title: string;
  nextQuestID?: number;
  mapID?: number;
  flags: string[];
};

/** Unfinished quest chains of this Character (D135); Ready now reads the same (D185). */
export function openChains(sections: Map<string, SectionRow>): OpenChain[] {
  const questsDone = ids(sections.get("questsDone"));
  const out: OpenChain[] = [];
  const lines = sections.get("questLines")?.body.lines;
  for (const line of Array.isArray(lines) ? (lines as Record<string, unknown>[]) : []) {
    const questLineID = Number(line.questLineID);
    const done = Number(line.done);
    const total = Number(line.total);
    const title = typeof line.name === "string" ? line.name.trim() : "";
    if (!Number.isInteger(questLineID) || questLineID <= 0 || !title) continue;
    if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(done) || done >= total)
      continue;
    const nextQuestID = Number.isInteger(line.nextQuestID)
      ? (line.nextQuestID as number)
      : undefined;
    if (nextQuestID !== undefined && questsDone.has(nextQuestID)) continue;
    const mapID =
      Number.isInteger(line.mapID) && (line.mapID as number) > 0
        ? (line.mapID as number)
        : undefined;
    out.push({
      questLineID,
      done,
      total,
      title,
      ...(nextQuestID !== undefined ? { nextQuestID } : {}),
      ...(mapID !== undefined ? { mapID } : {}),
      flags: typeof line.flags === "string" ? line.flags.split("|") : [],
    });
  }
  return out;
}

export type AchievementProgress = {
  id: number;
  d: number;
  t: number;
  ratio: number;
  /** The name from the game (client language), from addons 0.11 on. */
  name?: string;
};

/** `achProgress` rows (D182), not yet earned, best first. */
export function achievementProgress(sections: Map<string, SectionRow>): AchievementProgress[] {
  const earned = ids(sections.get("achievements"));
  for (const id of ids(sections.get("achievementsMine"))) earned.add(id);
  const rows = sections.get("achProgress")?.body.rows;
  const out: AchievementProgress[] = [];
  for (const row of Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []) {
    const id = Number(row?.id);
    const d = Number(row?.d);
    const t = Number(row?.t);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(d) || !Number.isFinite(t)) continue;
    if (t <= 0 || d < 0 || d >= t || earned.has(id)) continue;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 60) : "";
    out.push({ id, d, t, ratio: d / t, ...(name ? { name } : {}) });
  }
  return out.sort((a, b) => b.ratio - a.ratio || a.id - b.id);
}

/** The ranked Suggestions for one Character (D105). */
export function suggest(input: SuggestInput, catalog: Catalog = loadCatalog()): Suggestion[] {
  const { now, sections } = input;
  const lang = input.lang ?? "en";
  const say = TEXT[lang];
  const achievements = ids(sections.get("achievements"));
  for (const id of ids(sections.get("achievementsMine"))) achievements.add(id);
  const mounts = ids(sections.get("mounts"));
  const questsDone = ids(sections.get("questsDone"));
  const zones = recentMaps(sections.get("sessions"));
  const near = new Set(zones);
  const candidates: Candidate[] = [];

  // 1. Events: a catalog event on now or within 3 days, with something left for you (D129, D130).
  for (const event of openEvents(sections, now, catalog)) {
    const { holiday, name, starts, ends, upcoming, left, rewards } = event;
    const days = Math.max(1, Math.ceil(((upcoming ? starts : ends) - now) / DAY));
    const candidate = make(
      lang,
      "event",
      `event:${holiday.id}:${starts}`,
      upcoming ? SCORE.eventStartsSoon : SCORE.event,
      {
        title: name,
        goal: say.eventGoal(name, left),
        why: upcoming ? say.startsIn(days) : say.endsIn(days),
        reason: upcoming ? { kind: "starts", at: starts, count: days } : { kind: "ends", at: ends },
        rewards,
        expiresAt: ends,
      },
    );
    if (!upcoming && ends - now <= SOON) candidate.score += SCORE.eventEndsSoon;
    candidates.push(altBonus(candidate, input.characters, lang));
  }

  // Unfinished quest chains of this Character (D135), and the ones it dropped (D137).
  for (const line of openChains(sections)) {
    const { questLineID, done, total, title, nextQuestID, mapID } = line;
    const flags = line.flags;
    let score = SCORE.chain + (flags.includes("c") ? SCORE.chainCampaign : 0);
    let reason: Suggestion["reason"];
    let why: string | undefined;
    const since = input.chainSince?.get(questLineID);
    const stoppedDays = since === undefined ? 0 : Math.floor((now - since) / DAY);
    const finisher =
      flags.includes("a") && nextQuestID !== undefined
        ? input.alts?.find((alt) => alt.quests.has(nextQuestID))
        : undefined;
    if (since !== undefined && now - since >= STOPPED_AFTER) {
      score += SCORE.chainStopped;
      reason = { kind: "stopped", at: since };
      why = say.stopped(stoppedDays);
    } else if (finisher) {
      reason = { kind: "altDone", name: finisher.name.slice(0, 60) };
      why = say.altDone(finisher.name);
    }
    candidates.push(
      make(lang, "chain", `chain:${questLineID}`, score, {
        title,
        goal: say.chainGoal(done, total),
        ...(why !== undefined ? { why } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(mapID !== undefined ? { mapID } : {}),
        chain: {
          questLineID,
          ...(nextQuestID !== undefined ? { nextQuestID } : {}),
          done,
          total,
        },
      }),
    );
  }

  // Almost done achievements from achProgress (D187); they replace a catalog idea for the same id.
  const catalogAchievements = new Map(
    [...catalog.achievements, ...catalog.exploration].map((row) => [row.achievementID, row]),
  );
  const almost = new Set<number>();
  for (const row of achievementProgress(sections)) {
    if (row.ratio < ALMOST_DONE_RATIO) continue;
    almost.add(row.id);
    const token = `{ach:${row.id}}`;
    const known = catalogAchievements.get(row.id);
    candidates.push(
      make(lang, "achievement", `ach:${row.id}`, SCORE.almostDone, {
        title: known?.fallbackTitle ?? say.almostTitle,
        titleToken: token,
        goal: say.almostGoal(
          lang === "en" && known ? `{ach:${row.id}|${known.fallbackTitle}}` : token,
        ),
        why: say.almostWhy(row.d, row.t),
        rewards: [token],
        ...(known?.mapID !== undefined ? { mapID: known.mapID } : {}),
      }),
    );
  }

  // 2. Achievements tied to a zone the player has been playing in.
  for (const row of [...catalog.achievements, ...catalog.exploration]) {
    if (row.mapID === undefined || !near.has(row.mapID) || achievements.has(row.achievementID)) {
      continue;
    }
    if (almost.has(row.achievementID)) continue;
    const token = `{ach:${row.achievementID}}`;
    candidates.push(
      altBonus(
        make(lang, "achievement", `ach:${row.achievementID}`, SCORE.achievement, {
          title: row.fallbackTitle,
          titleToken: token,
          // The catalog name is English: a Russian goal lets the game name it.
          goal: say.achievementGoal(
            lang === "en" ? `{ach:${row.achievementID}|${row.fallbackTitle}}` : token,
          ),
          reason: { kind: "near", mapID: row.mapID },
          rewards: [token],
          mapID: row.mapID,
        }),
        input.characters,
        lang,
      ),
    );
  }

  // 3. Rares and treasures not looted here, in a recent zone. The name comes from the
  // Blizzard creature cache in the idea's language, else the catalog's English (D154, D155).
  for (const row of catalog.rares) {
    if (row.questID === undefined || row.mapID === undefined || !near.has(row.mapID)) continue;
    if (questsDone.has(row.questID)) continue;
    const name = (row.npcID !== undefined && input.npcName?.(row.npcID)) || row.fallbackTitle;
    const label = name.replace(/[{}|]/g, "").slice(0, 80);
    let candidate = make(lang, "rare", `rare:${row.id}`, SCORE.rare, {
      title: name,
      goal: say.rareGoal(row.npcID !== undefined ? `{npc:${row.npcID}|${label}}` : name),
      reason: { kind: "near", mapID: row.mapID },
      mapID: row.mapID,
    });
    if (input.altQuests.every((done) => !done.has(row.questID!))) {
      candidate = altBonus(candidate, input.characters, lang);
    }
    candidates.push(candidate);
  }

  // 4. Mounts from the catalog nobody on the Account has, nearby ones first.
  const farms = [...catalog.farm].sort(
    (a, b) => Number(near.has(b.mapID ?? -1)) - Number(near.has(a.mapID ?? -1)),
  );
  for (const row of farms) {
    const missing = (row.mounts ?? []).filter((id) => !mounts.has(id));
    if (missing.length === 0) continue;
    const token = `{mount:${missing[0]}}`;
    const place =
      row.instanceID === undefined
        ? row.fallbackTitle
        : `{instance:${row.instanceID}|${row.fallbackTitle}}`;
    candidates.push(
      altBonus(
        make(
          lang,
          "collection",
          `mount:${missing[0]}`,
          SCORE.collection + (near.has(row.mapID ?? -1) ? 1 : 0),
          {
            title: row.fallbackTitle,
            ...(row.instanceID !== undefined ? { titleToken: `{instance:${row.instanceID}}` } : {}),
            goal: say.farmGoal(place, token),
            rewards: missing.slice(0, SUGGESTION_LIMITS.rewards).map((id) => `{mount:${id}}`),
            ...(row.mapID !== undefined ? { mapID: row.mapID } : {}),
          },
        ),
        input.characters,
        lang,
      ),
    );
  }

  // Taste (D191) nudges each kind by at most 15 before the per-rule cut.
  for (const candidate of candidates) candidate.score += input.taste?.get(candidate.rule) ?? 0;
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const perRule = new Map<SuggestionKind, number>();
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const candidate of candidates) {
    if (out.length >= SUGGESTION_LIMITS.perCharacter) break;
    const used = perRule.get(candidate.rule) ?? 0;
    if (used >= SUGGESTION_LIMITS.perRule || seen.has(candidate.key)) continue;
    perRule.set(candidate.rule, used + 1);
    seen.add(candidate.key);
    const { score: _score, rule: _rule, key: _key, ...suggestion } = candidate;
    out.push(suggestion);
  }
  return out;
}

export const SUGGEST_DEBOUNCE_MS = 30_000;

/** Creature names per locale, filled from the Blizzard Game Data API (blizzard.ts). */
export type NameLookup = {
  /** The known names of these creatures in one locale. */
  many(npcIDs: number[], locale: string): Promise<Map<number, string>>;
  /** Fetches the names not cached yet; resolves when done or off. */
  warm?(npcIDs: number[], locales: string[]): Promise<void>;
};

export const LOCALE_FOR: Record<IdeaLang, string> = { en: "en_US", ru: "ru_RU" };

type ChainRow = { quest_line_id: number; done: number; changed_at: number };

/**
 * Suggestions and chain progress (ADR 0057), in the Store's database: SQLite
 * by default, Postgres with DATABASE_URL. Same database as everything else, so
 * Forget erases them in its own transaction.
 */
export class SuggestionTables {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    if (db instanceof SqliteDb) {
      db.raw.exec(`
      CREATE TABLE IF NOT EXISTS chain_progress (
        character_id TEXT NOT NULL,
        quest_line_id INTEGER NOT NULL,
        done INTEGER NOT NULL,
        changed_at INTEGER NOT NULL,
        PRIMARY KEY (character_id, quest_line_id)
      );
      CREATE TABLE IF NOT EXISTS suggestions (
        owner_id TEXT NOT NULL,
        character_id TEXT PRIMARY KEY,
        computed_at INTEGER NOT NULL,
        body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS suggestions_owner ON suggestions (owner_id);
    `);
    }
  }

  async chains(characterId: string) {
    const rows = await this.db.all<ChainRow>(
      `SELECT quest_line_id, done, changed_at FROM chain_progress WHERE character_id = ?`,
      characterId,
    );
    return new Map(
      rows.map((row) => [row.quest_line_id, { done: row.done, changedAt: row.changed_at }]),
    );
  }

  async putChain(characterId: string, questLineId: number, done: number, at: number) {
    await this.db.run(
      `INSERT INTO chain_progress (character_id, quest_line_id, done, changed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (character_id, quest_line_id) DO UPDATE SET done = excluded.done,
         changed_at = excluded.changed_at`,
      characterId,
      questLineId,
      done,
      at,
    );
  }

  async save(ownerId: string, characterId: string, computedAt: number, list: Suggestion[]) {
    const body = this.db.body;
    await this.db.run(
      `INSERT INTO suggestions (owner_id, character_id, computed_at, ${body}) VALUES (?, ?, ?, ?)
       ON CONFLICT (character_id) DO UPDATE SET owner_id = excluded.owner_id,
         computed_at = excluded.computed_at, ${body} = excluded.${body}`,
      ownerId,
      characterId,
      computedAt,
      JSON.stringify(list),
    );
  }

  async read(characterId: string) {
    const stored = await this.db.get<{ computed_at: number; body: unknown }>(
      `SELECT computed_at, ${this.db.body} AS body FROM suggestions WHERE character_id = ?`,
      characterId,
    );
    return stored
      ? { computedAt: stored.computed_at, list: fromJson<Suggestion[]>(stored.body) ?? [] }
      : undefined;
  }

  async deleteOwner(ownerId: string) {
    return this.db.run(`DELETE FROM suggestions WHERE owner_id = ?`, ownerId);
  }

  async renameOwner(from: string, to: string) {
    await this.db.run(`UPDATE suggestions SET owner_id = ? WHERE owner_id = ?`, to, from);
  }
}

/** Cached Suggestions per Character, recomputed after uploads (debounced per Account). */
export class SuggestionStore {
  private db: Db;
  private data: DataStore;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly tables: SuggestionTables;
  names: NameLookup | undefined;

  /** `db` is the Store's database: Requests and progress for the taste bonus and the last Request's language. */
  constructor(db: Db, data: DataStore, names?: NameLookup) {
    this.db = db;
    this.data = data;
    this.names = names;
    this.tables = new SuggestionTables(db);
  }

  /** After a snapshot: recompute the Account once uploads have settled for 30 s. */
  schedule(account: string, delayMs = SUGGEST_DEBOUNCE_MS): void {
    const pending = this.timers.get(account);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      this.timers.delete(account);
      const npcIDs = loadCatalog()
        .rares.map((row) => row.npcID)
        .filter((id): id is number => id !== undefined);
      const warm = this.names?.warm?.(npcIDs, Object.values(LOCALE_FOR)) ?? Promise.resolve();
      void warm
        .catch(() => undefined)
        .then(() => this.computeAccount(account))
        // A bad Section must not take the Server down; the next upload tries again.
        .catch(() => undefined);
    }, delayMs);
    timer.unref?.();
    this.timers.set(account, timer);
  }

  pending(account: string): boolean {
    return this.timers.has(account);
  }

  close(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  async computeAccount(account: string, now = Math.floor(Date.now() / 1000)): Promise<number> {
    const characters = await this.data.characters(account);
    const quests = new Map<string, Set<number>>();
    for (const row of characters) {
      quests.set(row.id, ids(await this.data.section("char", row.id, "questsDone")));
    }
    const taste = await this.taste(account, characters, now);
    const rares = loadCatalog()
      .rares.map((row) => row.npcID)
      .filter((id): id is number => id !== undefined);
    const names = new Map<IdeaLang, Promise<Map<number, string>>>();
    const namesIn = (lang: IdeaLang) => {
      if (!names.has(lang)) {
        names.set(lang, this.names?.many(rares, LOCALE_FOR[lang]) ?? Promise.resolve(new Map()));
      }
      return names.get(lang)!;
    };
    for (const row of characters) {
      const sections = await this.data.sectionsFor(row);
      const lang =
        ideaLang(sections.get("char")?.body.lang) ?? (await this.lastRequestLang(row)) ?? "en";
      const others = characters.filter((other) => other.id !== row.id);
      const chainSince = await this.chainSince(row.id, sections.get("questLines")?.body.lines, now);
      const npcNames = await namesIn(lang);
      const list = suggest({
        now,
        sections,
        lang,
        altQuests: others.map((other) => quests.get(other.id)!),
        alts: others.map((other) => ({ name: other.name, quests: quests.get(other.id)! })),
        characters: characters.length,
        chainSince,
        npcName: (npcID) => npcNames.get(npcID),
        taste,
      });
      await this.tables.save(row.accountId, row.id, now, list);
    }
    return characters.length;
  }

  /**
   * When each chain last moved on this Character: a new done count restarts the
   * clock, so a chain untouched for 14 days reads as dropped (D137).
   */
  private async chainSince(
    characterId: string,
    lines: unknown,
    now: number,
  ): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (!Array.isArray(lines)) return out;
    const stored = await this.tables.chains(characterId);
    for (const line of lines as Record<string, unknown>[]) {
      const id = Number(line?.questLineID);
      const done = Number(line?.done);
      if (!Number.isInteger(id) || !Number.isInteger(done)) continue;
      const known = stored.get(id);
      if (!known || known.done !== done) {
        await this.tables.putChain(characterId, id, done, now);
        stored.set(id, { done, changedAt: now });
        out.set(id, now);
      } else {
        out.set(id, known.changedAt);
      }
    }
    return out;
  }

  /** Taste bonus per category (D191); none when the Request tables are not there. */
  private async taste(
    account: string,
    characters: CharacterRow[],
    now: number,
  ): Promise<Map<string, number>> {
    try {
      return tasteMap(await computeTaste(this.db, account, characters, now));
    } catch {
      return new Map();
    }
  }

  /** The language of the Character's last Request, when the char Section does not say. */
  private async lastRequestLang(row: CharacterRow): Promise<IdeaLang | undefined> {
    try {
      const found = await this.db.get<{ lang: string }>(
        `SELECT lang FROM requests WHERE character_name = ? AND realm = ? AND lang IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        row.name,
        row.realm,
      );
      return ideaLang(found?.lang);
    } catch {
      return undefined;
    }
  }

  async forCharacter(row: CharacterRow, now = Math.floor(Date.now() / 1000)) {
    const stored = await this.tables.read(row.id);
    if (!stored) return undefined;
    const list = stored.list.filter((item) => item.expiresAt === undefined || item.expiresAt > now);
    return { character: row.name, realm: row.realm, computedAt: stored.computedAt, list };
  }

  /** `{ v = 1, computedAt, characters = { ["Realm-Name"] = list } }` (D106). */
  async body(rows: CharacterRow[], now = Math.floor(Date.now() / 1000)): Promise<SuggestionsBody> {
    const characters: Record<string, Suggestion[]> = {};
    let computedAt = 0;
    for (const row of rows) {
      const entry = await this.forCharacter(row, now);
      if (!entry) continue;
      characters[`${row.realm}-${row.name}`] = entry.list;
      computedAt = Math.max(computedAt, entry.computedAt);
    }
    return { v: 1, computedAt, characters };
  }
}
