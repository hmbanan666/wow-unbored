import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  isPackedIdSet,
  PACKED_VALUES_TAG,
  sectionHash,
  snapshotBodySchema,
  unpackIds,
  unpackRows,
  type SectionScope,
} from "@unbored/contracts";

import { fromJson, SqliteDb, type Db } from "./db.ts";
import { buildHoldings, WARBAND_PLACE, type Holdings, type HoldingsPlace } from "./holdings.ts";
import { PlanError } from "./plan.ts";

// docs/adr/0029: the Companion posts only the Sections that changed; the
// Server keeps the latest body per Section and a dated diff for each change.
export const SNAPSHOT_MAX_COMPRESSED = 4 * 1024 * 1024;
export const SNAPSHOT_MAX_INFLATED = 32 * 1024 * 1024;
const SECTION_MAX_BYTES = 2 * 1024 * 1024;
/** Lists in a diff or an expanded body are capped so one answer stays small. */
export const ID_LIST_CAP = 2000;
const FIELD_DIFF_MAX = 2048;

/** Sections the 0.7 addon writes, with the newest body version this Server knows. */
export const KNOWN_SECTIONS: Record<string, { scope: SectionScope; v: number }> = {
  char: { scope: "char", v: 1 },
  gear: { scope: "char", v: 1 },
  talents: { scope: "char", v: 1 },
  played: { scope: "char", v: 1 },
  bags: { scope: "char", v: 1 },
  bank: { scope: "char", v: 1 },
  reagentBank: { scope: "char", v: 1 },
  warband: { scope: "account", v: 1 },
  currencies: { scope: "char", v: 1 },
  professions: { scope: "char", v: 1 },
  recipes: { scope: "char", v: 1 },
  questsDone: { scope: "char", v: 1 },
  questLog: { scope: "char", v: 1 },
  questLines: { scope: "char", v: 1 },
  /** v2 adds renown `next` rewards and `max`, and `paragon` (D181); v1 bodies still read. */
  reputation: { scope: "char", v: 2 },
  achievements: { scope: "account", v: 1 },
  achievementsMine: { scope: "char", v: 1 },
  /** Incomplete achievements at least half done (D182). */
  achProgress: { scope: "char", v: 1 },
  mounts: { scope: "account", v: 1 },
  pets: { scope: "account", v: 1 },
  toys: { scope: "account", v: 1 },
  transmog: { scope: "account", v: 1 },
  lockouts: { scope: "char", v: 1 },
  mplus: { scope: "char", v: 1 },
  vault: { scope: "char", v: 1 },
  calendar: { scope: "account", v: 2 },
  sessions: { scope: "char", v: 1 },
  addons: { scope: "account", v: 1 },
  unresolvedIds: { scope: "char", v: 1 },
  /** Where the addon broke (ADR 0051); only exists after something did. */
  errors: { scope: "account", v: 1 },
  /** A 0.6 `POST /v1/profile` upload, kept whole. */
  profile: { scope: "char", v: 1 },
};

/**
 * Sections a Character or Account should have (D171). Not expected: `errors`
 * (only exists after something broke), the 0.6 `profile`, and `reagentBank`:
 * retail folded the reagent bank into the bank tabs (11.2), so most clients
 * never write it. Old bodies are still read for holdings and wins.
 */
const NOT_EXPECTED = new Set(["errors", "profile", "reagentBank"]);
/** Read only while a window is open, with the hint the owner sees (D171). */
const WINDOW_SECTIONS: Record<string, string> = {
  bank: "open the bank",
  warband: "open the warband bank",
  recipes: "open a profession",
};
/** Written even with data sharing off (addon `S.ESSENTIAL`). */
const ESSENTIAL_SECTIONS = new Set(["char", "gear", "questLog", "sessions"]);

export type MissingReason = "window" | "dropped" | "sharing" | "never";
export type MissingSection = {
  section: string;
  scope: SectionScope;
  reason: MissingReason;
  hint?: string;
};

export function expectedSections(scope: SectionScope): string[] {
  return Object.entries(KNOWN_SECTIONS)
    .filter(([name, known]) => known.scope === scope && !NOT_EXPECTED.has(name))
    .map(([name]) => name);
}

/** A stored Section's change, for wins (D196). */
export type SectionChange = {
  section: string;
  scope: SectionScope;
  ownerId: string;
  at: number;
  kind: "full" | "diff";
  body: unknown;
  /** True when the body version changed: never a win. */
  versionChanged: boolean;
};

export const ERRORS_LIST_MAX = 200;

export type AddonErrorRow = {
  hash: string;
  account: string;
  deviceId: string | null;
  character: string;
  realm: string;
  version: string;
  where: string;
  text: string;
  stack: string;
  count: number;
  firstAt: number;
  lastAt: number;
  seenAt: number;
};

export type IdKind = "quest" | "achievement" | "mount" | "toy" | "pet" | "recipe";
export const ID_KINDS: IdKind[] = ["quest", "achievement", "mount", "toy", "pet", "recipe"];

export type SectionRow = {
  ownerKind: SectionScope;
  ownerId: string;
  section: string;
  v: number;
  hash: string;
  at: number | null;
  savedAt: number | null;
  updatedAt: number;
  src: string | null;
  unknown: boolean;
  bytes: number;
  body: Record<string, unknown>;
};

export const MAX_DIGEST_ALTS = 50;

export type DigestAlt = {
  name: string;
  realm: string;
  faction?: string;
  seenAt: number;
  professions: { skillLine: number | null; name: string | null; skill: number | null }[];
};

export type CharacterRow = {
  id: string;
  accountId: string;
  name: string;
  realm: string;
  class: string | null;
  level: number | null;
  lastSeen: number;
  savedAt: number | null;
  dropped: Record<string, unknown> | null;
  deviceId: string | null;
};

export type AccountRow = {
  id: string;
  label: string;
  firstSeen: number;
  lastSeen: number;
  dropped: Record<string, unknown> | null;
};

export type HistoryRow = {
  id: number;
  ownerKind: SectionScope;
  ownerId: string;
  section: string;
  at: number;
  savedAt: number | null;
  hash: string;
  kind: "full" | "diff";
  body: unknown;
};

export type SnapshotResult = {
  account: string;
  character: string;
  realm: string;
  stored: string[];
  unchanged: string[];
  unknown: string[];
  stale: boolean;
};

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The part of a WoW account folder ("12345678#1") shared by every license of one Battle.net account. */
export function accountId(account: string): string {
  return account.trim().split("#")[0] ?? "";
}

export function characterId(name: string, realm: string): string {
  return `${realm}/${name}`;
}

/** Every Packed id set in a body, by dotted path (`ids`, `byProfession.171.learned`). */
export function packedSets(body: unknown, prefix = "", depth = 0): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!isObject(body) || depth > 3) return out;
  for (const [key, value] of Object.entries(body)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPackedIdSet(value)) out.set(path, value);
    else if (isObject(value)) {
      for (const [inner, set] of packedSets(value, path, depth + 1)) out.set(inner, set);
    }
  }
  return out;
}

