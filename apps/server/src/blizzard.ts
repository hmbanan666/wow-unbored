import type { DatabaseSync } from "node:sqlite";

import type { Sql } from "./postgres.ts";

export type GameDataFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Token type to Game Data API document (packages/contracts/markup.md). Currency is not checked. */
const DOCUMENTS: Record<string, string> = {
  item: "item",
  quest: "quest",
  ach: "achievement",
  spell: "spell",
  npc: "creature",
  mount: "mount",
  pet: "pet",
};

const FOUND_TTL = 30 * 86_400;
/** A new patch can add an id, so a miss is asked again sooner. */
const MISSING_TTL = 86_400;
const MAX_LOOKUPS = 60;
const TIMEOUT_MS = 4000;

export type BlizzardConfig = { clientId: string; clientSecret: string; region: string };

export function blizzardFromEnv(env: NodeJS.ProcessEnv = process.env): BlizzardConfig | null {
  const clientId = env.BLIZZARD_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.BLIZZARD_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  const region = (env.BLIZZARD_REGION?.trim() || "us").toLowerCase();
  return { clientId, clientSecret, region: /^(us|eu|kr|tw)$/.test(region) ? region : "us" };
}

type IdRow = { found: number; checked_at: number };
type NameRow = { name: string | null; checked_at: number };

function idVerdict(row: IdRow | undefined, now: number): boolean | undefined {
  if (!row) return undefined;
  const ttl = row.found ? FOUND_TTL : MISSING_TTL;
  return now - row.checked_at < ttl ? row.found === 1 : undefined;
}

/** Which `type:id` exist (ADR 0034): SQLite by default, Postgres with DATABASE_URL (ADR 0057). */
export interface IdCache {
  get(kind: string, id: number, now: number): Promise<boolean | undefined>;
  put(kind: string, id: number, found: boolean, now: number): Promise<void>;
}

/** Creature names per locale (D154), in the same database as the id check. */
export interface NameCache {
  /** The cached row, fresh or not; name is null for a creature Blizzard does not know. */
  entry(
    npcID: number,
    locale: string,
  ): Promise<{ name: string | null; checkedAt: number } | undefined>;
  get(npcID: number, locale: string): Promise<string | undefined>;
  /** The known names of these creatures in one locale. */
  many(npcIDs: number[], locale: string): Promise<Map<number, string>>;
  put(npcID: number, locale: string, name: string | null, now: number): Promise<void>;
}

export class SqliteIdCache implements IdCache {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_ids (
        kind TEXT NOT NULL,
        id INTEGER NOT NULL,
        found INTEGER NOT NULL,
        checked_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      );
    `);
  }

  async get(kind: string, id: number, now: number): Promise<boolean | undefined> {
    const row = this.db
      .prepare(`SELECT found, checked_at FROM game_ids WHERE kind = ? AND id = ?`)
      .get(kind, id) as IdRow | undefined;
    return idVerdict(row, now);
  }

  async put(kind: string, id: number, found: boolean, now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO game_ids (kind, id, found, checked_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (kind, id) DO UPDATE SET found = excluded.found, checked_at = excluded.checked_at`,
      )
      .run(kind, id, found ? 1 : 0, now);
  }
}

export class PostgresIdCache implements IdCache {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async get(kind: string, id: number, now: number): Promise<boolean | undefined> {
    const [row] = await this.sql<IdRow[]>`
      SELECT found, checked_at FROM game_ids WHERE kind = ${kind} AND id = ${id}`;
    return idVerdict(row, now);
  }

  async put(kind: string, id: number, found: boolean, now: number): Promise<void> {
    await this.sql`
      INSERT INTO game_ids (kind, id, found, checked_at) VALUES (${kind}, ${id}, ${found ? 1 : 0}, ${now})
      ON CONFLICT (kind, id) DO UPDATE SET found = excluded.found, checked_at = excluded.checked_at`;
  }
}

export class SqliteNameCache implements NameCache {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS creature_names (
        npc_id INTEGER NOT NULL,
        locale TEXT NOT NULL,
        name TEXT,
        checked_at INTEGER NOT NULL,
        PRIMARY KEY (npc_id, locale)
      );
    `);
  }

  async entry(npcID: number, locale: string) {
    const row = this.db
      .prepare(`SELECT name, checked_at FROM creature_names WHERE npc_id = ? AND locale = ?`)
      .get(npcID, locale) as NameRow | undefined;
    return row ? { name: row.name, checkedAt: row.checked_at } : undefined;
  }

  async get(npcID: number, locale: string): Promise<string | undefined> {
    return (await this.entry(npcID, locale))?.name ?? undefined;
  }

  async many(npcIDs: number[], locale: string): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const read = this.db.prepare(
      `SELECT name FROM creature_names WHERE npc_id = ? AND locale = ? AND name IS NOT NULL`,
    );
    for (const npcID of new Set(npcIDs)) {
      const row = read.get(npcID, locale) as { name: string } | undefined;
      if (row) out.set(npcID, row.name);
    }
    return out;
  }

  async put(npcID: number, locale: string, name: string | null, now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO creature_names (npc_id, locale, name, checked_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (npc_id, locale) DO UPDATE SET name = excluded.name, checked_at = excluded.checked_at`,
      )
      .run(npcID, locale, name, now);
  }
}

