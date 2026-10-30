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
  reputation: { scope: "char", v: 1 },
  achievements: { scope: "account", v: 1 },
  achievementsMine: { scope: "char", v: 1 },
  mounts: { scope: "account", v: 1 },
  pets: { scope: "account", v: 1 },
  toys: { scope: "account", v: 1 },
  transmog: { scope: "account", v: 1 },
  lockouts: { scope: "char", v: 1 },
  mplus: { scope: "char", v: 1 },
  vault: { scope: "char", v: 1 },
  calendar: { scope: "account", v: 1 },
  sessions: { scope: "char", v: 1 },
  addons: { scope: "account", v: 1 },
  unresolvedIds: { scope: "char", v: 1 },
  /** A 0.6 `POST /v1/profile` upload, kept whole. */
  profile: { scope: "char", v: 1 },
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
  body_json: string;
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
  dropped_json: string | null;
  device_id: string | null;
};

type AccountDbRow = {
  id: string;
  label: string;
  first_seen: number;
  last_seen: number;
  dropped_json: string | null;
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
  body_json: string;
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
    body: parse<Raw>(row.body_json) ?? {},
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
    dropped: parse<Raw>(row.dropped_json),
    deviceId: row.device_id,
  };
}

function accountFromRow(row: AccountDbRow): AccountRow {
  return {
    id: row.id,
    label: row.label,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    dropped: parse<Raw>(row.dropped_json),
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
    body: parse<unknown>(row.body_json),
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

export class DataStore {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
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
    `);
    this.backfill();
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const out = work();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private touchAccount(label: string, now: number, dropped?: Raw): string {
    const id = accountId(label);
    this.db
      .prepare(
        `INSERT INTO accounts (id, label, first_seen, last_seen, dropped_json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET label = excluded.label,
           last_seen = MAX(last_seen, excluded.last_seen),
           dropped_json = COALESCE(excluded.dropped_json, dropped_json)`,
      )
      .run(id, label, now, now, dropped ? JSON.stringify(dropped) : null);
    return id;
  }

  private touchCharacter(input: {
    account: string;
    name: string;
    realm: string;
    now: number;
    savedAt: number | null;
    char?: Raw;
    dropped?: Raw;
    deviceId?: string;
  }): string {
    const id = characterId(input.name, input.realm);
    const className = typeof input.char?.class === "string" ? input.char.class : null;
    const level = typeof input.char?.level === "number" ? input.char.level : null;
    this.db
      .prepare(
        `INSERT INTO characters (id, account_id, name, realm, class, level, last_seen, saved_at, dropped_json, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           account_id = CASE WHEN excluded.account_id = '' THEN account_id ELSE excluded.account_id END,
           class = COALESCE(excluded.class, class), level = COALESCE(excluded.level, level),
           last_seen = MAX(last_seen, excluded.last_seen),
           saved_at = MAX(COALESCE(saved_at, 0), COALESCE(excluded.saved_at, 0)),
           dropped_json = COALESCE(excluded.dropped_json, dropped_json),
           device_id = COALESCE(excluded.device_id, device_id)`,
      )
      .run(
        id,
        input.account,
        input.name,
        input.realm,
        className,
        level,
        input.now,
        input.savedAt,
        input.dropped ? JSON.stringify(input.dropped) : null,
        input.deviceId ?? null,
      );
    return id;
  }

  private putSection(input: {
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
  }): "stored" | "unchanged" | "stale" {
    const previous = this.section(input.ownerKind, input.ownerId, input.name);
    if (previous && previous.hash === input.hash) return "unchanged";
    if (previous?.savedAt && input.savedAt && input.savedAt < previous.savedAt) return "stale";
    this.db
      .prepare(
        `INSERT INTO sections_latest
           (owner_kind, owner_id, section, v, hash, at, saved_at, updated_at, src, unknown, bytes, body_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_kind, owner_id, section) DO UPDATE SET
           v = excluded.v, hash = excluded.hash, at = excluded.at, saved_at = excluded.saved_at,
           updated_at = excluded.updated_at, src = excluded.src, unknown = excluded.unknown,
           bytes = excluded.bytes, body_json = excluded.body_json`,
      )
      .run(
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
    const change =
      previous && previous.v !== input.v
        ? { kind: "full" as const, body: input.body }
        : sectionChange(previous?.body ?? null, input.body);
    this.db
      .prepare(
        `INSERT INTO section_history (owner_kind, owner_id, section, at, saved_at, hash, kind, body_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ownerKind,
        input.ownerId,
        input.name,
        input.at ?? input.now,
        input.savedAt,
        input.hash,
        change.kind,
        JSON.stringify(change.body),
      );
    return "stored";
  }

  ingestSnapshot(
    snapshot: CleanSnapshot,
    deviceId?: string,
    now = Math.floor(Date.now() / 1000),
  ): SnapshotResult {
    return this.transaction(() => {
      const account = this.touchAccount(snapshot.account, now, snapshot.dropped.account);
      const charBody = snapshot.sections.find((s) => s.name === "char" && s.scope === "char")?.body;
      const character = this.touchCharacter({
        account,
        name: snapshot.character,
        realm: snapshot.realm,
        now,
        savedAt: snapshot.savedAt,
        char: charBody,
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
        const outcome = this.putSection({
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
        });
        if (outcome === "stored") result.stored.push(section.name);
        else if (outcome === "unchanged") result.unchanged.push(section.name);
        else result.stale = true;
        if (section.unknown) result.unknown.push(section.name);
      }
      return result;
    });
  }

  /** A 0.6 profile upload becomes the `profile` Section of that Character (D56). */
  ingestProfile(
    input: {
      character: string;
      realm: string;
      account: string;
      savedAt: number | null;
      profile: Raw;
      deviceId?: string;
    },
    now = Math.floor(Date.now() / 1000),
  ): { updated: boolean; savedAt: number | null; body: Raw } {
    return this.transaction(() => {
      const id = characterId(input.character, input.realm);
      const previous = this.section("char", id, "profile");
      if (previous?.savedAt && input.savedAt && input.savedAt < previous.savedAt) {
        return { updated: false, savedAt: previous.savedAt, body: previous.body };
      }
      const known = this.character(input.character, input.realm);
      const account = input.account
        ? this.touchAccount(input.account, now)
        : (known?.accountId ?? "");
      const body = previous ? mergeProfile(previous.body, input.profile) : input.profile;
      const context = isObject(body.context) ? body.context : {};
      this.touchCharacter({
        account,
        name: input.character,
        realm: input.realm,
        now,
        savedAt: input.savedAt,
        char: context,
        deviceId: input.deviceId,
      });
      const text = JSON.stringify(body);
      this.putSection({
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

  /** Moves the 0.6 `profiles` and `profile_snapshots` rows in once; they stay read-only (D57). */
  private backfill(): void {
    const done = this.db
      .prepare(`SELECT value FROM data_meta WHERE key = 'backfill_profiles'`)
      .get();
    if (done) return;
    const exists = (table: string) =>
      this.db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table);
    this.transaction(() => {
      if (exists("profile_snapshots")) {
        const snapshots = this.db
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
        for (const row of snapshots) this.backfillOne(row, row.at);
      }
      if (exists("profiles")) {
        const columns = this.db.prepare(`PRAGMA table_info(profiles)`).all() as { name: string }[];
        const hasAccount = columns.some((column) => column.name === "account");
        const rows = this.db
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
        for (const row of rows) this.backfillOne(row, row.updated_at);
      }
      this.db
        .prepare(`INSERT INTO data_meta (key, value) VALUES ('backfill_profiles', ?)`)
        .run(String(Math.floor(Date.now() / 1000)));
    });
  }

  private backfillOne(
    row: {
      account: string | null;
      character_name: string;
      realm: string;
      saved_at: number | null;
      body_json: string;
      device_id?: string;
    },
    at: number,
  ): void {
    const body = parse<Raw>(row.body_json);
    if (!body) return;
    const account = row.account ? this.touchAccount(row.account, at) : "";
    const id = this.touchCharacter({
      account,
      name: row.character_name,
      realm: row.realm,
      now: at,
      savedAt: row.saved_at,
      char: isObject(body.context) ? body.context : undefined,
      deviceId: row.device_id,
    });
    this.putSection({
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

  section(ownerKind: SectionScope, ownerId: string, name: string): SectionRow | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM sections_latest WHERE owner_kind = ? AND owner_id = ? AND section = ?`,
      )
      .get(ownerKind, ownerId, name) as SectionDbRow | undefined;
    return row ? sectionFromRow(row) : undefined;
  }

  sections(ownerKind: SectionScope, ownerId: string, names?: string[]): SectionRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sections_latest WHERE owner_kind = ? AND owner_id = ? ORDER BY section`,
      )
      .all(ownerKind, ownerId) as SectionDbRow[];
    return rows.map(sectionFromRow).filter((row) => !names?.length || names.includes(row.section));
  }

  accounts(): AccountRow[] {
    return (
      this.db.prepare(`SELECT * FROM accounts ORDER BY last_seen DESC`).all() as AccountDbRow[]
    ).map(accountFromRow);
  }

  account(id: string): AccountRow | undefined {
    const row = this.db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(accountId(id)) as
      | AccountDbRow
      | undefined;
    return row ? accountFromRow(row) : undefined;
  }

  characters(account?: string): CharacterRow[] {
    const rows = (
      account
        ? this.db
            .prepare(`SELECT * FROM characters WHERE account_id = ? ORDER BY last_seen DESC`)
            .all(accountId(account))
        : this.db.prepare(`SELECT * FROM characters ORDER BY last_seen DESC`).all()
    ) as CharacterDbRow[];
    return rows.map(characterFromRow);
  }

  /** The named character (realm optional), or the most recently seen one. */
  character(name?: string, realm?: string): CharacterRow | undefined {
    const row = (
      name
        ? this.db
            .prepare(
              `SELECT * FROM characters WHERE name = ? AND (? IS NULL OR realm = ?)
               ORDER BY last_seen DESC, COALESCE(saved_at, 0) DESC LIMIT 1`,
            )
            .get(name, realm ?? null, realm ?? null)
        : this.db
            .prepare(
              `SELECT * FROM characters ORDER BY last_seen DESC, COALESCE(saved_at, 0) DESC LIMIT 1`,
            )
            .get()
    ) as CharacterDbRow | undefined;
    return row ? characterFromRow(row) : undefined;
  }

  history(filter: {
    owners: { kind: SectionScope; id: string }[];
    sections?: string[];
    since?: number;
    savedAt?: number;
    limit: number;
  }): HistoryRow[] {
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
    const rows = this.db
      .prepare(
        `SELECT * FROM section_history WHERE ${where.join(" AND ")} ORDER BY at DESC, id DESC LIMIT ?`,
      )
      .all(...args, filter.limit) as HistoryDbRow[];
    return rows.map(historyFromRow);
  }

  lastChange(ownerKind: SectionScope, ownerId: string, name: string): HistoryRow | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM section_history WHERE owner_kind = ? AND owner_id = ? AND section = ?
         ORDER BY at DESC, id DESC LIMIT 1`,
      )
      .get(ownerKind, ownerId, name) as HistoryDbRow | undefined;
    return row ? historyFromRow(row) : undefined;
  }

  /** Latest Sections of a Character and its Account, by name (Character first). */
  sectionsFor(row: CharacterRow): Map<string, SectionRow> {
    const out = new Map<string, SectionRow>();
    if (row.accountId)
      for (const s of this.sections("account", row.accountId)) out.set(s.section, s);
    for (const s of this.sections("char", row.id)) out.set(s.section, s);
    return out;
  }

  /**
   * The Account digest for the Companion (D76): every other Character on the
   * same Account with its faction and professions, so Alt routing works for
   * Alts never logged in on this PC.
   */
  accountAlts(row: CharacterRow, limit = MAX_DIGEST_ALTS): DigestAlt[] {
    if (!row.accountId) return [];
    return this.characters(row.accountId)
      .filter((other) => other.id !== row.id)
      .slice(0, limit)
      .map((other) => {
        const char = this.section("char", other.id, "char")?.body ?? {};
        const legacy = this.section("char", other.id, "profile")?.body;
        const raw = this.section("char", other.id, "professions")?.body.list ?? legacy?.professions;
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
        return alt;
      });
  }

  /**
   * The player profile in its 0.6 shape for get_player_profile: the stored
   * 0.6 upload, with every 0.7 Section the Character has laid over it.
   */
  profileView(row: CharacterRow) {
    const all = this.sectionsFor(row);
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

  /** One row per Character for get_account_overview (D59). */
  overview(row: CharacterRow) {
    const all = this.sectionsFor(row);
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
    };
  }

  /** Which of `ids` each Character (or the Account) has, without loading whole sets (D59). */
  checkIds(kind: IdKind, ids: number[], characters: CharacterRow[]) {
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
        ? this.section("account", accountIds[0]!, scope.section)
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
        const section = this.section("char", row.id, charSection);
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

  private sectionInfo(row: SectionRow) {
    const counts: Raw = {};
    for (const [path, set] of packedSets(row.body)) counts[path] = unpackRows(set).length;
    const last = this.lastChange(row.ownerKind, row.ownerId, row.section);
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
      lastChange: last ? { at: last.at, ...changeSummary(last.kind, last.body) } : null,
    };
  }

  /** The Data explorer: every Account, Character and Section with sizes and the last change (D60). */
  catalog(filter: { account?: string } = {}) {
    const accounts = filter.account
      ? [this.account(filter.account)].filter((row): row is AccountRow => Boolean(row))
      : this.accounts();
    const loose = filter.account ? [] : this.characters().filter((row) => !row.accountId);
    const character = (row: CharacterRow) => {
      const sections = this.sections("char", row.id).map((s) => this.sectionInfo(s));
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
      };
    };
    return {
      knownSections: Object.keys(KNOWN_SECTIONS),
      accounts: [
        ...accounts.map((row) => {
          const sections = this.sections("account", row.id).map((s) => this.sectionInfo(s));
          return {
            account: row.id,
            label: row.label,
            firstSeen: row.firstSeen,
            lastSeen: row.lastSeen,
            dropped: row.dropped,
            bytes: sections.reduce((sum, s) => sum + s.bytes, 0),
            sections,
            characters: this.characters(row.id).map(character),
          };
        }),
        ...(loose.length
          ? [{ account: "", label: "", sections: [], characters: loose.map(character) }]
          : []),
      ],
    };
  }

  /** Owner-only erasure: every Section, history row and Character of one Account (D62). */
  deleteAccount(account: string): { characters: number; sections: number; history: number } {
    const id = accountId(account);
    return this.transaction(() => {
      const characters = this.characters(id).map((row) => row.id);
      const owners: [string, string][] = [
        ["account", id],
        ...characters.map((char) => ["char", char] as [string, string]),
      ];
      let sections = 0;
      let history = 0;
      for (const [kind, owner] of owners) {
        sections += Number(
          this.db
            .prepare(`DELETE FROM sections_latest WHERE owner_kind = ? AND owner_id = ?`)
            .run(kind, owner).changes,
        );
        history += Number(
          this.db
            .prepare(`DELETE FROM section_history WHERE owner_kind = ? AND owner_id = ?`)
            .run(kind, owner).changes,
        );
      }
      this.db.prepare(`DELETE FROM characters WHERE account_id = ?`).run(id);
      this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
      return { characters: characters.length, sections, history };
    });
  }
}
