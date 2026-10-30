import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import {
  unpackIds,
  type Suggestion,
  type SuggestionKind,
  type SuggestionsBody,
} from "@unbored/contracts";

import type { CharacterRow, DataStore, SectionRow } from "./data.ts";

export type { Suggestion, SuggestionKind, SuggestionsBody };

/**
 * Suggestions (docs/adr/0040): ideas for the choice Bubble, made from the
 * player's own data and the addon's curated catalog only. No LLM, no guessed
 * ids: every id here is a catalog row or comes from the player's Sections.
 */

export type CharacterSuggestions = { character: string; realm: string; list: Suggestion[] };

export const SUGGESTION_LIMITS = {
  perCharacter: 6,
  perRule: 2,
  title: 40,
  goal: 140,
  why: 100,
  rewards: 3,
} as const;

const DAY = 86_400;
const SOON = 3 * DAY;
const SCORE = {
  event: 100,
  eventEndsSoon: 20,
  achievement: 60,
  rare: 50,
  collection: 40,
  alts: 10,
};

type CatalogTask = {
  id: string;
  fallbackTitle?: string;
  achievementIDs?: number[];
  mountID?: number;
  faction?: string;
};
type CatalogHoliday = {
  holidayID?: number;
  holidayIDs?: number[];
  fallbackTitle?: string;
  titles?: string[];
  tasks: CatalogTask[];
};
type CatalogAchievement = {
  id?: string;
  achievementID: number;
  fallbackTitle: string;
  mapID?: number;
};
type CatalogRare = { id: string; fallbackTitle: string; mapID?: number; questID?: number };
type CatalogFarm = { id: string; fallbackTitle: string; mapID?: number; mounts?: number[] };

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

const GENERIC: Record<string, string> = {
  ach: "an achievement",
  mount: "a mount",
  item: "an item",
  toy: "a toy",
  pet: "a pet",
  currency: "a currency",
};

/** The goal as plain words for the Request wish: labels, or a generic word. */
function plainGoal(text: string): string {
  return text
    .replace(/\{([a-z]+):[^{}|]*(?:\|([^{}]*))?\}/g, (_raw, kind: string, label?: string) =>
      label?.trim() ? label.trim() : (GENERIC[kind] ?? ""),
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
};

type Candidate = Suggestion & { score: number; rule: SuggestionKind; key: string };

function make(
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
    request: { topic: "suggestion", suggestionId: id, wish: `${title}: ${plainGoal(goal)}` },
    score,
    rule,
    key: rewards[0] ?? id,
  };
  if (out.why !== undefined) out.why = fit(out.why, SUGGESTION_LIMITS.why, bytes);
  return out;
}

/** Adds the Account angle (rule 5): nobody on the Account has it yet. */
function altBonus(candidate: Candidate, characters: number): Candidate {
  if (characters < 2) return candidate;
  candidate.score += SCORE.alts;
  candidate.why ??= `None of your ${characters} characters has it yet`;
  candidate.reason ??= { kind: "alts", count: characters };
  return candidate;
}

function holidayFor(catalog: Catalog, event: { eventID?: unknown; title?: unknown }) {
  const title = typeof event.title === "string" ? event.title.trim().toLowerCase() : "";
  return catalog.holidays.find((row) => {
    const keys = [row.holidayID, ...(row.holidayIDs ?? [])].filter((id) => id !== undefined);
    if (typeof event.eventID === "number" && keys.includes(event.eventID)) return true;
    const names = [row.fallbackTitle, ...(row.titles ?? [])].map((name) => name?.toLowerCase());
    return title !== "" && names.includes(title);
  });
}