function capped<T>(list: T[]): { list: T[]; more: number } {
  return list.length > ID_LIST_CAP
    ? { list: list.slice(0, ID_LIST_CAP), more: list.length - ID_LIST_CAP }
    : { list, more: 0 };
}

function setDiff(before: string[] | undefined, after: string[] | undefined): Raw | null {
  const tagged = (after ?? before)?.[0];
  const old = new Map(unpackRows(before).map((row) => [row.id, row.values]));
  const fresh = new Map(unpackRows(after).map((row) => [row.id, row.values]));
  const added: unknown[] = [];
  const removed: number[] = [];
  const changed: unknown[] = [];
  for (const [id, values] of fresh) {
    const was = old.get(id);
    if (!was) added.push(tagged === PACKED_VALUES_TAG ? [id, ...values] : id);
    else if (was.join(":") !== values.join(":")) changed.push([id, was, values]);
  }
  for (const id of old.keys()) if (!fresh.has(id)) removed.push(id);
  if (added.length === 0 && removed.length === 0 && changed.length === 0) return null;
  const out: Raw = {};
  for (const [name, list] of [
    ["added", added],
    ["removed", removed],
    ["changed", changed],
  ] as const) {
    if (list.length === 0) continue;
    const cut = capped<unknown>(list);
    out[name] = cut.list;
    if (cut.more) out[`${name}More`] = cut.more;
  }
  return out;
}

function withoutPacked(body: unknown, prefix = "", depth = 0): unknown {
  if (!isObject(body) || depth > 3) return body;
  const out: Raw = {};
  for (const [key, value] of Object.entries(body)) {
    if (isPackedIdSet(value)) continue;
    out[key] = isObject(value) ? withoutPacked(value, key, depth + 1) : value;
  }
  return out;
}

/**
 * What changed in one Section. Sections with Packed id sets get a diff of
 * ids (and of values for `idv1`, such as item counts) plus the small fields
 * that changed; other Sections are stored whole (D57).
 */
export function sectionChange(
  before: Raw | null,
  after: Raw,
): { kind: "full" | "diff"; body: unknown } {
  const sets = packedSets(after);
  const oldSets = before ? packedSets(before) : new Map<string, string[]>();
  if (sets.size === 0 && oldSets.size === 0) return { kind: "full", body: after };
  if (!before) {
    const counts: Raw = {};
    for (const [path, set] of sets) counts[path] = unpackRows(set).length;
    return { kind: "diff", body: { initial: true, counts } };
  }
  const ids: Raw = {};
  for (const path of new Set([...sets.keys(), ...oldSets.keys()])) {
    const diff = setDiff(oldSets.get(path), sets.get(path));
    if (diff) ids[path] = diff;
  }
  const fields: Raw = {};
  const plainOld = withoutPacked(before) as Raw;
  const plainNew = withoutPacked(after) as Raw;
  for (const key of new Set([...Object.keys(plainOld), ...Object.keys(plainNew)])) {
    const was = JSON.stringify(plainOld[key] ?? null);
    const now = JSON.stringify(plainNew[key] ?? null);
    if (was === now) continue;
    fields[key] =
      was.length + now.length > FIELD_DIFF_MAX
        ? { changed: true }
        : [plainOld[key] ?? null, plainNew[key] ?? null];
  }
  return { kind: "diff", body: { ids, fields } };
}

/** A short line per change for data_catalog and history: "+3 ids", "fields: money". */
export function changeSummary(kind: string, body: unknown): Raw {
  if (kind === "full" || !isObject(body)) return { kind };
  if (body.initial) return { kind, initial: true, counts: body.counts };
  const ids = isObject(body.ids) ? body.ids : {};
  const out: Raw = { kind };
  const sets: Raw = {};
  for (const [path, diff] of Object.entries(ids)) {
    if (!isObject(diff)) continue;
    const count = (name: string) =>
      (Array.isArray(diff[name]) ? (diff[name] as unknown[]).length : 0) +
      (typeof diff[`${name}More`] === "number" ? (diff[`${name}More`] as number) : 0);
    sets[path] = { added: count("added"), removed: count("removed"), changed: count("changed") };
  }
  if (Object.keys(sets).length) out.ids = sets;
  const fields = isObject(body.fields) ? Object.keys(body.fields) : [];
  if (fields.length) out.fields = fields;
  return out;
}

/** Packed id sets become counts, or capped id lists with `expand`. */
export function readable(body: unknown, expand: boolean, depth = 0): unknown {
  if (isPackedIdSet(body)) {
    const rows = unpackRows(body);
    if (!expand) return { packed: body[0], count: rows.length };
    const valued = body[0] === PACKED_VALUES_TAG;
    const cut = capped(rows);
    return {
      count: rows.length,
      ...(valued
        ? { rows: cut.list.map((row) => [row.id, ...row.values]) }
        : { ids: cut.list.map((row) => row.id) }),
      ...(cut.more ? { more: cut.more } : {}),
    };
  }
  if (Array.isArray(body)) return body.map((item) => readable(item, expand, depth + 1));
  if (!isObject(body) || depth > 6) return body;
  const out: Raw = {};
  for (const [key, value] of Object.entries(body)) out[key] = readable(value, expand, depth + 1);
  return out;
}

function cleanName(value: unknown, field: string, required: boolean): string {
  if (typeof value !== "string" || !value.trim()) {
    if (required) throw new PlanError(`${field} is required.`);
    return "";
  }
  const trimmed = value.trim();
  if (Buffer.byteLength(trimmed) > 80) throw new PlanError(`${field} is too long.`);
  return trimmed;
}

export type CleanSnapshot = {
  account: string;
  character: string;
  realm: string;
  savedAt: number | null;
  sections: {
    name: string;
    scope: SectionScope;
    v: number;
    at: number | null;
    src: string | null;
    hash: string;
    body: Raw;
    bytes: number;
    unknown: boolean;
  }[];
  dropped: Partial<Record<SectionScope, Raw>>;
};

/** Structural checks only; unknown Sections and newer versions are kept (D63). */
export function cleanSnapshot(raw: unknown): CleanSnapshot {
  const parsed = snapshotBodySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new PlanError(`The snapshot is not valid. ${where}${issue?.message ?? ""}`.trim());
  }
  const body = parsed.data;
  const account = cleanName(body.account, "account", true);
  const character = cleanName(body.character, "character", true);
  const realm = cleanName(body.realm, "realm", false);
  const sections: CleanSnapshot["sections"] = [];
  for (const [name, section] of Object.entries(body.sections)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) {
      throw new PlanError(`Section names are short words; "${name.slice(0, 40)}" is not.`);
    }
    const text = JSON.stringify(section.body);
    const bytes = Buffer.byteLength(text);
    if (bytes > SECTION_MAX_BYTES) throw new PlanError(`The ${name} Section is too large.`);
    const known = KNOWN_SECTIONS[name];
    sections.push({
      name,
      scope: section.scope,
      v: section.v,
      at: typeof section.at === "number" ? section.at : null,
      src: typeof section.src === "string" ? section.src.slice(0, 20) : null,
      hash: sectionHash(section.body),
      body: section.body as Raw,
      bytes,
      unknown: !known || known.scope !== section.scope || section.v > known.v,
    });
  }
  const dropped: CleanSnapshot["dropped"] = {};
  for (const scope of ["char", "account"] as const) {
    const value = body.dropped?.[scope];
    if (isObject(value)) dropped[scope] = value;
  }
  return {
    account,
    character,
    realm,
    savedAt: typeof body.savedAt === "number" && body.savedAt > 0 ? body.savedAt : null,
    sections,
    dropped,
  };
}

