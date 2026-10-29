import { DatabaseSync } from "node:sqlite";

import { sqlitePath } from "./config.ts";
import {
  cleanPlan,
  cleanProgress,
  encodeUnb1,
  type Answer,
  type Plan,
  type RequestItem,
  type RequestType,
  type PlayerContext,
  type ProgressBody,
  type ProgressPost,
} from "./plan.ts";

import type { ProfileUpload } from "./profile.ts";

const PLAYER = "self";

export type StoredProfile = {
  character: string;
  realm: string;
  account: string;
  deviceId: string;
  savedAt: number | null;
  updatedAt: number;
  profile: Record<string, unknown>;
};

type ProfileRow = {
  character_name: string;
  realm: string;
  account: string | null;
  device_id: string;
  saved_at: number | null;
  updated_at: number;
  body_json: string;
};

function profileFromRow(row: ProfileRow): StoredProfile {
  return {
    character: row.character_name,
    realm: row.realm,
    account: row.account ?? "",
    deviceId: row.device_id,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    profile: JSON.parse(row.body_json) as Record<string, unknown>,
  };
}

export type StoredPlan = {
  id: number;
  createdAt: number;
  plan: Plan;
  unb1: string;
};

export type StoredProgress = {
  id: number;
  createdAt: number;
  account: string;
  realm: string;
  character: string;
  savedAt: number | null;
  progress: ProgressBody;
};

type PlanRow = { id: number; created_at: number; body_json: string; unb1: string };
type ProgressRow = {
  id: number;
  created_at: number;
  account: string;
  realm: string;
  character: string;
  saved_at: number | null;
  body_json: string;
};