/** The ranked Suggestions for one Character (D105). */
export function suggest(input: SuggestInput, catalog: Catalog = loadCatalog()): Suggestion[] {
  const { now, sections } = input;
  const achievements = ids(sections.get("achievements"));
  for (const id of ids(sections.get("achievementsMine"))) achievements.add(id);
  const mounts = ids(sections.get("mounts"));
  const questsDone = ids(sections.get("questsDone"));
  const faction = sections.get("char")?.body.faction;
  const zones = recentMaps(sections.get("sessions"));
  const near = new Set(zones);
  const candidates: Candidate[] = [];

  // 1. Events: a known holiday on now or within 3 days, with something left to get.
  const events = sections.get("calendar")?.body.events;
  for (const event of Array.isArray(events) ? (events as Record<string, unknown>[]) : []) {
    const starts = calendarTime(event.starts);
    const ends = calendarTime(event.ends);
    if (starts === undefined || ends === undefined || ends < now || starts > now + SOON) continue;
    const holiday = holidayFor(catalog, event);
    if (!holiday) continue;
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
    }
    if (left === 0) continue;
    const name =
      (typeof event.title === "string" && event.title.trim()) || holiday.fallbackTitle || "";
    if (!name) continue;
    const key = String(holiday.holidayID ?? holiday.holidayIDs?.[0] ?? name);
    const days = Math.max(1, Math.ceil((ends - now) / DAY));
    const candidate = make("event", `event:${key}:${starts}`, SCORE.event, {
      title: name,
      goal: `${name} is on: ${left} thing${left === 1 ? "" : "s"} you have not done yet.`,
      why: starts > now ? "Starts soon" : `Ends in ${days} day${days === 1 ? "" : "s"}`,
      reason: { kind: "ends", at: ends },
      rewards,
      expiresAt: ends,
    });
    if (ends - now <= SOON) candidate.score += SCORE.eventEndsSoon;
    candidates.push(altBonus(candidate, input.characters));
  }

  // 2. Achievements tied to a zone the player has been playing in.
  for (const row of [...catalog.achievements, ...catalog.exploration]) {
    if (row.mapID === undefined || !near.has(row.mapID) || achievements.has(row.achievementID)) {
      continue;
    }
    const token = `{ach:${row.achievementID}}`;
    candidates.push(
      altBonus(
        make("achievement", `ach:${row.achievementID}`, SCORE.achievement, {
          title: row.fallbackTitle,
          titleToken: token,
          goal: `Earn {ach:${row.achievementID}|${row.fallbackTitle}} close to where you play.`,
          reason: { kind: "near", mapID: row.mapID },
          rewards: [token],
          mapID: row.mapID,
        }),
        input.characters,
      ),
    );
  }

  // 3. Rares and treasures not looted here, in a recent zone.
  for (const row of catalog.rares) {
    if (row.questID === undefined || row.mapID === undefined || !near.has(row.mapID)) continue;
    if (questsDone.has(row.questID)) continue;
    let candidate = make("rare", `rare:${row.id}`, SCORE.rare, {
      title: row.fallbackTitle,
      goal: `Hunt ${row.fallbackTitle} near where you play.`,
      reason: { kind: "near", mapID: row.mapID },
      mapID: row.mapID,
    });
    if (input.altQuests.every((done) => !done.has(row.questID!))) {
      candidate = altBonus(candidate, input.characters);
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
    candidates.push(
      altBonus(
        make(
          "collection",
          `mount:${missing[0]}`,
          SCORE.collection + (near.has(row.mapID ?? -1) ? 1 : 0),
          {
            title: row.fallbackTitle,
            goal: `Run ${row.fallbackTitle} for ${token}.`,
            rewards: missing.slice(0, SUGGESTION_LIMITS.rewards).map((id) => `{mount:${id}}`),
            ...(row.mapID !== undefined ? { mapID: row.mapID } : {}),
          },
        ),
        input.characters,
      ),
    );
  }

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

/** Cached Suggestions per Character, recomputed after uploads (debounced per Account). */
export class SuggestionStore {
  private db: DatabaseSync;
  private data: DataStore;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(db: DatabaseSync, data: DataStore) {
    this.db = db;
    this.data = data;
    db.exec(`
      CREATE TABLE IF NOT EXISTS suggestions (
        owner_id TEXT NOT NULL,
        character_id TEXT PRIMARY KEY,
        computed_at INTEGER NOT NULL,
        body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS suggestions_owner ON suggestions (owner_id);
    `);
  }

  /** After a snapshot: recompute the Account once uploads have settled for 30 s. */
  schedule(account: string, delayMs = SUGGEST_DEBOUNCE_MS): void {
    const pending = this.timers.get(account);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      this.timers.delete(account);
      try {
        this.computeAccount(account);
      } catch {
        // A bad Section must not take the Server down; the next upload tries again.
      }
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

  computeAccount(account: string, now = Math.floor(Date.now() / 1000)): number {
    const characters = this.data.characters(account);
    const quests = new Map(
      characters.map((row) => [row.id, ids(this.data.section("char", row.id, "questsDone"))]),
    );
    const save = this.db.prepare(
      `INSERT INTO suggestions (owner_id, character_id, computed_at, body_json) VALUES (?, ?, ?, ?)
       ON CONFLICT (character_id) DO UPDATE SET owner_id = excluded.owner_id,
         computed_at = excluded.computed_at, body_json = excluded.body_json`,
    );
    for (const row of characters) {
      const list = suggest({
        now,
        sections: this.data.sectionsFor(row),
        altQuests: characters
          .filter((other) => other.id !== row.id)
          .map((other) => quests.get(other.id)!),
        characters: characters.length,
      });
      save.run(row.accountId, row.id, now, JSON.stringify(list));
    }
    return characters.length;
  }

  forCharacter(row: CharacterRow, now = Math.floor(Date.now() / 1000)) {
    const stored = this.db
      .prepare(`SELECT computed_at, body_json FROM suggestions WHERE character_id = ?`)
      .get(row.id) as { computed_at: number; body_json: string } | undefined;
    if (!stored) return undefined;
    const list = (JSON.parse(stored.body_json) as Suggestion[]).filter(
      (item) => item.expiresAt === undefined || item.expiresAt > now,
    );
    return { character: row.name, realm: row.realm, computedAt: stored.computed_at, list };
  }

  /** `{ v = 1, computedAt, characters = { ["Realm-Name"] = list } }` (D106). */
  body(rows: CharacterRow[], now = Math.floor(Date.now() / 1000)): SuggestionsBody {
    const characters: Record<string, Suggestion[]> = {};
    let computedAt = 0;
    for (const row of rows) {
      const entry = this.forCharacter(row, now);
      if (!entry) continue;
      characters[`${row.realm}-${row.name}`] = entry.list;
      computedAt = Math.max(computedAt, entry.computedAt);
    }
    return { v: 1, computedAt, characters };
  }
}