export class PostgresNameCache implements NameCache {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async entry(npcID: number, locale: string) {
    const [row] = await this.sql<NameRow[]>`
      SELECT name, checked_at FROM creature_names WHERE npc_id = ${npcID} AND locale = ${locale}`;
    return row ? { name: row.name, checkedAt: row.checked_at } : undefined;
  }

  async get(npcID: number, locale: string): Promise<string | undefined> {
    return (await this.entry(npcID, locale))?.name ?? undefined;
  }

  async many(npcIDs: number[], locale: string): Promise<Map<number, string>> {
    const ids = [...new Set(npcIDs)];
    if (ids.length === 0) return new Map();
    const rows = await this.sql<{ npc_id: number; name: string }[]>`
      SELECT npc_id, name FROM creature_names
      WHERE locale = ${locale} AND name IS NOT NULL AND npc_id = ANY(${ids}::integer[])`;
    return new Map(rows.map((row) => [row.npc_id, row.name]));
  }

  async put(npcID: number, locale: string, name: string | null, now: number): Promise<void> {
    await this.sql`
      INSERT INTO creature_names (npc_id, locale, name, checked_at) VALUES (${npcID}, ${locale}, ${name}, ${now})
      ON CONFLICT (npc_id, locale) DO UPDATE SET name = excluded.name, checked_at = excluded.checked_at`;
  }
}

/**
 * Existence check for token ids against the Blizzard Game Data API (ADR 0034).
 * Off without credentials. Anything but a clear 404 counts as "exists", so an
 * outage never strips good links.
 */
export class BlizzardIds {
  private token: { value: string; until: number } | null = null;

  private config: BlizzardConfig | null;
  private cache: IdCache;
  private fetchImpl: GameDataFetch;
  private now: () => number;

  constructor(
    config: BlizzardConfig | null,
    cache: IdCache,
    fetchImpl: GameDataFetch = fetch,
    now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.config = config;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  describe(): string {
    return this.config
      ? `Blizzard id check on (${this.config.region})`
      : "Blizzard id check off: BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET are not set";
  }

  /** The `type:id` keys that do not exist. */
  async missing(keys: Iterable<string>): Promise<Set<string>> {
    const out = new Set<string>();
    if (!this.config) return out;
    const now = this.now();
    const ask: { key: string; kind: string; id: number }[] = [];
    for (const key of new Set(keys)) {
      const [kind, text] = key.split(":");
      const id = Number(text);
      if (!DOCUMENTS[kind] || !Number.isInteger(id)) continue;
      const cached = await this.cache.get(kind, id, now);
      if (cached === false) out.add(key);
      if (cached === undefined && ask.length < MAX_LOOKUPS) ask.push({ key, kind, id });
    }
    if (ask.length === 0) return out;
    const token = await this.accessToken();
    if (!token) return out;
    await Promise.all(
      ask.map(async ({ key, kind, id }) => {
        const found = await this.lookup(token, kind, id);
        if (found === undefined) return;
        await this.cache.put(kind, id, found, now);
        if (!found) out.add(key);
      }),
    );
    return out;
  }

  /**
   * Fills `names` with each creature's name per locale (D154), at most once a
   * month per name. Off without credentials; an error leaves the cache as it was.
   */
  async warmCreatureNames(names: NameCache, npcIDs: number[], locales: string[]): Promise<void> {
    if (!this.config) return;
    const now = this.now();
    const ask: { npcID: number; locale: string }[] = [];
    for (const npcID of new Set(npcIDs)) {
      for (const locale of locales) {
        const entry = await names.entry(npcID, locale);
        const ttl = entry?.name ? FOUND_TTL : MISSING_TTL;
        if ((!entry || now - entry.checkedAt >= ttl) && ask.length < MAX_LOOKUPS) {
          ask.push({ npcID, locale });
        }
      }
    }
    if (ask.length === 0) return;
    const token = await this.accessToken();
    if (!token) return;
    await Promise.all(
      ask.map(async ({ npcID, locale }) => {
        const result = await this.creature(token, npcID, locale);
        if (result !== undefined) await names.put(npcID, locale, result, now);
      }),
    );
  }

  private async creature(
    token: string,
    npcID: number,
    locale: string,
  ): Promise<string | null | undefined> {
    const region = this.config?.region ?? "us";
    const url = `https://${region}.api.blizzard.com/data/wow/creature/${npcID}?namespace=static-${region}&locale=${locale}`;
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return null;
      if (!response.ok) return undefined;
      const body = (await response.json()) as { name?: unknown };
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      return name || undefined;
    } catch {
      return undefined;
    }
  }

  private async accessToken(): Promise<string | null> {
    const config = this.config;
    if (!config) return null;
    if (this.token && this.token.until > this.now()) return this.token.value;
    try {
      const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
      const response = await this.fetchImpl("https://oauth.battle.net/token", {
        method: "POST",
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== "string") return null;
      const life = typeof body.expires_in === "number" ? body.expires_in : 3600;
      this.token = { value: body.access_token, until: this.now() + Math.max(60, life - 60) };
      return this.token.value;
    } catch {
      return null;
    }
  }

  private async lookup(token: string, kind: string, id: number): Promise<boolean | undefined> {
    const region = this.config?.region ?? "us";
    const url = `https://${region}.api.blizzard.com/data/wow/${DOCUMENTS[kind]}/${id}?namespace=static-${region}&locale=en_US`;
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return false;
      return response.ok ? true : undefined;
    } catch {
      return undefined;
    }
  }
}