type SectionDbRow = {
  owner_kind: string;
  owner_id: string;
  section: string;
  v: number;
  hash: string;
  at: number | null;
  saved_at: number | null;
  updated_at: number;
  src: string | null;
  unknown: number;
  bytes: number;
  /** SQLite text; Postgres jsonb as `body`. */
  body_json?: string;
  body?: unknown;
};

type CharacterDbRow = {
  id: string;
  account_id: string;
  name: string;
  realm: string;
  class: string | null;
  level: number | null;
  last_seen: number;
  saved_at: number | null;
  dropped_json: unknown;
  device_id: string | null;
};

type AccountDbRow = {
  id: string;
  label: string;
  first_seen: number;
  last_seen: number;
  dropped_json: unknown;
};

type HistoryDbRow = {
  id: number;
  owner_kind: string;
  owner_id: string;
  section: string;
  at: number;
  saved_at: number | null;
  hash: string;
  kind: string;
  body_json?: string;
  body?: unknown;
};

function sectionFromRow(row: SectionDbRow): SectionRow {
  return {
    ownerKind: row.owner_kind === "account" ? "account" : "char",
    ownerId: row.owner_id,
    section: row.section,
    v: row.v,
    hash: row.hash,
    at: row.at,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    src: row.src,
    unknown: row.unknown === 1,
    bytes: row.bytes,
    body: fromJson<Raw>(row.body_json ?? row.body) ?? {},
  };
}

function characterFromRow(row: CharacterDbRow): CharacterRow {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    realm: row.realm,
    class: row.class,
    level: row.level,
    lastSeen: row.last_seen,
    savedAt: row.saved_at,
    dropped: fromJson<Raw>(row.dropped_json),
    deviceId: row.device_id,
  };
}

function accountFromRow(row: AccountDbRow): AccountRow {
  return {
    id: row.id,
    label: row.label,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    dropped: fromJson<Raw>(row.dropped_json),
  };
}

function historyFromRow(row: HistoryDbRow): HistoryRow {
  return {
    id: row.id,
    ownerKind: row.owner_kind === "account" ? "account" : "char",
    ownerId: row.owner_id,
    section: row.section,
    at: row.at,
    savedAt: row.saved_at,
    hash: row.hash,
    kind: row.kind === "diff" ? "diff" : "full",
    body: fromJson<unknown>(row.body_json ?? row.body),
  };
}

/** The new upload wins field by field, except where it is empty and the old one is not (ADR 0020). */
export function mergeProfile(old: Raw, fresh: Raw): Raw {
  const isEmpty = (value: unknown) =>
    value === undefined ||
    value === null ||
    value === "" ||
    value === 0 ||
    (Array.isArray(value) && value.length === 0) ||
    (isObject(value) && Object.keys(value).length === 0);
  const out: Raw = { ...old };
  for (const [key, value] of Object.entries(fresh)) {
    const previous = old[key];
    if (isObject(value) && isObject(previous)) out[key] = mergeProfile(previous, value);
    else if (isEmpty(value) && !isEmpty(previous)) out[key] = previous;
    else out[key] = value;
  }
  return out;
}

const SQLITE_SCHEMA = `
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        dropped_json TEXT
      );
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        realm TEXT NOT NULL,
        class TEXT,
        level INTEGER,
        last_seen INTEGER NOT NULL,
        saved_at INTEGER,
        dropped_json TEXT,
        device_id TEXT
      );
      CREATE INDEX IF NOT EXISTS characters_account ON characters (account_id);
      CREATE TABLE IF NOT EXISTS sections_latest (
        owner_kind TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        section TEXT NOT NULL,
        v INTEGER NOT NULL,
        hash TEXT NOT NULL,
        at INTEGER,
        saved_at INTEGER,
        updated_at INTEGER NOT NULL,
        src TEXT,
        unknown INTEGER NOT NULL DEFAULT 0,
        bytes INTEGER NOT NULL,
        body_json TEXT NOT NULL,
        PRIMARY KEY (owner_kind, owner_id, section)
      );
      CREATE TABLE IF NOT EXISTS section_history (
        id INTEGER PRIMARY KEY,
        owner_kind TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        section TEXT NOT NULL,
        at INTEGER NOT NULL,
        saved_at INTEGER,
        hash TEXT NOT NULL,
        kind TEXT NOT NULL,
        body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS section_history_owner ON section_history (owner_kind, owner_id, at);
      CREATE TABLE IF NOT EXISTS data_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS addon_errors (
        hash TEXT NOT NULL,
        account TEXT NOT NULL,
        device_id TEXT,
        character_name TEXT NOT NULL,
        realm TEXT NOT NULL,
        version TEXT NOT NULL,
        "where" TEXT NOT NULL,
        text TEXT NOT NULL,
        stack TEXT NOT NULL,
        count INTEGER NOT NULL,
        first_at INTEGER NOT NULL,
        last_at INTEGER NOT NULL,
        seen_at INTEGER NOT NULL,
        PRIMARY KEY (account, hash)
      );
      CREATE INDEX IF NOT EXISTS addon_errors_last ON addon_errors (last_at);
    `;

/** History rows land in month partitions on Postgres (ADR 0057): an odd clock must not fail the upload. */
const HISTORY_FLOOR = Date.UTC(2025, 0, 1) / 1000;
export function historyAt(db: Db, at: number, now: number): number {
  if (!db.pg) return at;
  return at >= HISTORY_FLOOR && at <= now + 31 * 86_400 ? at : now;
}

export class DataStore {
  private db: Db;
  private holdingsCache = new Map<string, { key: string; value: Holdings }>();
  /** The 0.6 backfill on SQLite; queries made meanwhile wait for its transaction. */
  readonly ready: Promise<void>;

  constructor(db: Db) {
    this.db = db;
    if (db instanceof SqliteDb) {
      db.raw.exec(SQLITE_SCHEMA);
      this.ready = this.backfill(db.raw).catch((error: unknown) => {
        console.error(`Profile backfill failed: ${(error as Error).message}`);
      });
    } else {
      this.ready = Promise.resolve();
    }
  }

  private async touchAccount(label: string, now: number, dropped?: Raw): Promise<string> {
    const id = accountId(label);
    await this.db.run(
      `INSERT INTO accounts (id, label, first_seen, last_seen, dropped_json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET label = excluded.label,
         last_seen = ${this.db.greatest("accounts.last_seen", "excluded.last_seen")},
         dropped_json = COALESCE(excluded.dropped_json, accounts.dropped_json)`,
      id,
      label,
      now,
      now,
      dropped ? JSON.stringify(dropped) : null,
    );
    return id;
  }