export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    this.db = new DatabaseSync(sqlitePath(dataDir));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY,
        player_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        body_json TEXT NOT NULL,
        unb1 TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS progress (
        id INTEGER PRIMARY KEY,
        player_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        account TEXT NOT NULL,
        realm TEXT NOT NULL,
        character TEXT NOT NULL,
        saved_at INTEGER,
        body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        realm TEXT NOT NULL,
        mode TEXT NOT NULL,
        budget INTEGER NOT NULL,
        wish TEXT,
        status TEXT NOT NULL,
        reason TEXT,
        plan_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        character_name TEXT NOT NULL,
        realm TEXT NOT NULL,
        device_id TEXT NOT NULL,
        saved_at INTEGER,
        updated_at INTEGER NOT NULL,
        body_json TEXT NOT NULL,
        PRIMARY KEY (character_name, realm)
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        account TEXT NOT NULL DEFAULT '',
        character_name TEXT NOT NULL,
        realm TEXT NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT,
        body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_character ON history (character_name, realm, at);
      CREATE INDEX IF NOT EXISTS history_account ON history (account, at);
      CREATE TABLE IF NOT EXISTS profile_snapshots (
        id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        account TEXT NOT NULL DEFAULT '',
        character_name TEXT NOT NULL,
        realm TEXT NOT NULL,
        saved_at INTEGER,
        body_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS snapshots_character ON profile_snapshots (character_name, realm, at);
      CREATE TABLE IF NOT EXISTS advice (
        character_name TEXT NOT NULL,
        realm TEXT NOT NULL,
        account TEXT NOT NULL DEFAULT '',
        item_id INTEGER NOT NULL,
        body_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (character_name, realm, item_id)
      );
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        request_id TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        delivered_at INTEGER,
        next_at INTEGER,
        last_status INTEGER,
        last_error TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
    this.addColumns("profiles", [["account", "TEXT"]]);
    this.addColumns("requests", [
      ["context_json", "TEXT"],
      ["type", "TEXT NOT NULL DEFAULT 'plan'"],
      ["question", "TEXT"],
      ["topic", "TEXT"],
      ["item_json", "TEXT"],
      ["answer_json", "TEXT"],
      ["lang", "TEXT"],
      ["account", "TEXT"],
    ]);
  }

  private addColumns(table: string, added: [string, string][]): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    for (const [name, kind] of added) {
      if (!columns.some((column) => column.name === name)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${kind}`);
      }
    }
  }

  close(): void {
    this.db.close();
  }

  putPlan(raw: unknown, nowSeconds = Math.floor(Date.now() / 1000)): StoredPlan {
    const plan = cleanPlan(raw, nowSeconds);
    const unb1 = encodeUnb1(plan);
    const createdAt = nowSeconds;
    const result = this.db
      .prepare(
        `INSERT INTO plans (player_key, created_at, body_json, unb1)
         VALUES (?, ?, ?, ?)`,
      )
      .run(PLAYER, createdAt, JSON.stringify(plan), unb1);
    return { id: Number(result.lastInsertRowid), createdAt, plan, unb1 };
  }

  planById(id: number): StoredPlan | undefined {
    const row = this.db
      .prepare(`SELECT id, created_at, body_json, unb1 FROM plans WHERE id = ?`)
      .get(id) as PlanRow | undefined;
    return row ? this.planFromRow(row) : undefined;
  }

  latestPlan(): StoredPlan | undefined {
    const row = this.db
      .prepare(
        `SELECT id, created_at, body_json, unb1 FROM plans
         WHERE player_key = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(PLAYER) as PlanRow | undefined;
    return row ? this.planFromRow(row) : undefined;
  }

  listPlans(limit: number): StoredPlan[] {
    const rows = this.db
      .prepare(
        `SELECT id, created_at, body_json, unb1 FROM plans
         WHERE player_key = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(PLAYER, limit) as PlanRow[];
    return rows.map((row) => this.planFromRow(row));
  }

  addProgress(raw: unknown, nowSeconds = Math.floor(Date.now() / 1000)): StoredProgress {
    const post: ProgressPost = cleanProgress(raw);
    const result = this.db
      .prepare(
        `INSERT INTO progress
           (player_key, created_at, account, realm, character, saved_at, body_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        PLAYER,
        nowSeconds,
        post.account,
        post.realm,
        post.character,
        post.savedAt,
        JSON.stringify(post.progress),
      );
    this.addHistory({
      at: nowSeconds,
      account: accountKey(post.account),
      character: post.character,
      realm: post.realm,
      kind: "progress",
      ref: post.progress.currentId ?? null,
      body: {
        mode: post.progress.mode ?? null,
        currentId: post.progress.currentId ?? null,
        done: post.progress.done ?? [],
        skipped: post.progress.skipped ?? [],
        remaining: post.progress.remaining ?? [],
      },
    });
    return {
      id: Number(result.lastInsertRowid),
      createdAt: nowSeconds,
      account: post.account,
      realm: post.realm,
      character: post.character,
      savedAt: post.savedAt,
      progress: post.progress,
    };
  }

  latestProgress(filter?: {
    account?: string;
    realm?: string;
    character?: string;
  }): StoredProgress | undefined {
    const rows = this.progressRows(200);
    const match = rows.find((row) => this.matches(row, filter));
    return match ? this.progressFromRow(match) : undefined;
  }

  latestPerCharacter(): StoredProgress[] {
    const seen = new Set<string>();
    const out: StoredProgress[] = [];
    for (const row of this.progressRows(500)) {
      const key = `${row.account}\0${row.realm}\0${row.character}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(this.progressFromRow(row));
    }
    return out;
  }

  progressHistory(limit: number): StoredProgress[] {
    return this.progressRows(limit).map((row) => this.progressFromRow(row));
  }

  registerDevice(input: {
    id: string;
    name: string;
    secretHash: string;
    nowSeconds: number;
    pendingCap: number;
  }): RegisterDeviceResult {
    const existing = this.deviceById(input.id);
    if (existing) {
      if (existing.secretHash !== input.secretHash) {
        return { ok: false, status: 409, error: "This device id is already registered." };
      }
      this.touchDevice(existing.id, input.nowSeconds);
      return { ok: true, created: false, device: { ...existing, lastSeenAt: input.nowSeconds } };
    }
    const hashOwner = this.deviceByHash(input.secretHash);
    if (hashOwner) {
      return { ok: false, status: 409, error: "This device secret is already registered." };
    }
    const pending = this.db
      .prepare(`SELECT COUNT(*) AS n FROM devices WHERE status = 'pending'`)
      .get() as { n: number };
    if (pending.n >= input.pendingCap) {
      return { ok: false, status: 429, error: "Too many devices are waiting for approval." };
    }
    this.db
      .prepare(
        `INSERT INTO devices (id, name, secret_hash, status, created_at, last_seen_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(input.id, input.name, input.secretHash, input.nowSeconds, input.nowSeconds);
    const device = this.deviceById(input.id);
    if (!device) return { ok: false, status: 500, error: "Could not store the device." };
    return { ok: true, created: true, device };
  }

  findDeviceBySecretHash(secretHash: string): Device | undefined {
    return this.deviceByHash(secretHash);
  }

  touchDevice(id: string, nowSeconds = Math.floor(Date.now() / 1000)): void {
    this.db
      .prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`)
      .run(nowSeconds, id);
  }

  listDevices(): Device[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, secret_hash, status, created_at, last_seen_at
         FROM devices ORDER BY created_at DESC, id ASC`,
      )
      .all() as DeviceRow[];
    return rows.map(deviceFromRow);
  }

  setDeviceStatus(id: string, status: DeviceStatus, nowSeconds = Math.floor(Date.now() / 1000)): Device | undefined {
    const current = this.deviceById(id);
    if (!current) return undefined;
    this.db
      .prepare(`UPDATE devices SET status = ?, last_seen_at = ? WHERE id = ?`)
      .run(status, nowSeconds, id);
    return this.deviceById(id);
  }

  addRequest(input: {
    id: string;
    deviceId: string;
    character: string;
    realm: string;
    mode: string;
    budget: number;
    wish: string | null;
    type?: RequestType;
    question?: string | null;
    topic?: string | null;
    item?: RequestItem | null;
    context?: PlayerContext | null;
    lang?: string | null;
    account?: string | null;
    nowSeconds: number;
  }): { created: boolean; request: PlanRequest } {
    const existing = this.requestById(input.id);
    if (existing) return { created: false, request: existing };
    const account = input.account
      ? accountKey(input.account)
      : (this.profileFor(input.character, input.realm || undefined)?.account ?? "");
    this.db
      .prepare(
        `INSERT INTO requests
           (id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at,
            context_json, type, question, topic, item_json, lang, account)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.deviceId,
        input.character,
        input.realm,
        input.mode,
        input.budget,
        input.wish,
        input.nowSeconds,
        input.nowSeconds,
        input.context ? JSON.stringify(input.context) : null,
        input.type ?? "plan",
        input.question ?? null,
        input.topic ?? null,
        input.item ? JSON.stringify(input.item) : null,
        input.lang ?? null,
        account,
      );
    const request = this.requestById(input.id);
    if (!request) throw new Error("Could not store the request.");
    this.historyFor(request, "request", {
      type: request.type,
      mode: request.mode || null,
      wish: request.wish,
      question: request.question,
      topic: request.topic,
      item: request.item,
      lang: request.lang,
      context: request.context,
    });
    return { created: true, request };
  }

  webhookDelivery(requestId: string): WebhookDelivery | undefined {
    const row = this.db
      .prepare(
        `SELECT attempts, delivered_at, next_at, last_status, last_error, updated_at
         FROM webhook_deliveries WHERE request_id = ?`,
      )
      .get(requestId) as WebhookDeliveryRow | undefined;
    return row ? deliveryFromRow(row) : undefined;
  }

  recordWebhookAttempt(
    requestId: string,
    outcome: { ok: boolean; status: number | null; error: string | null; nextAt: number | null },
    nowSeconds = Math.floor(Date.now() / 1000),
  ): WebhookDelivery {
    const attempts = (this.webhookDelivery(requestId)?.attempts ?? 0) + 1;
    this.db
      .prepare(
        `INSERT INTO webhook_deliveries (request_id, attempts, delivered_at, next_at, last_status, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (request_id) DO UPDATE SET
           attempts = excluded.attempts, delivered_at = excluded.delivered_at, next_at = excluded.next_at,
           last_status = excluded.last_status, last_error = excluded.last_error, updated_at = excluded.updated_at`,
      )
      .run(
        requestId,
        attempts,
        outcome.ok ? nowSeconds : null,
        outcome.ok ? null : outcome.nextAt,
        outcome.status,
        outcome.ok ? null : outcome.error,
        nowSeconds,
      );
    const delivery = this.webhookDelivery(requestId);
    if (!delivery) throw new Error("Could not store the webhook attempt.");
    return delivery;
  }

  /** Pending requests the planner has not been told about yet and whose retry is due. */
  webhookDue(input: { nowSeconds: number; sinceSeconds: number; maxAttempts: number; limit?: number }): PlanRequest[] {
    const rows = this.db
      .prepare(
        `SELECT r.id FROM requests r LEFT JOIN webhook_deliveries w ON w.request_id = r.id
         WHERE r.status = 'pending' AND r.created_at >= ? AND w.delivered_at IS NULL
           AND COALESCE(w.attempts, 0) < ? AND COALESCE(w.next_at, 0) <= ?
         ORDER BY r.created_at ASC, r.id ASC LIMIT ?`,
      )
      .all(input.sinceSeconds, input.maxAttempts, input.nowSeconds, input.limit ?? 20) as { id: string }[];
    return rows
      .map((row) => this.requestById(row.id))
      .filter((request): request is PlanRequest => request !== undefined);
  }

  listRequests(status = "pending", limit = 50): PlanRequest[] {
    const rows = this.db
      .prepare(
        `SELECT id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account
         FROM requests WHERE status = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
      )
      .all(status, limit) as RequestRow[];
    return rows.map(requestFromRow);
  }

  requestById(id: string): PlanRequest | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account
         FROM requests WHERE id = ?`,
      )
      .get(id) as RequestRow | undefined;
    return row ? requestFromRow(row) : undefined;
  }

  latestRequestForDevice(deviceId: string): PlanRequest | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account
         FROM requests WHERE device_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1`,
      )
      .get(deviceId) as RequestRow | undefined;
    return row ? requestFromRow(row) : undefined;
  }

  fulfillRequest(id: string, planId: number, nowSeconds = Math.floor(Date.now() / 1000)): PlanRequest | undefined {
    if (!this.requestById(id)) return undefined;
    this.db
      .prepare(
        `UPDATE requests SET status = 'fulfilled', plan_id = ?, reason = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(planId, nowSeconds, id);
    const request = this.requestById(id);
    if (request) this.historyFor(request, "plan", { planId, ...this.planSummary(planId) }, nowSeconds);
    return request;
  }

  answerRequest(
    id: string,
    answer: Answer,
    planId: number | null,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): PlanRequest | undefined {
    if (!this.requestById(id)) return undefined;
    this.db
      .prepare(
        `UPDATE requests SET status = 'fulfilled', answer_json = ?, plan_id = COALESCE(?, plan_id), reason = NULL,
           updated_at = ? WHERE id = ?`,
      )
      .run(JSON.stringify(answer), planId, nowSeconds, id);
    const request = this.requestById(id);
    if (request) {
      this.historyFor(request, "answer", { message: answer.message, waypoints: answer.waypoints ?? null }, nowSeconds);
      if (planId) this.historyFor(request, "plan", { planId, ...this.planSummary(planId) }, nowSeconds);
    }
    return request;
  }

  failRequest(id: string, reason: string, nowSeconds = Math.floor(Date.now() / 1000)): PlanRequest | undefined {
    if (!this.requestById(id)) return undefined;
    this.db
      .prepare(`UPDATE requests SET status = 'failed', reason = ?, updated_at = ? WHERE id = ?`)
      .run(reason, nowSeconds, id);
    const request = this.requestById(id);
    if (request) this.historyFor(request, "failed", { reason }, nowSeconds);
    return request;
  }

  /**
   * One row per character: the newest upload wins, an older savedAt is ignored,
   * and an empty field never overwrites a good one (docs/adr/0020).
   */
  putProfile(
    input: ProfileUpload & { deviceId: string },
    nowSeconds = Math.floor(Date.now() / 1000),
  ): { profile: StoredProfile; updated: boolean } {
    const existing = this.exactProfile(input.character, input.realm);
    if (existing && existing.savedAt && input.savedAt && input.savedAt < existing.savedAt) {
      return { profile: existing, updated: false };
    }
    const merged = existing ? mergeProfile(existing.profile, input.profile) : input.profile;
    const account = accountKey(input.account || existing?.account || "");
    this.db
      .prepare(
        `INSERT INTO profiles (character_name, realm, device_id, saved_at, updated_at, body_json, account)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (character_name, realm) DO UPDATE SET
           device_id = excluded.device_id, saved_at = excluded.saved_at,
           updated_at = excluded.updated_at, body_json = excluded.body_json, account = excluded.account`,
      )
      .run(input.character, input.realm, input.deviceId, input.savedAt, nowSeconds, JSON.stringify(merged), account);
    if (!existing || existing.savedAt !== input.savedAt) {
      this.db
        .prepare(
          `INSERT INTO profile_snapshots (at, account, character_name, realm, saved_at, body_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(nowSeconds, account, input.character, input.realm, input.savedAt, JSON.stringify(merged));
      this.addHistory({
        at: nowSeconds,
        account,
        character: input.character,
        realm: input.realm,
        kind: "profile",
        ref: input.savedAt === null ? null : String(input.savedAt),
        body: profileSummary(merged),
      });
    }
    return { profile: this.exactProfile(input.character, input.realm)!, updated: true };
  }

  private exactProfile(character: string, realm: string): StoredProfile | undefined {
    const row = this.db
      .prepare(
        `SELECT character_name, realm, account, device_id, saved_at, updated_at, body_json FROM profiles
         WHERE character_name = ? AND realm = ?`,
      )
      .get(character, realm) as ProfileRow | undefined;
    return row ? profileFromRow(row) : undefined;
  }

  /** Every character of one Account (docs/adr/0021). */
  profilesForAccount(account: string): StoredProfile[] {
    const rows = this.db
      .prepare(
        `SELECT character_name, realm, account, device_id, saved_at, updated_at, body_json FROM profiles
         WHERE account = ? ORDER BY updated_at DESC`,
      )
      .all(accountKey(account)) as ProfileRow[];
    return rows.map(profileFromRow);
  }

  listAccounts(): { account: string; characters: { character: string; realm: string }[] }[] {
    const rows = this.db
      .prepare(`SELECT account, character_name, realm FROM profiles ORDER BY account, character_name`)
      .all() as { account: string | null; character_name: string; realm: string }[];
    const out = new Map<string, { character: string; realm: string }[]>();
    for (const row of rows) {
      const key = row.account ?? "";
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push({ character: row.character_name, realm: row.realm });
    }
    return [...out.entries()].map(([account, characters]) => ({ account, characters }));
  }

  addHistory(entry: {
    at: number;
    account: string;
    character: string;
    realm: string;
    kind: HistoryKind;
    ref: string | null;
    body: unknown;
  }): void {
    this.db
      .prepare(
        `INSERT INTO history (at, account, character_name, realm, kind, ref, body_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entry.at, entry.account, entry.character, entry.realm, entry.kind, entry.ref, JSON.stringify(entry.body));
  }

  private historyFor(request: PlanRequest, kind: HistoryKind, body: unknown, at = request.updatedAt): void {
    this.addHistory({
      at,
      account: request.account,
      character: request.character,
      realm: request.realm,
      kind,
      ref: request.id,
      body,
    });
  }

  private planSummary(planId: number): Record<string, unknown> {
    const stored = this.planById(planId);
    if (!stored) return {};
    return {
      mode: stored.plan.mode,
      note: stored.plan.note ?? null,
      steps: stored.plan.tasks.map((task) => ({ id: task.id, title: task.title })),
    };
  }

  /** Dated Player history, newest first (docs/adr/0020). */
  history(filter: {
    account?: string;
    character?: string;
    realm?: string;
    kinds?: HistoryKind[];
    since?: number;
    limit: number;
  }): HistoryEntry[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.account) {
      where.push("account = ?");
      args.push(accountKey(filter.account));
    }
    if (filter.character) {
      where.push("character_name = ?");
      args.push(filter.character);
    }
    if (filter.realm) {
      where.push("realm = ?");
      args.push(filter.realm);
    }
    if (filter.since) {
      where.push("at >= ?");
      args.push(filter.since);
    }
    if (filter.kinds?.length) {
      where.push(`kind IN (${filter.kinds.map(() => "?").join(", ")})`);
      args.push(...filter.kinds);
    }
    const rows = this.db
      .prepare(
        `SELECT id, at, account, character_name, realm, kind, ref, body_json FROM history
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, id DESC LIMIT ?`,
      )
      .all(...args, filter.limit) as HistoryRow[];
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      account: row.account,
      character: row.character_name,
      realm: row.realm,
      kind: row.kind as HistoryKind,
      ref: row.ref,
      body: parseJson<unknown>(row.body_json),
    }));
  }

  profileSnapshots(filter: { account?: string; character?: string; realm?: string; limit: number }): {
    at: number;
    account: string;
    character: string;
    realm: string;
    savedAt: number | null;
    profile: unknown;
  }[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.account) {
      where.push("account = ?");
      args.push(accountKey(filter.account));
    }
    if (filter.character) {
      where.push("character_name = ?");
      args.push(filter.character);
    }
    if (filter.realm) {
      where.push("realm = ?");
      args.push(filter.realm);
    }
    const rows = this.db
      .prepare(
        `SELECT at, account, character_name, realm, saved_at, body_json FROM profile_snapshots
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, id DESC LIMIT ?`,
      )
      .all(...args, filter.limit) as {
      at: number;
      account: string;
      character_name: string;
      realm: string;
      saved_at: number | null;
      body_json: string;
    }[];
    return rows.map((row) => ({
      at: row.at,
      account: row.account,
      character: row.character_name,
      realm: row.realm,
      savedAt: row.saved_at,
      profile: parseJson<unknown>(row.body_json),
    }));
  }

  /** Personal advice for one character (docs/adr/0019). */
  putItemAdvice(input: {
    character: string;
    realm: string;
    account?: string;
    items: ItemAdvice[];
    replace?: boolean;
    nowSeconds?: number;
  }): number {
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    const account = accountKey(input.account || this.exactProfile(input.character, input.realm)?.account || "");
    if (input.replace) {
      this.db
        .prepare(`DELETE FROM advice WHERE character_name = ? AND realm = ?`)
        .run(input.character, input.realm);
    }
    const insert = this.db.prepare(
      `INSERT INTO advice (character_name, realm, account, item_id, body_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (character_name, realm, item_id) DO UPDATE SET
         account = excluded.account, body_json = excluded.body_json, updated_at = excluded.updated_at`,
    );
    for (const item of input.items) {
      const { itemID, ...body } = item;
      insert.run(input.character, input.realm, account, itemID, JSON.stringify(body), now);
    }
    this.addHistory({
      at: now,
      account,
      character: input.character,
      realm: input.realm,
      kind: "advice",
      ref: null,
      body: { count: input.items.length, replace: Boolean(input.replace) },
    });
    return input.items.length;
  }

  /** Advice for every character this device uploaded a profile for. */
  adviceForDevice(deviceId: string): { character: string; realm: string; updatedAt: number; items: ItemAdvice[] }[] {
    const rows = this.db
      .prepare(
        `SELECT a.character_name, a.realm, a.item_id, a.body_json, a.updated_at FROM advice a
         JOIN profiles p ON p.character_name = a.character_name AND p.realm = a.realm
         WHERE p.device_id = ? OR ? = 'legacy' ORDER BY a.character_name, a.realm, a.item_id`,
      )
      .all(deviceId, deviceId) as {
      character_name: string;
      realm: string;
      item_id: number;
      body_json: string;
      updated_at: number;
    }[];
    const out = new Map<string, { character: string; realm: string; updatedAt: number; items: ItemAdvice[] }>();
    for (const row of rows) {
      const key = `${row.realm}\0${row.character_name}`;
      if (!out.has(key)) out.set(key, { character: row.character_name, realm: row.realm, updatedAt: 0, items: [] });
      const entry = out.get(key)!;
      entry.updatedAt = Math.max(entry.updatedAt, row.updated_at);
      entry.items.push({ itemID: row.item_id, ...(parseJson<Omit<ItemAdvice, "itemID">>(row.body_json) ?? {}) } as ItemAdvice);
    }
    return [...out.values()];
  }

  /** The named character, or the most recently updated one. */
  profileFor(character?: string, realm?: string): StoredProfile | undefined {
    const row = (
      character
        ? this.db
            .prepare(
              `SELECT character_name, realm, account, device_id, saved_at, updated_at, body_json FROM profiles
               WHERE character_name = ? AND (? IS NULL OR realm = ?) ORDER BY updated_at DESC, COALESCE(saved_at, 0) DESC LIMIT 1`,
            )
            .get(character, realm ?? null, realm ?? null)
        : this.db
            .prepare(
              `SELECT character_name, realm, account, device_id, saved_at, updated_at, body_json FROM profiles
               ORDER BY updated_at DESC, COALESCE(saved_at, 0) DESC LIMIT 1`,
            )
            .get()
    ) as ProfileRow | undefined;
    return row ? profileFromRow(row) : undefined;
  }

  listProfiles(): Omit<StoredProfile, "profile">[] {
    const rows = this.db
      .prepare(
        `SELECT character_name, realm, account, device_id, saved_at, updated_at, '{}' AS body_json FROM profiles
         ORDER BY updated_at DESC, COALESCE(saved_at, 0) DESC`,
      )
      .all() as ProfileRow[];
    return rows.map((row) => {
      const { profile: _, ...summary } = profileFromRow(row);
      return summary;
    });
  }

  private deviceById(id: string): Device | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, secret_hash, status, created_at, last_seen_at FROM devices WHERE id = ?`,
      )
      .get(id) as DeviceRow | undefined;
    return row ? deviceFromRow(row) : undefined;
  }

  private deviceByHash(secretHash: string): Device | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, secret_hash, status, created_at, last_seen_at FROM devices WHERE secret_hash = ?`,
      )
      .get(secretHash) as DeviceRow | undefined;
    return row ? deviceFromRow(row) : undefined;
  }

  private progressRows(limit: number): ProgressRow[] {
    return this.db
      .prepare(
        `SELECT id, created_at, account, realm, character, saved_at, body_json
         FROM progress WHERE player_key = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(PLAYER, limit) as ProgressRow[];
  }

  private matches(
    row: ProgressRow,
    filter?: { account?: string; realm?: string; character?: string },
  ): boolean {
    if (!filter) return true;
    if (filter.account && row.account !== filter.account) return false;
    if (filter.realm && row.realm !== filter.realm) return false;
    if (filter.character && row.character !== filter.character) return false;
    return true;
  }

  private planFromRow(row: PlanRow): StoredPlan {
    return {
      id: row.id,
      createdAt: row.created_at,
      plan: JSON.parse(row.body_json) as Plan,
      unb1: row.unb1,
    };
  }

  private progressFromRow(row: ProgressRow): StoredProgress {
    return {
      id: row.id,
      createdAt: row.created_at,
      account: row.account,
      realm: row.realm,
      character: row.character,
      savedAt: row.saved_at,
      progress: JSON.parse(row.body_json) as ProgressBody,
    };
  }
}

export type DeviceStatus = "pending" | "approved" | "revoked";

export type Device = {
  id: string;
  name: string;
  secretHash: string;
  status: DeviceStatus;
  createdAt: number;
  lastSeenAt: number | null;
};

export type RegisterDeviceResult =
  | { ok: true; created: boolean; device: Device }
  | { ok: false; status: 409 | 429 | 500; error: string };

type DeviceRow = {
  id: string;
  name: string;
  secret_hash: string;
  status: string;
  created_at: number;
  last_seen_at: number | null;
};

function deviceFromRow(row: DeviceRow): Device {
  const status: DeviceStatus =
    row.status === "approved" || row.status === "revoked" ? row.status : "pending";
  return {
    id: row.id,
    name: row.name,
    secretHash: row.secret_hash,
    status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export type RequestStatus = "pending" | "fulfilled" | "failed";

export type WebhookDelivery = {
  attempts: number;
  deliveredAt: number | null;
  nextAt: number | null;
  lastStatus: number | null;
  lastError: string | null;
  updatedAt: number;
};

type WebhookDeliveryRow = {
  attempts: number;
  delivered_at: number | null;
  next_at: number | null;
  last_status: number | null;
  last_error: string | null;
  updated_at: number;
};

function deliveryFromRow(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    attempts: row.attempts,
    deliveredAt: row.delivered_at,
    nextAt: row.next_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export type PlanRequest = {
  id: string;
  deviceId: string;
  character: string;
  realm: string;
  mode: string;
  budget: number;
  wish: string | null;
  status: RequestStatus;
  reason: string | null;
  planId: number | null;
  createdAt: number;
  updatedAt: number;
  context: PlayerContext | null;
  type: RequestType;
  question: string | null;
  topic: string | null;
  item: RequestItem | null;
  answer: Answer | null;
  lang: string | null;
  account: string;
};

type RequestRow = {
  id: string;
  device_id: string;
  character_name: string;
  realm: string;
  mode: string;
  budget: number;
  wish: string | null;
  status: string;
  reason: string | null;
  plan_id: number | null;
  created_at: number;
  updated_at: number;
  context_json: string | null;
  type: string | null;
  question: string | null;
  topic: string | null;
  item_json: string | null;
  answer_json: string | null;
  lang: string | null;
  account: string | null;
};

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function requestFromRow(row: RequestRow): PlanRequest {
  const status: RequestStatus =
    row.status === "fulfilled" || row.status === "failed" ? row.status : "pending";
  return {
    id: row.id,
    deviceId: row.device_id,
    character: row.character_name,
    realm: row.realm,
    mode: row.mode,
    budget: row.budget,
    wish: row.wish,
    status,
    reason: row.reason,
    planId: row.plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    context: parseJson<PlayerContext>(row.context_json),
    type: row.type === "item" || row.type === "question" ? row.type : "plan",
    question: row.question,
    topic: row.topic,
    item: parseJson<RequestItem>(row.item_json),
    answer: parseJson<Answer>(row.answer_json),
    lang: row.lang,
    account: row.account ?? "",
  };
}

export function publicRequest(request: PlanRequest) {
  return {
    id: request.id,
    deviceId: request.deviceId,
    character: request.character,
    realm: request.realm,
    mode: request.mode,
    budget: request.budget,
    wish: request.wish,
    status: request.status,
    reason: request.reason,
    reasonCode: request.status === "failed" ? "planner_failed" : null,
    planId: request.planId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    context: request.context,
    type: request.type,
    question: request.question,
    topic: request.topic,
    item: request.item,
    answer: request.answer,
    lang: request.lang,
    account: request.account || null,
  };
}

export function publicDevice(device: Device) {
  return {
    id: device.id,
    name: device.name,
    status: device.status,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
  };
}

export function sessionSummary(stored: StoredPlan) {
  return {
    id: stored.id,
    createdAt: stored.createdAt,
    mode: stored.plan.mode,
    budget: stored.plan.budget,
    note: stored.plan.note ?? null,
    taskCount: stored.plan.tasks.length,
    unb1: stored.unb1,
  };
}

export type HistoryKind = "request" | "answer" | "plan" | "failed" | "progress" | "profile" | "advice";
export const HISTORY_KINDS: HistoryKind[] = ["request", "answer", "plan", "failed", "progress", "profile", "advice"];

export type HistoryEntry = {
  id: number;
  at: number;
  account: string;
  character: string;
  realm: string;
  kind: HistoryKind;
  ref: string | null;
  body: unknown;
};

type HistoryRow = {
  id: number;
  at: number;
  account: string;
  character_name: string;
  realm: string;
  kind: string;
  ref: string | null;
  body_json: string;
};

export type ItemAdvice = {
  itemID: number;
  /** keep, sell, use, bank, send, disenchant, equip, open, turn_in, or info. */
  action: string;
  /** The tooltip line after "Wisp: ", in English. */
  line: string;
  /** The same line in Russian. */
  lineRu?: string;
  /** For action "send": the Alt who should get it. */
  to?: string;
};

/**
 * The WoW account folder ("12345678#1") names one game license; the part before
 * "#" is the same for every license of one Battle.net account, so it is the key.
 */
export function accountKey(account: string): string {
  return account.trim().split("#")[0] ?? "";
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || value === 0) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The new upload wins field by field, except where it is empty and the old one is not. */
export function mergeProfile(old: Record<string, unknown>, fresh: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...old };
  for (const [key, value] of Object.entries(fresh)) {
    const previous = old[key];
    if (isPlainObject(value) && isPlainObject(previous)) {
      out[key] = mergeProfile(previous, value);
    } else if (isEmpty(value) && !isEmpty(previous)) {
      out[key] = previous;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function profileSummary(profile: Record<string, unknown>): Record<string, unknown> {
  const context = isPlainObject(profile.context) ? profile.context : {};
  const bags = profile.bags;
  return {
    level: context.level ?? null,
    ilvl: context.ilvl ?? null,
    gold: context.gold ?? null,
    zone: context.zone ?? null,
    bagItems: Array.isArray(bags) ? bags.length : isPlainObject(bags) ? Object.keys(bags).length : 0,
    collections: isPlainObject(profile.collections) ? profile.collections : null,
    professions: profile.professions ?? null,
  };
}