  private async touchCharacter(input: {
    account: string;
    name: string;
    realm: string;
    now: number;
    savedAt: number | null;
    dropped?: Raw;
    deviceId?: string;
  }): Promise<string> {
    const id = characterId(input.name, input.realm);
    const previous = await this.character(input.name, input.realm);
    if (previous?.savedAt && input.savedAt && input.savedAt < previous.savedAt) {
      // A late upload is still a contact, but cannot move this Character back
      // to an old Account/Device or restore obsolete dropped-Section metadata.
      await this.db.run(
        `UPDATE characters SET last_seen = ${this.db.greatest("last_seen", "?")} WHERE id = ?`,
        input.now,
        id,
      );
      return id;
    }
    await this.db.run(
      `INSERT INTO characters (id, account_id, name, realm, last_seen, saved_at, dropped_json, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         account_id = CASE WHEN excluded.account_id = '' THEN characters.account_id ELSE excluded.account_id END,
         last_seen = ${this.db.greatest("characters.last_seen", "excluded.last_seen")},
         saved_at = ${this.db.greatest("COALESCE(characters.saved_at, 0)", "COALESCE(excluded.saved_at, 0)")},
         dropped_json = COALESCE(excluded.dropped_json, characters.dropped_json),
         device_id = COALESCE(excluded.device_id, characters.device_id)`,
      id,
      input.account,
      input.name,
      input.realm,
      input.now,
      input.savedAt,
      input.dropped ? JSON.stringify(input.dropped) : null,
      input.deviceId ?? null,
    );
    return id;
  }

  /** The catalog is derived from accepted Sections, never from an incoming upload. */
  private async refreshCharacterFacts(id: string): Promise<void> {
    const char = await this.section("char", id, "char");
    const context = char ? char.body : (await this.section("char", id, "profile"))?.body.context;
    if (!isObject(context)) return;
    const className =
      typeof context.class === "string" && context.class.trim() ? context.class : null;
    const level =
      typeof context.level === "number" && (!this.db.pg || Number.isInteger(context.level))
        ? context.level
        : null;
    await this.db.run(
      `UPDATE characters SET class = COALESCE(?, class), level = COALESCE(?, level) WHERE id = ?`,
      className,
      level,
      id,
    );
  }

  private async putSection(input: {
    ownerKind: SectionScope;
    ownerId: string;
    name: string;
    v: number;
    at: number | null;
    savedAt: number | null;
    src: string | null;
    hash: string;
    body: Raw;
    bytes: number;
    unknown: boolean;
    now: number;
    changes?: SectionChange[];
  }): Promise<"stored" | "unchanged" | "stale"> {
    const previous = await this.section(input.ownerKind, input.ownerId, input.name);
    if (previous?.savedAt && input.savedAt && input.savedAt < previous.savedAt) return "stale";
    if (previous && previous.hash === input.hash && previous.v === input.v) {
      // An unchanged upload still acknowledges a newer save. Without advancing
      // this watermark, an older, different body could overwrite the snapshot.
      if (
        input.savedAt !== null &&
        (previous.savedAt === null || input.savedAt > previous.savedAt)
      ) {
        await this.db.run(
          `UPDATE sections_latest SET saved_at = ?
           WHERE owner_kind = ? AND owner_id = ? AND section = ?`,
          input.savedAt,
          input.ownerKind,
          input.ownerId,
          input.name,
        );
      }
      if (input.ownerKind === "char" && (input.name === "char" || input.name === "profile"))
        await this.refreshCharacterFacts(input.ownerId);
      return "unchanged";
    }
    const body = this.db.body;
    await this.db.run(
      `INSERT INTO sections_latest
         (owner_kind, owner_id, section, v, hash, at, saved_at, updated_at, src, unknown, bytes, ${body})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (owner_kind, owner_id, section) DO UPDATE SET
         v = excluded.v, hash = excluded.hash, at = excluded.at, saved_at = excluded.saved_at,
         updated_at = excluded.updated_at, src = excluded.src, unknown = excluded.unknown,
         bytes = excluded.bytes, ${body} = excluded.${body}`,
      input.ownerKind,
      input.ownerId,
      input.name,
      input.v,
      input.hash,
      input.at,
      input.savedAt,
      input.now,
      input.src,
      input.unknown ? 1 : 0,
      input.bytes,
      JSON.stringify(input.body),
    );
    if (input.ownerKind === "char" && (input.name === "char" || input.name === "profile"))
      await this.refreshCharacterFacts(input.ownerId);
    const change =
      previous && previous.v !== input.v
        ? { kind: "full" as const, body: input.body }
        : sectionChange(previous?.body ?? null, input.body);
    await this.db.run(
      `INSERT INTO section_history (owner_kind, owner_id, section, at, saved_at, hash, kind, ${body})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.ownerKind,
      input.ownerId,
      input.name,
      historyAt(this.db, input.at ?? input.now, input.now),
      input.savedAt,
      input.hash,
      change.kind,
      JSON.stringify(change.body),
    );
    input.changes?.push({
      section: input.name,
      scope: input.ownerKind,
      ownerId: input.ownerId,
      at: input.at ?? input.now,
      kind: change.kind,
      body: change.body,
      versionChanged: Boolean(previous && previous.v !== input.v),
    });
    return "stored";
  }

  /** Each `errors` row becomes one `addon_errors` row per Account and hash; count is the most seen (D178). */
  private async putErrors(input: {
    account: string;
    deviceId?: string;
    character: string;
    realm: string;
    body: Raw;
    now: number;
  }): Promise<void> {
    const rows = Array.isArray(input.body.rows) ? input.body.rows : [];
    const short = (value: unknown, max: number) =>
      typeof value === "string" ? value.slice(0, max) : "";
    const whole = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    const db = this.db;
    const upsert = `INSERT INTO addon_errors
         (hash, account, device_id, character_name, realm, version, "where", text, stack, count, first_at, last_at, seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account, hash) DO UPDATE SET
         device_id = COALESCE(excluded.device_id, addon_errors.device_id),
         character_name = excluded.character_name, realm = excluded.realm,
         stack = CASE WHEN excluded.stack <> '' THEN excluded.stack ELSE addon_errors.stack END,
         count = ${db.greatest("addon_errors.count", "excluded.count")},
         first_at = ${db.least("addon_errors.first_at", "excluded.first_at")},
         last_at = ${db.greatest("addon_errors.last_at", "excluded.last_at")}`;
    for (const row of rows.slice(0, 20)) {
      if (!isObject(row)) continue;
      const version = short(row.version, 20);
      const where = short(row.where, 80);
      const text = short(row.text, 300);
      if (!where || !text) continue;
      const hash = createHash("sha256").update(`${version}|${where}|${text}`).digest("hex");
      const lastAt = whole(row.lastAt) || whole(row.at) || input.now;
      await db.run(
        upsert,
        hash,
        input.account,
        input.deviceId ?? null,
        input.character,
        input.realm,
        version,
        where,
        text,
        short(row.stack, 800),
        Math.max(1, whole(row.count)),
        whole(row.at) || lastAt,
        lastAt,
        input.now,
      );
    }
  }

  /** Error reports, newest first (D178). `since` keeps rows seen again after it. */
  async errors(filter: {
    account?: string;
    since?: number;
    version?: string;
    limit: number;
  }): Promise<AddonErrorRow[]> {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.account) {
      where.push("account = ?");
      args.push(accountId(filter.account));
    }
    if (filter.since !== undefined) {
      where.push("(last_at >= ? OR seen_at >= ?)");
      args.push(filter.since, filter.since);
    }
    if (filter.version) {
      where.push("version = ?");
      args.push(filter.version);
    }
    const rows = await this.db.all(
      `SELECT * FROM addon_errors ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY last_at DESC, seen_at DESC LIMIT ?`,
      ...args,
      Math.min(filter.limit, ERRORS_LIST_MAX),
    );
    return rows.map((row) => ({
      hash: String(row.hash),
      account: String(row.account),
      deviceId: (row.device_id as string | null) ?? null,
      character: String(row.character_name),
      realm: String(row.realm),
      version: String(row.version),
      where: String(row.where),
      text: String(row.text),
      stack: String(row.stack),
      count: Number(row.count),
      firstAt: Number(row.first_at),
      lastAt: Number(row.last_at),
      seenAt: Number(row.seen_at),
    }));
  }

  async ingestSnapshot(
    snapshot: CleanSnapshot,
    deviceId?: string,
    now = Math.floor(Date.now() / 1000),
    changes?: SectionChange[],
  ): Promise<SnapshotResult> {
    return this.db.tx(async () => {
      // Two uploads of one Account apply one after the other (read, diff, write).
      await this.db.lockKey(`account:${accountId(snapshot.account)}`);
      const account = await this.touchAccount(snapshot.account, now, snapshot.dropped.account);
      const character = await this.touchCharacter({
        account,
        name: snapshot.character,
        realm: snapshot.realm,
        now,
        savedAt: snapshot.savedAt,
        dropped: snapshot.dropped.char,
        deviceId,
      });
      const result: SnapshotResult = {
        account,
        character: snapshot.character,
        realm: snapshot.realm,
        stored: [],
        unchanged: [],
        unknown: [],
        stale: false,
      };
      for (const section of snapshot.sections) {
        const outcome = await this.putSection({
          ownerKind: section.scope,
          ownerId: section.scope === "account" ? account : character,
          name: section.name,
          v: section.v,
          at: section.at,
          savedAt: snapshot.savedAt,
          src: section.src,
          hash: section.hash,
          body: section.body,
          bytes: section.bytes,
          unknown: section.unknown,
          now,
          changes,
        });
        if (outcome === "stored" && section.name === "errors" && section.scope === "account") {
          await this.putErrors({
            account,
            deviceId,
            character: snapshot.character,
            realm: snapshot.realm,
            body: section.body,
            now,
          });
        }
        if (outcome === "stored") result.stored.push(section.name);
        else if (outcome === "unchanged") result.unchanged.push(section.name);
        else result.stale = true;
        if (section.unknown) result.unknown.push(section.name);
      }
      return result;
    });
  }

  /** A 0.6 profile upload becomes the `profile` Section of that Character (D56). */
  async ingestProfile(
    input: {
      character: string;
      realm: string;
      account: string;
      savedAt: number | null;
      profile: Raw;
      deviceId?: string;
    },
    now = Math.floor(Date.now() / 1000),
  ): Promise<{ updated: boolean; savedAt: number | null; body: Raw }> {
    return this.db.tx(async () => {
      const id = characterId(input.character, input.realm);
      await this.db.lockKey(`character:${id}`);
      const previous = await this.section("char", id, "profile");
      if (previous?.savedAt && input.savedAt && input.savedAt < previous.savedAt) {
        return { updated: false, savedAt: previous.savedAt, body: previous.body };
      }
      const known = await this.character(input.character, input.realm);
      const account = input.account
        ? await this.touchAccount(input.account, now)
        : (known?.accountId ?? "");
      const body = previous ? mergeProfile(previous.body, input.profile) : input.profile;
      await this.touchCharacter({
        account,
        name: input.character,
        realm: input.realm,
        now,
        savedAt: input.savedAt,
        deviceId: input.deviceId,
      });
      const text = JSON.stringify(body);
      await this.putSection({
        ownerKind: "char",
        ownerId: id,
        name: "profile",
        v: 1,
        at: now,
        savedAt: input.savedAt,
        src: "profile",
        hash: sectionHash(body),
        body,
        bytes: Buffer.byteLength(text),
        unknown: false,
        now,
      });
      return { updated: true, savedAt: input.savedAt, body };
    });
  }

  /**
   * Moves the 0.6 `profiles` and `profile_snapshots` rows in once; they stay
   * read-only (D57). SQLite only: Postgres starts from the transfer (ADR 0057).
   */
  private async backfill(raw: DatabaseSync): Promise<void> {
    const done = raw.prepare(`SELECT value FROM data_meta WHERE key = 'backfill_profiles'`).get();
    if (done) return;
    const exists = (table: string) =>
      raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
    await this.db.tx(async () => {
      if (exists("profile_snapshots")) {
        const snapshots = raw
          .prepare(
            `SELECT at, account, character_name, realm, saved_at, body_json FROM profile_snapshots ORDER BY at, id`,
          )
          .all() as {
          at: number;
          account: string;
          character_name: string;
          realm: string;
          saved_at: number | null;
          body_json: string;
        }[];
        for (const row of snapshots) await this.backfillOne(row, row.at);
      }
      if (exists("profiles")) {
        const columns = raw.prepare(`PRAGMA table_info(profiles)`).all() as { name: string }[];
        const hasAccount = columns.some((column) => column.name === "account");
        const rows = raw
          .prepare(
            `SELECT character_name, realm, ${hasAccount ? "account" : "'' AS account"}, device_id, saved_at, updated_at, body_json FROM profiles`,
          )
          .all() as {
          character_name: string;
          realm: string;
          account: string | null;
          device_id: string;
          saved_at: number | null;
          updated_at: number;
          body_json: string;
        }[];
        for (const row of rows) await this.backfillOne(row, row.updated_at);
      }
      await this.db.run(
        `INSERT INTO data_meta (key, value) VALUES ('backfill_profiles', ?)`,
        String(Math.floor(Date.now() / 1000)),
      );
    });
  }

  private async backfillOne(
    row: {
      account: string | null;
      character_name: string;
      realm: string;
      saved_at: number | null;
      body_json: string;
      device_id?: string;
    },
    at: number,
  ): Promise<void> {
    const body = parse<Raw>(row.body_json);
    if (!body) return;
    const account = row.account ? await this.touchAccount(row.account, at) : "";
    const id = await this.touchCharacter({
      account,
      name: row.character_name,
      realm: row.realm,
      now: at,
      savedAt: row.saved_at,
      deviceId: row.device_id,
    });
    await this.putSection({
      ownerKind: "char",
      ownerId: id,
      name: "profile",
      v: 1,
      at,
      savedAt: row.saved_at,
      src: "profile",
      hash: sectionHash(body),
      body,
      bytes: Buffer.byteLength(row.body_json),
      unknown: false,
      now: at,
    });
  }

  async section(
    ownerKind: SectionScope,
    ownerId: string,
    name: string,
  ): Promise<SectionRow | undefined> {
    const row = await this.db.get<SectionDbRow>(
      `SELECT * FROM sections_latest WHERE owner_kind = ? AND owner_id = ? AND section = ?`,
      ownerKind,
      ownerId,
      name,
    );
    return row ? sectionFromRow(row) : undefined;
  }

  async sections(
    ownerKind: SectionScope,
    ownerId: string,
    names?: string[],
  ): Promise<SectionRow[]> {
    const rows = await this.db.all<SectionDbRow>(
      `SELECT * FROM sections_latest WHERE owner_kind = ? AND owner_id = ? ORDER BY section${this.db.pg ? ' COLLATE "C"' : ""}`,
      ownerKind,
      ownerId,
    );
    return rows.map(sectionFromRow).filter((row) => !names?.length || names.includes(row.section));
  }

  async accounts(): Promise<AccountRow[]> {
    return (await this.db.all<AccountDbRow>(`SELECT * FROM accounts ORDER BY last_seen DESC`)).map(
      accountFromRow,
    );
  }

  async account(id: string): Promise<AccountRow | undefined> {
    const row = await this.db.get<AccountDbRow>(
      `SELECT * FROM accounts WHERE id = ?`,
      accountId(id),
    );
    return row ? accountFromRow(row) : undefined;
  }

  async characters(account?: string): Promise<CharacterRow[]> {
    const rows = account
      ? await this.db.all<CharacterDbRow>(
          `SELECT * FROM characters WHERE account_id = ? ORDER BY last_seen DESC`,
          accountId(account),
        )
      : await this.db.all<CharacterDbRow>(`SELECT * FROM characters ORDER BY last_seen DESC`);
    return rows.map(characterFromRow);
  }

  /** The named character (realm optional), or the most recently seen one. */
  async character(name?: string, realm?: string): Promise<CharacterRow | undefined> {
    const order = `ORDER BY last_seen DESC, COALESCE(saved_at, 0) DESC LIMIT 1`;
    const row = name
      ? realm !== undefined
        ? await this.db.get<CharacterDbRow>(
            `SELECT * FROM characters WHERE name = ? AND realm = ? ${order}`,
            name,
            realm,
          )
        : await this.db.get<CharacterDbRow>(
            `SELECT * FROM characters WHERE name = ? ${order}`,
            name,
          )
      : await this.db.get<CharacterDbRow>(`SELECT * FROM characters ${order}`);
    return row ? characterFromRow(row) : undefined;
  }

  async history(filter: {
    owners: { kind: SectionScope; id: string }[];
    sections?: string[];
    since?: number;
    savedAt?: number;
    limit: number;
  }): Promise<HistoryRow[]> {
    if (filter.owners.length === 0) return [];
    const where = [
      `(${filter.owners.map(() => "(owner_kind = ? AND owner_id = ?)").join(" OR ")})`,
    ];
    const args: (string | number)[] = filter.owners.flatMap((owner) => [owner.kind, owner.id]);
    if (filter.sections?.length) {
      where.push(`section IN (${filter.sections.map(() => "?").join(", ")})`);
      args.push(...filter.sections);
    }
    if (filter.since !== undefined) {
      where.push("at >= ?");
      args.push(filter.since);
    }
    if (filter.savedAt !== undefined) {
      where.push("saved_at = ?");
      args.push(filter.savedAt);
    }
    const rows = await this.db.all<HistoryDbRow>(
      `SELECT * FROM section_history WHERE ${where.join(" AND ")} ORDER BY at DESC, id DESC LIMIT ?`,
      ...args,
      filter.limit,
    );
    return rows.map(historyFromRow);
  }

  async lastChange(
    ownerKind: SectionScope,
    ownerId: string,
    name: string,
  ): Promise<HistoryRow | undefined> {
    const row = await this.db.get<HistoryDbRow>(
      `SELECT * FROM section_history WHERE owner_kind = ? AND owner_id = ? AND section = ?
       ORDER BY at DESC, id DESC LIMIT 1`,
      ownerKind,
      ownerId,
      name,
    );
    return row ? historyFromRow(row) : undefined;
  }

  /** Latest Sections of a Character and its Account, by name (Character first). */
  async sectionsFor(row: CharacterRow): Promise<Map<string, SectionRow>> {
    const out = new Map<string, SectionRow>();
    if (row.accountId)
      for (const s of await this.sections("account", row.accountId)) out.set(s.section, s);
    for (const s of await this.sections("char", row.id)) out.set(s.section, s);
    return out;
  }

  /**
   * The Account digest for the Companion (D76): every other Character on the
   * same Account with its faction and professions, so Alt routing works for
   * Alts never logged in on this PC.
   */
  async accountAlts(row: CharacterRow, limit = MAX_DIGEST_ALTS): Promise<DigestAlt[]> {
    if (!row.accountId) return [];
    const others = (await this.characters(row.accountId))
      .filter((other) => other.id !== row.id)
      .slice(0, limit);
    const out: DigestAlt[] = [];
    for (const other of others) {
      const char = (await this.section("char", other.id, "char"))?.body ?? {};
      const legacy = (await this.section("char", other.id, "profile"))?.body;
      const raw =
        (await this.section("char", other.id, "professions"))?.body.list ?? legacy?.professions;
      const professions = (Array.isArray(raw) ? raw : [])
        .filter(isObject)
        .map((item) => ({
          skillLine: typeof item.skillLine === "number" ? item.skillLine : null,
          name: typeof item.name === "string" ? item.name.slice(0, 60) : null,
          skill: typeof item.skill === "number" ? item.skill : null,
        }))
        .filter((item) => item.skillLine !== null)
        .slice(0, 6);
      const alt: DigestAlt = {
        name: other.name,
        realm: other.realm,
        seenAt: other.lastSeen,
        professions,
      };
      if (typeof char.faction === "string") alt.faction = char.faction.slice(0, 20);
      out.push(alt);
    }
    return out;
  }

  /**
   * The Account holdings index (ADR 0048) from every Character's bags, bank
   * and reagent bank and the Warband bank. Kept until one of those changes.
   */
  async holdings(row: CharacterRow, now = Math.floor(Date.now() / 1000)): Promise<Holdings> {
    if (!row.accountId) return { places: [], items: {} };
    const characters = await this.characters(row.accountId);
    const owners = [row.accountId, ...characters.map((other) => other.id)];
    const stamp = (await this.db.get<{ at: number; n: number }>(
      `SELECT COALESCE(MAX(updated_at), 0) AS at, COUNT(*) AS n FROM sections_latest
       WHERE section IN ('bags', 'bank', 'reagentBank', 'warband')
         AND owner_id IN (${owners.map(() => "?").join(",")})`,
      ...owners,
    ))!;
    const key = `${owners.join(",")}|${Number(stamp.at)}|${Number(stamp.n)}|${Math.floor(now / 86400)}`;
    const cached = this.holdingsCache.get(row.accountId);
    if (cached?.key === key) return cached.value;
    const items = (section: SectionRow | undefined) =>
      section && isPackedIdSet(section.body.items)
        ? unpackRows(section.body.items).map((item) => ({
            id: item.id,
            count: item.values[0] ?? 1,
          }))
        : [];
    const places: HoldingsPlace[] = [];
    for (const other of characters) {
      const sections = await this.sections("char", other.id, ["bags", "bank", "reagentBank"]);
      places.push({
        key: `${other.name}-${other.realm}`,
        seenAt: other.lastSeen,
        items: sections.flatMap(items),
      });
    }
    const warband = await this.section("account", row.accountId, "warband");
    if (warband)
      places.push({
        key: WARBAND_PLACE,
        seenAt: warband.at ?? warband.updatedAt,
        items: items(warband),
      });
    const value = buildHoldings(places, now);
    this.holdingsCache.set(row.accountId, { key, value });
    return value;
  }

  /**
   * The player profile in its 0.6 shape for get_player_profile: the stored
   * 0.6 upload, with every 0.7 Section the Character has laid over it.
   */
  async profileView(row: CharacterRow) {
    const all = await this.sectionsFor(row);
    return profileViewOf(row, all);
  }

  /** Sharing looks off when a Character has only the Sections written with sharing off. */
  private async sharingOff(row: CharacterRow): Promise<boolean> {
    const names = (await this.sections("char", row.id)).map((s) => s.section);
    return (
      names.some((name) => ESSENTIAL_SECTIONS.has(name)) &&
      !names.some((name) => !ESSENTIAL_SECTIONS.has(name) && KNOWN_SECTIONS[name])
    );
  }

  /** Expected Sections an owner does not have, each with why (D171). */
  async missing(scope: SectionScope, ownerId: string, dropped: Raw | null, sharingOff: boolean) {
    const present = new Set((await this.sections(scope, ownerId)).map((s) => s.section));
    const out: MissingSection[] = [];
    for (const name of expectedSections(scope)) {
      if (present.has(name)) continue;
      let reason: MissingReason = "never";
      if (dropped && isObject(dropped) && dropped[name] !== undefined) reason = "dropped";
      else if (sharingOff && !ESSENTIAL_SECTIONS.has(name)) reason = "sharing";
      else if (WINDOW_SECTIONS[name]) reason = "window";
      const entry: MissingSection = { section: name, scope, reason };
      if (reason === "window") entry.hint = WINDOW_SECTIONS[name];
      out.push(entry);
    }
    return out;
  }

  /** Missing Sections of a Character and of its Account. */
  async missingFor(row: CharacterRow): Promise<MissingSection[]> {
    const sharingOff = await this.sharingOff(row);
    const out = await this.missing("char", row.id, row.dropped, sharingOff);
    if (row.accountId) {
      const account = await this.account(row.accountId);
      out.push(
        ...(await this.missing("account", row.accountId, account?.dropped ?? null, sharingOff)),
      );
    }
    return out;
  }

  /** One row per Character for get_account_overview (D59). */
  async overview(row: CharacterRow) {
    const all = await this.sectionsFor(row);
    const char = all.get("char")?.body ?? {};
    const legacy = all.get("profile")?.body;
    const context = isObject(legacy?.context) ? legacy.context : {};
    const professions = all.get("professions")?.body.list ?? legacy?.professions ?? null;
    return {
      character: row.name,
      realm: row.realm,
      class: char.class ?? context.class ?? row.class,
      spec: char.spec ?? context.spec ?? null,
      level: char.level ?? context.level ?? row.level,
      ilvl: char.ilvl ?? context.ilvl ?? null,
      gold:
        typeof char.money === "number" ? Math.floor(char.money / 10000) : (context.gold ?? null),
      professions,
      lastSeen: row.lastSeen,
      savedAt: row.savedAt || null,
      sections: Object.fromEntries(
        [...all.values()].map((s) => [
          s.section,
          { at: s.at, savedAt: s.savedAt, scope: s.ownerKind },
        ]),
      ),
      missing: await this.missingFor(row),
    };
  }

  /** Which of `ids` each Character (or the Account) has, without loading whole sets (D59). */
  async checkIds(kind: IdKind, ids: number[], characters: CharacterRow[]) {
    const wanted = new Set(ids);
    const pick = (set: unknown) => unpackIds(set).filter((id) => wanted.has(id));
    const accountScope: Record<string, { section: string; key: string }> = {
      achievement: { section: "achievements", key: "ids" },
      mount: { section: "mounts", key: "ids" },
      toy: { section: "toys", key: "ids" },
      pet: { section: "pets", key: "species" },
    };
    const out: {
      kind: IdKind;
      ids: number[];
      account?: { account: string; have: number[]; missing: number[]; at: number | null } | null;
      characters: { character: string; realm: string; have: number[] | null; at: number | null }[];
    } = { kind, ids: [...wanted], characters: [] };
    const scope = accountScope[kind];
    if (scope) {
      const accountIds = [...new Set(characters.map((row) => row.accountId).filter(Boolean))];
      const section = accountIds.length
        ? await this.section("account", accountIds[0]!, scope.section)
        : undefined;
      const have = section ? pick(section.body[scope.key]) : [];
      out.account = section
        ? {
            account: accountIds[0]!,
            have,
            missing: [...wanted].filter((id) => !have.includes(id)),
            at: section.at,
          }
        : null;
    }
    const charSection =
      kind === "quest"
        ? "questsDone"
        : kind === "achievement"
          ? "achievementsMine"
          : kind === "recipe"
            ? "recipes"
            : null;
    if (charSection) {
      for (const row of characters) {
        const section = await this.section("char", row.id, charSection);
        let have: number[] | null = null;
        if (section && kind === "recipe") {
          const found = new Set<number>();
          for (const set of packedSets(section.body).values()) {
            for (const id of pick(set)) found.add(id);
          }
          have = [...found];
        } else if (section) {
          have = pick(section.body.ids);
        }
        out.characters.push({
          character: row.name,
          realm: row.realm,
          have,
          at: section?.at ?? null,
        });
      }
    }
    return out;
  }

  private async sectionInfo(row: SectionRow) {
    const counts: Raw = {};
    for (const [path, set] of packedSets(row.body)) counts[path] = unpackRows(set).length;
    const last = await this.lastChange(row.ownerKind, row.ownerId, row.section);
    // D160: ids Bory could not help with, counted per kind (quest, item, advice, ...).
    let byKind: Record<string, number> | undefined;
    if (row.section === "unresolvedIds" && Array.isArray(row.body.list)) {
      byKind = {};
      for (const entry of row.body.list as Raw[]) {
        const kind = typeof entry?.kind === "string" ? entry.kind : "unknown";
        byKind[kind] = (byKind[kind] ?? 0) + 1;
      }
    }
    return {
      name: row.section,
      v: row.v,
      at: row.at,
      savedAt: row.savedAt,
      src: row.src,
      bytes: row.bytes,
      unknown: row.unknown,
      ...(Object.keys(counts).length ? { counts } : {}),
      ...(typeof row.body.count === "number" ? { count: row.body.count } : {}),
      ...(byKind ? { byKind } : {}),
      lastChange: last ? { at: last.at, ...changeSummary(last.kind, last.body) } : null,
    };
  }

  private async sectionInfos(scope: SectionScope, ownerId: string) {
    const out = [];
    for (const s of await this.sections(scope, ownerId)) out.push(await this.sectionInfo(s));
    return out;
  }

  /** The Data explorer: every Account, Character and Section with sizes and the last change (D60). */
  async catalog(filter: { account?: string } = {}) {
    const accounts = filter.account
      ? [await this.account(filter.account)].filter((row): row is AccountRow => Boolean(row))
      : await this.accounts();
    const loose = filter.account ? [] : (await this.characters()).filter((row) => !row.accountId);
    const character = async (row: CharacterRow) => {
      const sections = await this.sectionInfos("char", row.id);
      return {
        character: row.name,
        realm: row.realm,
        class: row.class,
        level: row.level,
        lastSeen: row.lastSeen,
        savedAt: row.savedAt || null,
        dropped: row.dropped,
        bytes: sections.reduce((sum, s) => sum + s.bytes, 0),
        sections,
        expected: expectedSections("char"),
        missing: await this.missing("char", row.id, row.dropped, await this.sharingOff(row)),
      };
    };
    const out = [];
    for (const row of accounts) {
      const sections = await this.sectionInfos("account", row.id);
      const characters = await this.characters(row.id);
      let sharingOff = characters.length > 0;
      for (const other of characters) {
        if (!sharingOff) break;
        sharingOff = await this.sharingOff(other);
      }
      const rows = [];
      for (const other of characters) rows.push(await character(other));
      out.push({
        account: row.id,
        label: row.label,
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
        dropped: row.dropped,
        bytes: sections.reduce((sum, s) => sum + s.bytes, 0),
        sections,
        expected: expectedSections("account"),
        missing: await this.missing("account", row.id, row.dropped, sharingOff),
        characters: rows,
      });
    }
    if (loose.length) {
      const rows = [];
      for (const other of loose) rows.push(await character(other));
      out.push({ account: "", label: "", sections: [], characters: rows });
    }
    return { knownSections: Object.keys(KNOWN_SECTIONS), accounts: out };
  }

  /** Owner-only erasure: every Section, history row and Character of one Account (D62). */
  async deleteAccount(account: string): Promise<{
    characters: number;
    sections: number;
    history: number;
    errors: number;
  }> {
    const id = accountId(account);
    return this.db.tx(async () => {
      const characters = (await this.characters(id)).map((row) => row.id);
      const owners: [string, string][] = [
        ["account", id],
        ...characters.map((char) => ["char", char] as [string, string]),
      ];
      let sections = 0;
      let history = 0;
      for (const [kind, owner] of owners) {
        sections += await this.db.run(
          `DELETE FROM sections_latest WHERE owner_kind = ? AND owner_id = ?`,
          kind,
          owner,
        );
        history += await this.db.run(
          `DELETE FROM section_history WHERE owner_kind = ? AND owner_id = ?`,
          kind,
          owner,
        );
      }
      const errors = await this.db.run(`DELETE FROM addon_errors WHERE account = ?`, id);
      await this.db.run(`DELETE FROM characters WHERE account_id = ?`, id);
      await this.db.run(`DELETE FROM accounts WHERE id = ?`, id);
      return { characters: characters.length, sections, history, errors };
    });
  }
}

/** The 0.6-shaped profile of one Character from its Sections (see DataStore.profileView). */
function profileViewOf(row: CharacterRow, all: Map<string, SectionRow>) {
  const body = (name: string) => all.get(name)?.body;
  const profile: Raw = { ...body("profile") };
  const char = body("char");
  if (char) {
    const context: Raw = isObject(profile.context) ? { ...profile.context } : {};
    for (const key of [
      "level",
      "class",
      "classFile",
      "race",
      "faction",
      "spec",
      "specID",
      "hearth",
    ]) {
      if (char[key] !== undefined) context[key] = char[key];
    }
    if (typeof char.ilvl === "number") context.ilvl = char.ilvl;
    if (typeof char.money === "number") context.gold = Math.floor(char.money / 10000);
    profile.context = context;
  }
  const items = (name: string) => {
    const section = body(name);
    if (!section || !isPackedIdSet(section.items)) return undefined;
    return unpackRows(section.items).map((item) => ({
      itemID: item.id,
      count: item.values[0] ?? 1,
    }));
  };
  const bags = items("bags");
  if (bags) profile.bags = bags;
  for (const name of ["bank", "reagentBank", "warband"]) {
    const list = items(name);
    if (list) profile[name] = { seenAt: all.get(name)?.at ?? null, items: list };
  }
  const gear = body("gear");
  if (gear && Array.isArray(gear.slots)) profile.equipped = gear.slots;
  const listOf = (name: string, key: string) => {
    const section = body(name);
    return section && Array.isArray(section[key]) ? section[key] : undefined;
  };
  const professions = listOf("professions", "list");
  if (professions) profile.professions = professions;
  const currencies = listOf("currencies", "list");
  if (currencies) profile.currencies = currencies;
  const quests = listOf("questLog", "quests");
  if (quests) profile.quests = quests;
  const sessions = listOf("sessions", "list");
  if (sessions) profile.sessions = sessions;
  const count = (name: string, key = "ids") => {
    const section = body(name);
    if (!section) return undefined;
    return isPackedIdSet(section[key]) ? unpackRows(section[key]).length : section.count;
  };
  if (["mounts", "pets", "toys", "achievements"].some((name) => all.has(name))) {
    const collections: Raw = isObject(profile.collections) ? { ...profile.collections } : {};
    const set = (key: string, value: unknown) => {
      if (value !== undefined) collections[key] = value;
    };
    set("mounts", count("mounts"));
    set("pets", count("pets", "species"));
    set("toys", count("toys"));
    set("achievementPoints", body("achievements")?.points);
    profile.collections = collections;
  }
  const updatedAt = Math.max(0, ...[...all.values()].map((s) => s.updatedAt));
  return {
    character: row.name,
    realm: row.realm,
    account: row.accountId,
    deviceId: row.deviceId ?? "",
    savedAt: row.savedAt || null,
    updatedAt: updatedAt || row.lastSeen,
    profile,
    sections: [...all.values()].map((s) => ({ name: s.section, scope: s.ownerKind, at: s.at })),
  };
}
