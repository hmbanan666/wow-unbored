import { DatabaseSync } from "node:sqlite";

import { sqlitePath } from "./config.ts";
import {
  cleanPlan,
  cleanProgress,
  encodeUnb1,
  PlanError,
  type Answer,
  type MarkupCheck,
  type Plan,
  type RequestItem,
  type RequestSuggestion,
  type RequestType,
  type PlayerContext,
  type ProgressBody,
  type ProgressPost,
} from "./plan.ts";

import {
  PostgresIdCache,
  PostgresNameCache,
  SqliteIdCache,
  SqliteNameCache,
  type IdCache,
  type NameCache,
} from "./blizzard.ts";
import {
  DataStore,
  historyAt,
  type DigestAlt,
  type SectionRow,
  mergeProfile,
  type CleanSnapshot,
  type SectionChange,
  type SnapshotResult,
} from "./data.ts";
import type { Holdings } from "./holdings.ts";
import type { ProfileUpload } from "./profile.ts";
import type { Sql } from "./postgres.ts";
import { fromJson, PostgresDb, SqliteDb, type Db } from "./db.ts";
import { SuggestionStore } from "./suggestions.ts";
import { UploadInbox } from "./inbox.ts";
import { readyNow, type ReadyNow } from "./ready.ts";
import { computeTaste, requestCategory, type TasteRow } from "./taste.ts";
import {
  addedIds,
  planTargets,
  removedIds,
  WIN_PLAN_DAYS,
  WIN_SECTIONS,
  winSummary,
  type WinEntry,
  type WinKind,
  type WinTarget,
} from "./wins.ts";
import { unpackIds } from "@unbored/contracts";

export { mergeProfile };

const PLAYER = "self";

export const REQUEST_TIMEOUT_SECONDS = 60 * 60;
export const ETA_DEFAULT_SECONDS = 180;
export const ETA_MIN_SECONDS = 60;
export const ETA_MAX_SECONDS = 900;
const ETA_MIN_SAMPLES = 3;

export type StoredProfile = {
  character: string;
  realm: string;
  account: string;
  deviceId: string;
  savedAt: number | null;
  updatedAt: number;
  profile: Record<string, unknown>;
};

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

type PlanRow = { id: number; created_at: number; body_json: unknown; unb1: string };
type ProgressRow = {
  id: number;
  created_at: number;
  account: string;
  realm: string;
  character: string;
  saved_at: number | null;
  body_json: unknown;
};

const SQLITE_SCHEMA = `
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
    `;

export class Store {
  readonly db: Db;
  readonly data: DataStore;
  readonly suggestions: SuggestionStore;
  readonly gameIds: IdCache;
  readonly creatureNames: NameCache;
  /** The upload inbox and its worker (ADR 0057 step 4); Postgres only. */
  readonly inbox: UploadInbox | undefined;

  /**
   * Without `postgres` the Server keeps every table in the SQLite file in
   * `dataDir`. With it (DATABASE_URL, ADR 0057) every table is in Postgres and
   * the SQLite file is not opened. The caller owns the pool.
   */
  constructor(dataDir: string, options: { postgres?: Sql; log?: (line: string) => void } = {}) {
    const pg = options.postgres;
    let inbox: UploadInbox | undefined;
    if (pg) {
      const db = new PostgresDb(pg);
      this.db = db;
      inbox = new UploadInbox(this, db, pg, options.log);
      this.gameIds = new PostgresIdCache(pg);
      this.creatureNames = new PostgresNameCache(pg);
    } else {
      const raw = new DatabaseSync(sqlitePath(dataDir));
      prepareSqlite(raw);
      this.db = new SqliteDb(raw);
      this.gameIds = new SqliteIdCache(raw);
      this.creatureNames = new SqliteNameCache(raw);
    }
    this.data = new DataStore(this.db);
    this.suggestions = new SuggestionStore(this.db, this.data, this.creatureNames);
    this.inbox = inbox;
  }

  close(): void {
    void this.inbox?.stop();
    this.suggestions.close();
    this.db.close();
  }

  /**
   * Read barrier (ADR 0057): on Postgres, waits up to 10 s until the Account
   * (any Account without one) has no queued upload, so a Request or a planner
   * read sees the save that came just before. SQLite ingests inline: no wait.
   */
  async settle(account?: string): Promise<boolean> {
    return this.inbox ? this.inbox.settle(account || undefined) : true;
  }

  /** Runs `work` in one transaction; every Store call inside it joins (db.ts). */
  tx<T>(work: () => Promise<T>): Promise<T> {
    return this.db.tx(work);
  }

  /**
   * A write on behalf of a Companion device: the device is checked approved in
   * the same transaction as the write, so Forget my data or an owner revoke
   * cannot land between the check and the write. Undefined when it is not.
   * On Postgres the device row is held FOR SHARE; Forget takes it FOR UPDATE.
   */
  asDevice<T>(deviceId: string, work: () => Promise<T>): Promise<T | undefined> {
    return this.db.tx(async () => {
      if (deviceId !== "legacy") {
        const row = await this.db.get<{ status: string }>(
          `SELECT status FROM devices WHERE id = ?${this.db.pg ? " FOR SHARE" : ""}`,
          deviceId,
        );
        if (row?.status !== "approved") return undefined;
      }
      return work();
    });
  }

  async putPlan(
    raw: unknown,
    nowSeconds = Math.floor(Date.now() / 1000),
    check: MarkupCheck = {},
    requestId?: string,
  ): Promise<StoredPlan> {
    const plan = cleanPlan(raw, nowSeconds, check);
    const unb1 = encodeUnb1(plan);
    const createdAt = nowSeconds;
    return this.db.tx(async () => {
      // Async validation may have yielded to Forget my data. Check in the same
      // transaction as the insert and never insert a private Plan as direct.
      if (requestId && !(await this.lockRequest(requestId, "share")))
        throw new PlanError("No request with that id.");
      const row = await this.db.get<{ id: number }>(
        `INSERT INTO plans (player_key, created_at, ${this.db.body}, unb1, generated_at, request_id)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        PLAYER,
        createdAt,
        JSON.stringify(plan),
        unb1,
        plan.generatedAt,
        requestId ?? null,
      );
      return { id: Number(row!.id), createdAt, plan, unb1 };
    });
  }

  /** The Request row, held until the transaction ends on Postgres (share: a Plan for it; update: erase it). */
  private async lockRequest(
    id: string,
    mode: "share" | "update",
  ): Promise<{ plan_id: number | null } | undefined> {
    const lock = this.db.pg ? (mode === "share" ? " FOR SHARE" : " FOR UPDATE") : "";
    return this.db.get<{ plan_id: number | null }>(
      `SELECT plan_id FROM requests WHERE id = ?${lock}`,
      id,
    );
  }

  async planById(id: number): Promise<StoredPlan | undefined> {
    const row = await this.db.get<PlanRow>(
      `SELECT id, created_at, ${this.db.body} AS body_json, unb1 FROM plans WHERE id = ?`,
      id,
    );
    return row ? planFromRow(row) : undefined;
  }

  async latestPlan(): Promise<StoredPlan | undefined> {
    const row = await this.db.get<PlanRow>(
      `SELECT id, created_at, ${this.db.body} AS body_json, unb1 FROM plans
       WHERE player_key = ? ORDER BY id DESC LIMIT 1`,
      PLAYER,
    );
    return row ? planFromRow(row) : undefined;
  }

  /** Direct Plans plus Plans for this Device's Requests (ADR 0002). */
  async latestPlanForDevice(deviceId: string): Promise<StoredPlan | undefined> {
    const row = await this.db.get<PlanRow>(
      `SELECT p.id, p.created_at, p.${this.db.body} AS body_json, p.unb1 FROM plans p
       LEFT JOIN requests r ON r.id = p.request_id
       WHERE p.player_key = ? AND (p.request_id IS NULL OR r.device_id = ?)
       ORDER BY p.id DESC LIMIT 1`,
      PLAYER,
      deviceId,
    );
    return row ? planFromRow(row) : undefined;
  }

  async listPlans(limit: number): Promise<StoredPlan[]> {
    const rows = await this.db.all<PlanRow>(
      `SELECT id, created_at, ${this.db.body} AS body_json, unb1 FROM plans
       WHERE player_key = ? ORDER BY id DESC LIMIT ?`,
      PLAYER,
      limit,
    );
    return rows.map(planFromRow);
  }

  async addProgress(
    raw: unknown,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<StoredProgress> {
    const post: ProgressPost = cleanProgress(raw);
    return this.db.tx(async () => {
      post.account = await this.bindAccount(post.account, legacyOf(raw));
      const row = await this.db.get<{ id: number }>(
        `INSERT INTO progress
           (player_key, created_at, account, realm, character, saved_at, ${this.db.body})
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        PLAYER,
        nowSeconds,
        post.account,
        post.realm,
        post.character,
        post.savedAt,
        JSON.stringify(post.progress),
      );
      await this.addHistory({
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
        id: Number(row!.id),
        createdAt: nowSeconds,
        account: post.account,
        realm: post.realm,
        character: post.character,
        savedAt: post.savedAt,
        progress: post.progress,
      };
    });
  }

  async latestProgress(filter?: {
    account?: string;
    realm?: string;
    character?: string;
  }): Promise<StoredProgress | undefined> {
    const rows = await this.progressRows(200);
    const match = rows.find((row) => matches(row, filter));
    return match ? progressFromRow(match) : undefined;
  }

  async latestPerCharacter(): Promise<StoredProgress[]> {
    const seen = new Set<string>();
    const out: StoredProgress[] = [];
    for (const row of await this.progressRows(500)) {
      const key = `${row.account}\0${row.realm}\0${row.character}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(progressFromRow(row));
    }
    return out;
  }

  async progressHistory(limit: number): Promise<StoredProgress[]> {
    return (await this.progressRows(limit)).map(progressFromRow);
  }

  async registerDevice(input: {
    id: string;
    name: string;
    secretHash: string;
    nowSeconds: number;
    pendingCap: number;
  }): Promise<RegisterDeviceResult> {
    try {
      return await this.db.tx(async () => {
        const existing = await this.deviceById(input.id);
        if (existing) {
          if (existing.secretHash !== input.secretHash) {
            return { ok: false, status: 409, error: "This device id is already registered." };
          }
          await this.touchDevice(existing.id, input.nowSeconds);
          return {
            ok: true,
            created: false,
            device: { ...existing, lastSeenAt: input.nowSeconds },
          };
        }
        const hashOwner = await this.deviceByHash(input.secretHash);
        if (hashOwner) {
          return { ok: false, status: 409, error: "This device secret is already registered." };
        }
        const pending = await this.db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM devices WHERE status = 'pending'`,
        );
        if (Number(pending?.n ?? 0) >= input.pendingCap) {
          return { ok: false, status: 429, error: "Too many devices are waiting for approval." };
        }
        await this.db.run(
          `INSERT INTO devices (id, name, secret_hash, status, created_at, last_seen_at)
           VALUES (?, ?, ?, 'pending', ?, ?)`,
          input.id,
          input.name,
          input.secretHash,
          input.nowSeconds,
          input.nowSeconds,
        );
        const device = await this.deviceById(input.id);
        if (!device) return { ok: false, status: 500, error: "Could not store the device." };
        return { ok: true, created: true, device };
      });
    } catch (error) {
      // Postgres: two registrations of one id or secret at once; one wins.
      if (isUniqueViolation(error)) {
        return { ok: false, status: 409, error: "This device is already registered." };
      }
      throw error;
    }
  }

  findDeviceBySecretHash(secretHash: string): Promise<Device | undefined> {
    return this.deviceByHash(secretHash);
  }

  async touchDevice(id: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<void> {
    await this.db.run(`UPDATE devices SET last_seen_at = ? WHERE id = ?`, nowSeconds, id);
  }

  async listDevices(): Promise<Device[]> {
    const rows = await this.db.all<DeviceRow>(
      `SELECT id, name, secret_hash, status, created_at, last_seen_at, forget_revoked
       FROM devices ORDER BY created_at DESC, id ASC`,
    );
    return rows.map(deviceFromRow);
  }

  async setDeviceStatus(
    id: string,
    status: DeviceStatus,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<Device | undefined> {
    return this.db.tx(async () => {
      const current = await this.deviceById(id, "update");
      if (!current) return undefined;
      await this.db.run(
        `UPDATE devices SET status = ?, last_seen_at = ?, forget_revoked = 0 WHERE id = ?`,
        status,
        nowSeconds,
        id,
      );
      return this.deviceById(id);
    });
  }

  /**
   * Connect again after Forget my data (docs/adr/0045). The old device stays
   * revoked. The new one is approved only when this PC proved the secret of a
   * device it forgot while that device was approved. Same id and secret checks
   * as a first registration; an owner revoke cannot use this.
   */
  async reconnectForgotten(input: {
    oldId: string;
    id: string;
    name: string;
    secretHash: string;
    nowSeconds: number;
  }): Promise<ReconnectDeviceResult> {
    try {
      return await this.db.tx(async () => {
        const old = await this.deviceById(input.oldId, "update");
        if (!old || old.status !== "revoked" || !old.forgetRevoked) {
          return {
            ok: false,
            status: 403,
            error: "This PC can't connect again by itself. Ask the Unbored team to approve it.",
          };
        }
        if (input.id === old.id) {
          return { ok: false, status: 400, error: "Connect again needs a new device id." };
        }
        if (input.secretHash === old.secretHash) {
          return { ok: false, status: 400, error: "Connect again needs a new device secret." };
        }
        if (await this.deviceById(input.id)) {
          return { ok: false, status: 409, error: "This device id is already registered." };
        }
        if (await this.deviceByHash(input.secretHash)) {
          return { ok: false, status: 409, error: "This device secret is already registered." };
        }
        await this.db.run(
          `INSERT INTO devices (id, name, secret_hash, status, created_at, last_seen_at, forget_revoked)
           VALUES (?, ?, ?, 'approved', ?, ?, 0)`,
          input.id,
          input.name,
          input.secretHash,
          input.nowSeconds,
          input.nowSeconds,
        );
        await this.db.run(`UPDATE devices SET forget_revoked = 0 WHERE id = ?`, old.id);
        const device = await this.deviceById(input.id);
        if (!device) return { ok: false, status: 500, error: "Could not store the device." };
        return { ok: true, device };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, status: 409, error: "This device is already registered." };
      }
      throw error;
    }
  }

  async addRequest(input: {
    id: string;
    deviceId: string;
    character: string;
    realm: string;
    mode: string;
    budget: number | null;
    wish: string | null;
    type?: RequestType;
    question?: string | null;
    topic?: string | null;
    item?: RequestItem | null;
    context?: PlayerContext | null;
    lang?: string | null;
    account?: string | null;
    /** Old folder key, sent once so existing rows can be renamed (docs/adr/0044). */
    accountLegacy?: unknown;
    suggestionId?: string | null;
    suggestion?: RequestSuggestion | null;
    nowSeconds: number;
  }): Promise<{ created: boolean; request: PlanRequest }> {
    return this.db.tx(async () => {
      const existing = await this.requestById(input.id);
      if (existing) {
        if (existing.deviceId !== input.deviceId)
          throw new PlanError("Request id is already in use.");
        return { created: false, request: existing };
      }
      const account = input.account
        ? await this.bindAccount(input.account, input.accountLegacy)
        : ((await this.profileFor(input.character, input.realm || undefined))?.account ?? "");
      await this.db.run(
        `INSERT INTO requests
           (id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at,
            context_json, type, question, topic, item_json, lang, account, suggestion_id, suggestion_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.id,
        input.deviceId,
        input.character,
        input.realm,
        input.mode,
        input.budget ?? 0,
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
        input.suggestionId ?? null,
        input.suggestion ? JSON.stringify(input.suggestion) : null,
      );
      const request = await this.requestById(input.id);
      if (!request) throw new Error("Could not store the request.");
      await this.historyFor(request, "request", {
        type: request.type,
        mode: request.mode || null,
        wish: request.wish,
        question: request.question,
        topic: request.topic,
        item: request.item,
        lang: request.lang,
        context: request.context,
        ...(request.suggestionId ? { suggestionId: request.suggestionId } : {}),
      });
      return { created: true, request };
    });
  }

  async webhookDelivery(requestId: string): Promise<WebhookDelivery | undefined> {
    const row = await this.db.get<WebhookDeliveryRow>(
      `SELECT attempts, delivered_at, next_at, last_status, last_error, updated_at
       FROM webhook_deliveries WHERE request_id = ?`,
      requestId,
    );
    return row ? deliveryFromRow(row) : undefined;
  }

  async recordWebhookAttempt(
    requestId: string,
    outcome: { ok: boolean; status: number | null; error: string | null; nextAt: number | null },
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<WebhookDelivery> {
    return this.db.tx(async () => {
      const attempts = ((await this.webhookDelivery(requestId))?.attempts ?? 0) + 1;
      await this.db.run(
        `INSERT INTO webhook_deliveries (request_id, attempts, delivered_at, next_at, last_status, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (request_id) DO UPDATE SET
           attempts = excluded.attempts, delivered_at = excluded.delivered_at, next_at = excluded.next_at,
           last_status = excluded.last_status, last_error = excluded.last_error, updated_at = excluded.updated_at`,
        requestId,
        attempts,
        outcome.ok ? nowSeconds : null,
        outcome.ok ? null : outcome.nextAt,
        outcome.status,
        outcome.ok ? null : outcome.error,
        nowSeconds,
      );
      const delivery = await this.webhookDelivery(requestId);
      if (!delivery) throw new Error("Could not store the webhook attempt.");
      return delivery;
    });
  }

  /** Pending requests the planner has not been told about yet and whose retry is due. */
  async webhookDue(input: {
    nowSeconds: number;
    sinceSeconds: number;
    maxAttempts: number;
    limit?: number;
  }): Promise<PlanRequest[]> {
    const rows = await this.db.all<{ id: string }>(
      `SELECT r.id FROM requests r LEFT JOIN webhook_deliveries w ON w.request_id = r.id
       WHERE r.status = 'pending' AND r.created_at >= ? AND w.delivered_at IS NULL
         AND COALESCE(w.attempts, 0) < ? AND COALESCE(w.next_at, 0) <= ?
       ORDER BY r.created_at ASC, r.id ASC LIMIT ?`,
      input.sinceSeconds,
      input.maxAttempts,
      input.nowSeconds,
      input.limit ?? 20,
    );
    const out: PlanRequest[] = [];
    for (const row of rows) {
      const request = await this.requestById(row.id);
      if (request) out.push(request);
    }
    return out;
  }

  async listRequests(status = "pending", limit = 50): Promise<PlanRequest[]> {
    const rows = await this.db.all<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM requests WHERE status = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
      status,
      limit,
    );
    return rows.map(requestFromRow);
  }

  async requestById(id: string): Promise<PlanRequest | undefined> {
    const row = await this.db.get<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM requests WHERE id = ?`,
      id,
    );
    return row ? requestFromRow(row) : undefined;
  }

  /**
   * The newest Request this device made. Ordered by creation, never by
   * update: failing an old Request must not make it "latest" (D82).
   */
  async latestRequestForDevice(deviceId: string): Promise<PlanRequest | undefined> {
    const row = await this.db.get<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM requests WHERE device_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      deviceId,
    );
    return row ? requestFromRow(row) : undefined;
  }

  async fulfillRequest(
    id: string,
    planId: number,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<PlanRequest | undefined> {
    return this.db.tx(async () => {
      if (!(await this.lockRequest(id, "update"))) return undefined;
      await this.db.run(`UPDATE plans SET request_id = ? WHERE id = ?`, id, planId);
      await this.db.run(
        `UPDATE requests SET status = 'fulfilled', plan_id = ?, reason = NULL, reason_code = NULL, updated_at = ? WHERE id = ?`,
        planId,
        nowSeconds,
        id,
      );
      const request = await this.requestById(id);
      if (request)
        await this.historyFor(
          request,
          "plan",
          { planId, ...(await this.planSummary(planId)) },
          nowSeconds,
        );
      return request;
    });
  }

  async answerRequest(
    id: string,
    answer: Answer,
    planId: number | null,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<PlanRequest | undefined> {
    return this.db.tx(async () => {
      if (!(await this.lockRequest(id, "update"))) return undefined;
      if (planId !== null)
        await this.db.run(`UPDATE plans SET request_id = ? WHERE id = ?`, id, planId);
      await this.db.run(
        `UPDATE requests SET status = 'fulfilled', answer_json = ?, plan_id = COALESCE(?, plan_id), reason = NULL,
           reason_code = NULL, updated_at = ? WHERE id = ?`,
        JSON.stringify(answer),
        planId,
        nowSeconds,
        id,
      );
      const request = await this.requestById(id);
      if (request) {
        await this.historyFor(
          request,
          "answer",
          { message: answer.message, waypoints: answer.waypoints ?? null },
          nowSeconds,
        );
        if (planId)
          await this.historyFor(
            request,
            "plan",
            { planId, ...(await this.planSummary(planId)) },
            nowSeconds,
          );
      }
      return request;
    });
  }

  async failRequest(
    id: string,
    reason: string,
    nowSeconds = Math.floor(Date.now() / 1000),
    reasonCode: string | null = null,
  ): Promise<PlanRequest | undefined> {
    return this.db.tx(async () => {
      if (!(await this.lockRequest(id, "update"))) return undefined;
      await this.db.run(
        `UPDATE requests SET status = 'failed', reason = ?, reason_code = ?, updated_at = ? WHERE id = ?`,
        reason,
        reasonCode,
        nowSeconds,
        id,
      );
      const request = await this.requestById(id);
      if (request) await this.historyFor(request, "failed", { reason }, nowSeconds);
      return request;
    });
  }

  /**
   * Requests still pending after an hour fail with Reason code `timeout`
   * (D69). Only their status changes, so the game still gets the answer to
   * the Request it waits for (D82).
   */
  async expireRequests(nowSeconds = Math.floor(Date.now() / 1000)): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>(
      `SELECT id FROM requests WHERE status = 'pending' AND created_at <= ? ORDER BY created_at`,
      nowSeconds - REQUEST_TIMEOUT_SECONDS,
    );
    for (const row of rows) {
      await this.failRequest(row.id, "No plan came back within an hour.", nowSeconds, "timeout");
    }
    return rows.map((row) => row.id);
  }

  /** How long recent Plan Requests took (p50), for the game's ETA (D68). */
  async planEta(): Promise<number> {
    const rows = await this.db.all<{ took: number }>(
      `SELECT updated_at - created_at AS took FROM requests
       WHERE status = 'fulfilled' AND type = 'plan' AND updated_at >= created_at
       ORDER BY updated_at DESC LIMIT 50`,
    );
    if (rows.length < ETA_MIN_SAMPLES) return ETA_DEFAULT_SECONDS;
    const sorted = rows.map((row) => Number(row.took)).sort((a, b) => a - b);
    const middle = sorted[Math.floor(sorted.length / 2)]!;
    return Math.min(ETA_MAX_SECONDS, Math.max(ETA_MIN_SECONDS, Math.round(middle)));
  }

  /**
   * A 0.6 profile upload, kept as the Character's `profile` Section: the
   * newest upload wins, an older savedAt is ignored, and an empty field never
   * overwrites a good one (docs/adr/0020, 0029).
   */
  async putProfile(
    input: ProfileUpload & { deviceId: string },
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<{ profile: StoredProfile; updated: boolean }> {
    return this.db.tx(async () => {
      const saved = await this.data.ingestProfile(input, nowSeconds);
      const profile = (await this.exactProfile(input.character, input.realm))!;
      if (saved.updated) {
        await this.addHistory({
          at: nowSeconds,
          account: profile.account,
          character: input.character,
          realm: input.realm,
          kind: "profile",
          ref: input.savedAt === null ? null : String(input.savedAt),
          body: profileSummary(saved.body),
        });
      }
      return { profile, updated: saved.updated };
    });
  }

  /** A Game data snapshot upload (docs/adr/0029). */
  async putSnapshot(
    snapshot: CleanSnapshot,
    deviceId: string,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Promise<SnapshotResult> {
    return this.db.tx(async () => {
      const changes: SectionChange[] = [];
      const result = await this.data.ingestSnapshot(snapshot, deviceId, nowSeconds, changes);
      try {
        await this.db.savepoint(() =>
          this.detectWins(result.account, snapshot.character, snapshot.realm, changes, nowSeconds),
        );
      } catch {
        // Wins are a bonus; a bad body must not fail the upload that was already stored.
      }
      if (result.stored.length > 0) {
        this.suggestions.schedule(result.account);
        const view = await this.exactProfile(snapshot.character, snapshot.realm);
        await this.addHistory({
          at: nowSeconds,
          account: result.account,
          character: snapshot.character,
          realm: snapshot.realm,
          kind: "profile",
          ref: snapshot.savedAt === null ? null : String(snapshot.savedAt),
          body: { ...profileSummary(view?.profile ?? {}), sections: result.stored },
        });
      }
      return result;
    });
  }

  /**
   * Plans linked to a Request of this Account, made in the last 30 days, with
   * what each promised (D194, D195). Newest first.
   */
  private async openPlans(account: string, now: number) {
    const own = new Set(
      (await this.data.characters(account)).map((row) => `${row.name}\0${row.realm}`),
    );
    const rows = await this.db.all<{
      request_id: string;
      account: string | null;
      character_name: string;
      realm: string;
      topic: string | null;
      mode: string | null;
      suggestion_json: unknown;
      plan_id: number;
      created_at: number;
      body_json: unknown;
    }>(
      `SELECT r.id AS request_id, r.account, r.character_name, r.realm, r.topic, r.mode,
              r.suggestion_json, p.id AS plan_id, p.created_at, p.${this.db.body} AS body_json
       FROM requests r JOIN plans p ON p.id = r.plan_id
       WHERE p.created_at >= ? ORDER BY p.created_at DESC, p.id DESC`,
      now - WIN_PLAN_DAYS * 86_400,
    );
    return rows
      .filter(
        (row) =>
          (account !== "" && row.account === account) ||
          own.has(`${row.character_name}\0${row.realm}`),
      )
      .map((row) => {
        const plan = fromJson<Plan>(row.body_json);
        const suggestion = fromJson<{ kind?: string }>(row.suggestion_json);
        return {
          planId: Number(row.plan_id),
          requestId: row.request_id,
          createdAt: row.created_at,
          title: plan?.title ?? null,
          category: requestCategory({
            topic: row.topic,
            mode: row.mode,
            suggestionKind: suggestion?.kind ?? null,
          }),
          targets: new Map<string, WinTarget>(
            (plan ? planTargets(plan) : []).map((target) => [
              `${target.kind}:${target.id}`,
              target,
            ]),
          ),
        };
      });
  }

  /** True when another bag or bank of the Account already holds the item. */
  private async itemElsewhere(
    account: string,
    change: SectionChange,
    id: number,
  ): Promise<boolean> {
    const places: { scope: "char" | "account"; owner: string; section: string }[] = [
      { scope: "account", owner: account, section: "warband" },
    ];
    for (const row of await this.data.characters(account)) {
      for (const section of ["bags", "bank", "reagentBank"]) {
        places.push({ scope: "char", owner: row.id, section });
      }
    }
    for (const place of places) {
      if (
        place.scope === change.scope &&
        place.owner === change.ownerId &&
        place.section === change.section
      )
        continue;
      const body = (await this.data.section(place.scope, place.owner, place.section))?.body;
      if (body && unpackIds(body.items).includes(id)) return true;
    }
    return false;
  }

  /**
   * Wins (D196, D197): ids a stored Section newly gained that an open plan of
   * this Account promised, changed after the plan was made. One per id, ever.
   */
  private async detectWins(
    account: string,
    character: string,
    realm: string,
    changes: SectionChange[],
    now: number,
  ): Promise<number> {
    const relevant = changes.filter((change) => WIN_SECTIONS[change.section]);
    if (!account || relevant.length === 0) return 0;
    const plans = await this.openPlans(account, now);
    if (plans.length === 0) return 0;
    const moved = new Set(
      changes.filter((change) => WIN_SECTIONS[change.section] === "item").flatMap(removedIds),
    );
    const known = (ref: string) =>
      this.db.get(
        `SELECT 1 AS n FROM history WHERE kind = 'win' AND account = ? AND ref = ? LIMIT 1`,
        account,
        ref,
      );
    let found = 0;
    for (const change of relevant) {
      const kind = WIN_SECTIONS[change.section]!;
      for (const id of addedIds(change)) {
        const ref = `${kind}:${id}`;
        const plan = plans.find((row) => row.createdAt < change.at && row.targets.has(ref));
        if (!plan || (await known(ref))) continue;
        if (kind === "item" && (moved.has(id) || (await this.itemElsewhere(account, change, id))))
          continue;
        await this.addHistory({
          at: change.at,
          account,
          character,
          realm,
          kind: "win",
          ref,
          body: {
            planId: plan.planId,
            requestId: plan.requestId,
            kind,
            id,
            token: plan.targets.get(ref)!.token,
            planTitle: plan.title,
            category: plan.category,
          },
        });
        found += 1;
      }
    }
    return found;
  }

  /** list_wins (D198): newest first, with totals and UTC days. */
  async listWins(filter: { account?: string; character?: string; since?: number; limit: number }) {
    const wins: WinEntry[] = (
      await this.history({
        account: filter.account,
        character: filter.character,
        since: filter.since,
        kinds: ["win"],
        limit: filter.limit,
      })
    ).map((entry) => {
      const body = (entry.body ?? {}) as Record<string, unknown>;
      return {
        at: entry.at,
        account: entry.account,
        character: entry.character,
        realm: entry.realm,
        kind: body.kind as WinKind,
        id: Number(body.id),
        token: String(body.token ?? ""),
        planId: Number(body.planId),
        requestId: String(body.requestId ?? ""),
        planTitle: typeof body.planTitle === "string" ? body.planTitle : null,
        category: String(body.category ?? ""),
      };
    });
    return winSummary(wins);
  }

  /** Ready now for one Character (D179), computed from its latest Sections. */
  async readyNow(
    filter: { account?: string; character?: string; realm?: string },
    now = Math.floor(Date.now() / 1000),
  ): Promise<ReadyNow | undefined> {
    const row = filter.character
      ? await this.data.character(filter.character, filter.realm)
      : filter.account
        ? (await this.data.characters(filter.account))[0]
        : await this.data.character();
    if (!row || (filter.account && row.accountId !== accountKey(filter.account))) return undefined;
    const others: { name: string; sections: Map<string, SectionRow> }[] = [];
    if (row.accountId) {
      for (const other of await this.data.characters(row.accountId)) {
        if (other.id === row.id) continue;
        others.push({ name: other.name, sections: await this.data.sectionsFor(other) });
      }
    }
    return readyNow({
      character: row.name,
      realm: row.realm,
      account: row.accountId,
      sections: await this.data.sectionsFor(row),
      others,
      taste: row.accountId ? await this.taste(row.accountId, now) : [],
      now,
    });
  }

  /** Taste of one Account (D189-D191). */
  async taste(account: string, now = Math.floor(Date.now() / 1000)): Promise<TasteRow[]> {
    return computeTaste(this.db, accountKey(account), await this.data.characters(account), now);
  }

  /** list_errors (D178): newest first, with the device name; `new` when first seen after since. */
  async listErrors(filter: { account?: string; since?: number; version?: string; limit: number }) {
    const out = [];
    for (const row of await this.data.errors(filter)) {
      out.push({
        account: row.account,
        device: row.deviceId ? ((await this.deviceById(row.deviceId))?.name ?? null) : null,
        character: row.character,
        realm: row.realm,
        version: row.version,
        where: row.where,
        text: row.text,
        stack: row.stack,
        count: row.count,
        firstAt: row.firstAt,
        lastAt: row.lastAt,
        new: filter.since !== undefined ? row.seenAt >= filter.since : false,
      });
    }
    return out;
  }

  private async exactProfile(character: string, realm: string): Promise<StoredProfile | undefined> {
    const row = await this.data.character(character, realm);
    return row && row.realm === realm ? this.data.profileView(row) : undefined;
  }

  /** Every character of one Account (docs/adr/0021). */
  async profilesForAccount(account: string): Promise<StoredProfile[]> {
    const out: StoredProfile[] = [];
    for (const row of await this.data.characters(account))
      out.push(await this.data.profileView(row));
    return out;
  }

  async listAccounts(): Promise<
    { account: string; characters: { character: string; realm: string }[] }[]
  > {
    const out = new Map<string, { character: string; realm: string }[]>();
    for (const row of [...(await this.data.characters())].sort((a, b) =>
      a.accountId === b.accountId
        ? a.name.localeCompare(b.name)
        : a.accountId.localeCompare(b.accountId),
    )) {
      if (!out.has(row.accountId)) out.set(row.accountId, []);
      out.get(row.accountId)!.push({ character: row.name, realm: row.realm });
    }
    return [...out.entries()].map(([account, characters]) => ({ account, characters }));
  }

  /** The legacy 0.6 tables stay in the SQLite file only (ADR 0057). */
  private legacyTables(): string[] {
    return this.db.pg
      ? ["history", "advice"]
      : ["profiles", "profile_snapshots", "history", "advice"];
  }

  /**
   * Erases one Account (D62): Game data, profiles, Player history, advice and
   * ideas, and by default its Requests and the plans made for them. Used by the
   * owner (delete_account_data) and by the player (Forget my data). One
   * transaction, Suggestions included.
   */
  async deleteAccountData(account: string, options: { requests?: boolean } = {}) {
    return this.db.tx(() => this.eraseAccount(account, options));
  }

  private async eraseAccount(account: string, options: { requests?: boolean } = {}) {
    const key = accountKey(account);
    if (!key) throw new Error("Name the Account to erase.");
    // Postgres: an upload of this Account waits until the erase is done.
    await this.db.lockKey(`account:${key}`);
    const names = (await this.data.characters(key)).map((row) => [row.name, row.realm] as const);
    const removed = await this.data.deleteAccount(key);
    let legacy = 0;
    for (const table of this.legacyTables()) {
      legacy += await this.db.run(`DELETE FROM ${table} WHERE account = ?`, key);
    }
    legacy += await this.db.run(
      `DELETE FROM progress WHERE account = ? OR account LIKE ?`,
      key,
      `${key}#%`,
    );
    for (const [name, realm] of names) {
      for (const table of this.legacyTables()) {
        legacy += await this.db.run(
          `DELETE FROM ${table} WHERE character_name = ? AND realm = ?`,
          name,
          realm,
        );
      }
    }
    const suggestions = await this.suggestions.tables.deleteOwner(key);
    if (this.db.pg) await this.db.run(`DELETE FROM raw_uploads WHERE account_id = ?`, key);
    let erased = { requests: 0, plans: 0 };
    if (options.requests !== false) {
      const ids = new Set<string>();
      const add = (rows: { id: string }[]) => {
        for (const row of rows) ids.add(row.id);
      };
      if (key)
        add(await this.db.all<{ id: string }>(`SELECT id FROM requests WHERE account = ?`, key));
      for (const [name, realm] of names) {
        add(
          await this.db.all<{ id: string }>(
            `SELECT id FROM requests WHERE character_name = ? AND realm = ?`,
            name,
            realm,
          ),
        );
      }
      erased = await this.deleteRequests([...ids]);
    }
    return { account: key, ...removed, legacyRows: legacy, suggestions, ...erased };
  }

  /** Requests by id, with their webhook rows and the plans made for them. */
  private async deleteRequests(ids: string[]): Promise<{ requests: number; plans: number }> {
    let requests = 0;
    let plans = 0;
    for (const id of ids) {
      // Held first, so a Plan being stored for it either lands before and is erased, or fails.
      const row = await this.lockRequest(id, "update");
      if (!row) continue;
      plans += await this.db.run(
        `DELETE FROM plans WHERE request_id = ? OR id = ?`,
        id,
        row.plan_id,
      );
      await this.db.run(`DELETE FROM webhook_deliveries WHERE request_id = ?`, id);
      requests += await this.db.run(`DELETE FROM requests WHERE id = ?`, id);
    }
    return { requests, plans };
  }

  /**
   * Forget my data: the player erases every Account this device sent data or
   * Requests for, and this device's own Requests, then the device is revoked
   * so nothing more is stored from it. One transaction: on Postgres the device
   * row is held first, so a write of this device (asDevice) either lands before
   * and is erased, or comes after and is refused.
   */
  async forgetDevice(deviceId: string, nowSeconds = Math.floor(Date.now() / 1000)) {
    return this.db.tx(async () => {
      const current = await this.deviceById(deviceId, "update");
      const accounts = new Set<string>();
      for (const row of await this.data.characters()) {
        if (row.deviceId === deviceId && row.accountId) accounts.add(row.accountId);
      }
      for (const table of this.db.pg ? ["requests"] : ["profiles", "requests"]) {
        const rows = await this.db.all<{ account: string | null }>(
          `SELECT DISTINCT account FROM ${table} WHERE device_id = ? AND account <> ''`,
          deviceId,
        );
        for (const row of rows) if (row.account) accounts.add(accountKey(row.account));
      }
      const totals = { accounts: 0, characters: 0, sections: 0, requests: 0, plans: 0 };
      for (const account of accounts) {
        const removed = await this.eraseAccount(account);
        totals.accounts += 1;
        totals.characters += removed.characters;
        totals.sections += removed.sections;
        totals.requests += removed.requests;
        totals.plans += removed.plans;
      }
      const own = await this.db.all<{ id: string }>(
        `SELECT id FROM requests WHERE device_id = ?`,
        deviceId,
      );
      const loose = await this.deleteRequests(own.map((row) => row.id));
      totals.requests += loose.requests;
      totals.plans += loose.plans;
      if (!this.db.pg) {
        const profiles = await this.db.all<{ character_name: string; realm: string }>(
          `SELECT character_name, realm FROM profiles WHERE device_id = ?`,
          deviceId,
        );
        for (const profile of profiles) {
          for (const table of this.legacyTables()) {
            await this.db.run(
              `DELETE FROM ${table} WHERE character_name = ? AND realm = ?`,
              profile.character_name,
              profile.realm,
            );
          }
        }
      }
      if (this.db.pg) await this.db.run(`DELETE FROM raw_uploads WHERE device_id = ?`, deviceId);
      const reconnect = current?.status === "approved" || current?.forgetRevoked ? 1 : 0;
      await this.db.run(
        `UPDATE devices SET status = 'revoked', last_seen_at = ?, forget_revoked = ? WHERE id = ?`,
        nowSeconds,
        reconnect,
        deviceId,
      );
      return { ...totals, revoked: true };
    });
  }

  /**
   * Rename rows stored under a WTF folder key to the salted hash the Companion
   * now sends (docs/adr/0044). No-op when nothing is stored under the old key.
   * Returns the account string to store: the hash when that is what was sent,
   * otherwise the value unchanged so an older Companion still works.
   */
  async bindAccount(account: string, legacyRaw: unknown): Promise<string> {
    const presented = account.trim();
    const legacy = legacyAccountKey(legacyRaw);
    if (legacy && isAccountHash(presented)) await this.migrateAccount(legacy, presented);
    return accountKey(presented);
  }

  private async migrateAccount(from: string, to: string): Promise<void> {
    if (!from || !to || from === to || !isAccountHash(to) || isAccountHash(from)) return;
    // `account` is the key itself or "key#n" (a folder name): compared without LIKE wildcards.
    const prefix = `${from}#`;
    const textMatch = `(account = ? OR substr(account, 1, ${prefix.length}) = ?)`;
    const textTables = this.db.pg
      ? ["progress", "requests", "history", "advice"]
      : ["progress", "requests", "profiles", "history", "profile_snapshots", "advice"];
    await this.db.tx(async () => {
      await this.db.lockKey(`account:${from}`);
      await this.db.lockKey(`account:${to}`);
      const textHits = textTables.map((table) => `SELECT 1 FROM ${table} WHERE ${textMatch}`);
      const query = [
        `SELECT 1 AS n FROM accounts WHERE id = ?`,
        `SELECT 1 FROM characters WHERE account_id = ?`,
        ...textHits,
        `SELECT 1 FROM suggestions WHERE owner_id = ?`,
        `SELECT 1 FROM sections_latest WHERE owner_kind = 'account' AND owner_id = ?`,
        `SELECT 1 FROM section_history WHERE owner_kind = 'account' AND owner_id = ?`,
        ...(this.db.pg ? [`SELECT 1 FROM raw_uploads WHERE account_id = ?`] : []),
      ].join(" UNION ALL ");
      const args: string[] = [from, from];
      for (let i = 0; i < textHits.length; i += 1) args.push(from, prefix);
      args.push(from, from, from);
      if (this.db.pg) args.push(from);
      const hit = await this.db.get(`SELECT n FROM (${query}) AS hits LIMIT 1`, ...args);
      if (!hit) return;
      const dest = await this.db.get(`SELECT id FROM accounts WHERE id = ?`, to);
      if (dest) await this.db.run(`DELETE FROM accounts WHERE id = ?`, from);
      else await this.db.run(`UPDATE accounts SET id = ?, label = ? WHERE id = ?`, to, to, from);
      await this.db.run(`UPDATE characters SET account_id = ? WHERE account_id = ?`, to, from);
      // Same as UPDATE OR IGNORE: a report the new key already has stays as it is.
      await this.db.run(
        `UPDATE addon_errors SET account = ? WHERE account = ? AND NOT EXISTS (
           SELECT 1 FROM addon_errors kept WHERE kept.account = ? AND kept.hash = addon_errors.hash)`,
        to,
        from,
        to,
      );
      await this.db.run(`DELETE FROM addon_errors WHERE account = ?`, from);
      for (const table of textTables) {
        await this.db.run(`UPDATE ${table} SET account = ? WHERE ${textMatch}`, to, from, prefix);
      }
      await this.suggestions.tables.renameOwner(from, to);
      if (this.db.pg) {
        // Queued uploads apply under the new key; a body the new key already has is dropped.
        await this.db.run(
          `UPDATE raw_uploads SET account_id = ? WHERE account_id = ? AND NOT EXISTS (
             SELECT 1 FROM raw_uploads kept WHERE kept.account_id = ? AND kept.hash = raw_uploads.hash)`,
          to,
          from,
          to,
        );
        await this.db.run(`DELETE FROM raw_uploads WHERE account_id = ?`, from);
      }
      const clash = await this.db.all<{ section: string }>(
        `SELECT section FROM sections_latest WHERE owner_kind = 'account' AND owner_id = ?`,
        to,
      );
      for (const row of clash) {
        await this.db.run(
          `DELETE FROM sections_latest WHERE owner_kind = 'account' AND owner_id = ? AND section = ?`,
          from,
          row.section,
        );
      }
      for (const table of ["sections_latest", "section_history"]) {
        await this.db.run(
          `UPDATE ${table} SET owner_id = ? WHERE owner_kind = 'account' AND owner_id = ?`,
          to,
          from,
        );
      }
    });
  }

  async addHistory(entry: {
    at: number;
    account: string;
    character: string;
    realm: string;
    kind: HistoryKind;
    ref: string | null;
    body: unknown;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO history (at, account, character_name, realm, kind, ref, ${this.db.body}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      historyAt(this.db, entry.at, Math.floor(Date.now() / 1000)),
      entry.account,
      entry.character,
      entry.realm,
      entry.kind,
      entry.ref,
      JSON.stringify(entry.body),
    );
  }

  private async historyFor(
    request: PlanRequest,
    kind: HistoryKind,
    body: unknown,
    at = request.updatedAt,
  ): Promise<void> {
    await this.addHistory({
      at,
      account: request.account,
      character: request.character,
      realm: request.realm,
      kind,
      ref: request.id,
      body,
    });
  }

  private async planSummary(planId: number): Promise<Record<string, unknown>> {
    const stored = await this.planById(planId);
    if (!stored) return {};
    return {
      mode: stored.plan.mode,
      note: stored.plan.note ?? null,
      steps: stored.plan.tasks.map((task) => ({ id: task.id, title: task.title })),
    };
  }

  /** Dated Player history, newest first (docs/adr/0020). */
  async history(filter: {
    account?: string;
    character?: string;
    realm?: string;
    kinds?: HistoryKind[];
    since?: number;
    limit: number;
  }): Promise<HistoryEntry[]> {
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
    const rows = await this.db.all<HistoryRow>(
      `SELECT id, at, account, character_name, realm, kind, ref, ${this.db.body} AS body_json FROM history
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, id DESC LIMIT ?`,
      ...args,
      filter.limit,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      at: row.at,
      account: row.account,
      character: row.character_name,
      realm: row.realm,
      kind: row.kind as HistoryKind,
      ref: row.ref,
      body: fromJson<unknown>(row.body_json),
    }));
  }

  /** Whole 0.6 profile uploads, newest first, from the `profile` Section history. */
  async profileSnapshots(filter: {
    account?: string;
    character?: string;
    realm?: string;
    limit: number;
  }): Promise<
    {
      at: number;
      account: string;
      character: string;
      realm: string;
      savedAt: number | null;
      profile: unknown;
    }[]
  > {
    const characters = (
      filter.account ? await this.data.characters(filter.account) : await this.data.characters()
    ).filter(
      (row) =>
        (!filter.character || row.name === filter.character) &&
        (!filter.realm || row.realm === filter.realm),
    );
    const byId = new Map(characters.map((row) => [row.id, row]));
    return (
      await this.data.history({
        owners: characters.map((row) => ({ kind: "char" as const, id: row.id })),
        sections: ["profile"],
        limit: filter.limit,
      })
    )
      .filter((row) => row.kind === "full")
      .map((row) => {
        const owner = byId.get(row.ownerId)!;
        return {
          at: row.at,
          account: owner.accountId,
          character: owner.name,
          realm: owner.realm,
          savedAt: row.savedAt,
          profile: row.body,
        };
      });
  }

  /** Personal advice for one character (docs/adr/0019). */
  async putItemAdvice(input: {
    character: string;
    realm: string;
    account?: string;
    items: ItemAdvice[];
    replace?: boolean;
    nowSeconds?: number;
  }): Promise<number> {
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    return this.db.tx(async () => {
      const account = accountKey(
        input.account || (await this.exactProfile(input.character, input.realm))?.account || "",
      );
      if (input.replace) {
        await this.db.run(
          `DELETE FROM advice WHERE character_name = ? AND realm = ?`,
          input.character,
          input.realm,
        );
      }
      const body = this.db.body;
      for (const item of input.items) {
        const { itemID, ...rest } = item;
        await this.db.run(
          `INSERT INTO advice (character_name, realm, account, item_id, ${body}, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (character_name, realm, item_id) DO UPDATE SET
             account = excluded.account, ${body} = excluded.${body}, updated_at = excluded.updated_at`,
          input.character,
          input.realm,
          account,
          itemID,
          JSON.stringify(rest),
          now,
        );
      }
      await this.addHistory({
        at: now,
        account,
        character: input.character,
        realm: input.realm,
        kind: "advice",
        ref: null,
        body: { count: input.items.length, replace: Boolean(input.replace) },
      });
      return input.items.length;
    });
  }

  /** Suggestions for this device's characters (docs/adr/0040). */
  async suggestionsForDevice(deviceId: string) {
    const rows = (await this.data.characters()).filter(
      (row) => deviceId === "legacy" || row.deviceId === deviceId,
    );
    return this.suggestions.body(rows);
  }

  /**
   * The holdings index (ADR 0048) for the Account of this device's most
   * recently seen Character; the addon shows it only on that Account.
   */
  async holdingsForDevice(deviceId: string, now?: number): Promise<Holdings | null> {
    const row = (await this.data.characters()).find(
      (other) => (deviceId === "legacy" || other.deviceId === deviceId) && other.accountId,
    );
    if (!row) return null;
    const holdings = await this.data.holdings(row, now);
    return holdings.places.length ? holdings : null;
  }

  /**
   * Advice for every character this device uploaded data for, with the Account
   * digest (its Alts) so routing works for Alts seen on other PCs (D76).
   */
  async adviceForDevice(deviceId: string): Promise<DeviceAdvice[]> {
    const legacy = deviceId === "legacy";
    const rows = await this.db.all<{
      character_name: string;
      realm: string;
      item_id: number;
      body_json: unknown;
      updated_at: number;
    }>(
      `SELECT a.character_name, a.realm, a.item_id, a.${this.db.body} AS body_json, a.updated_at FROM advice a
       JOIN characters c ON c.name = a.character_name AND c.realm = a.realm
       ${legacy ? "" : "WHERE c.device_id = ?"}
       ORDER BY a.character_name${this.db.pg ? ' COLLATE "C"' : ""}, a.realm${this.db.pg ? ' COLLATE "C"' : ""}, a.item_id`,
      ...(legacy ? [] : [deviceId]),
    );
    const out = new Map<string, DeviceAdvice>();
    for (const character of await this.data.characters()) {
      if (!legacy && character.deviceId !== deviceId) continue;
      const key = `${character.realm}\0${character.name}`;
      if (out.has(key)) continue;
      out.set(key, {
        character: character.name,
        realm: character.realm,
        updatedAt: 0,
        items: [],
        alts: await this.data.accountAlts(character),
      });
    }
    for (const row of rows) {
      const key = `${row.realm}\0${row.character_name}`;
      if (!out.has(key))
        out.set(key, {
          character: row.character_name,
          realm: row.realm,
          updatedAt: 0,
          items: [],
          alts: [],
        });
      const entry = out.get(key)!;
      entry.updatedAt = Math.max(entry.updatedAt, row.updated_at);
      entry.items.push({
        itemID: row.item_id,
        ...fromJson<Omit<ItemAdvice, "itemID">>(row.body_json),
      } as ItemAdvice);
    }
    return [...out.values()];
  }

  /** The named character, or the most recently updated one. */
  async profileFor(character?: string, realm?: string): Promise<StoredProfile | undefined> {
    const row = await this.data.character(character, realm);
    return row ? this.data.profileView(row) : undefined;
  }

  async listProfiles(): Promise<Omit<StoredProfile, "profile">[]> {
    return (await this.data.characters()).map((row) => ({
      character: row.name,
      realm: row.realm,
      account: row.accountId,
      deviceId: row.deviceId ?? "",
      savedAt: row.savedAt || null,
      updatedAt: row.lastSeen,
    }));
  }

  /** One device; `update` holds its row until the transaction ends (Postgres). */
  async deviceById(id: string, lock?: "update"): Promise<Device | undefined> {
    const row = await this.db.get<DeviceRow>(
      `SELECT id, name, secret_hash, status, created_at, last_seen_at, forget_revoked
       FROM devices WHERE id = ?${lock && this.db.pg ? " FOR UPDATE" : ""}`,
      id,
    );
    return row ? deviceFromRow(row) : undefined;
  }

  private async deviceByHash(secretHash: string): Promise<Device | undefined> {
    const row = await this.db.get<DeviceRow>(
      `SELECT id, name, secret_hash, status, created_at, last_seen_at, forget_revoked
       FROM devices WHERE secret_hash = ?`,
      secretHash,
    );
    return row ? deviceFromRow(row) : undefined;
  }

  private async progressRows(limit: number): Promise<ProgressRow[]> {
    return this.db.all<ProgressRow>(
      `SELECT id, created_at, account, realm, character, saved_at, ${this.db.body} AS body_json
       FROM progress WHERE player_key = ? ORDER BY id DESC LIMIT ?`,
      PLAYER,
      limit,
    );
  }
}

const REQUEST_COLUMNS = `id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account, reason_code,
                suggestion_id, suggestion_json`;

/** Postgres unique_violation: a concurrent insert won. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23505";
}

/** The SQLite tables, columns and one-time moves of the store.ts tables (SQLite only). */
function prepareSqlite(db: DatabaseSync): void {
  db.exec(SQLITE_SCHEMA);
  addColumns(db, "profiles", [["account", "TEXT"]]);
  addColumns(db, "requests", [
    ["context_json", "TEXT"],
    ["type", "TEXT NOT NULL DEFAULT 'plan'"],
    ["question", "TEXT"],
    ["topic", "TEXT"],
    ["item_json", "TEXT"],
    ["answer_json", "TEXT"],
    ["lang", "TEXT"],
    ["account", "TEXT"],
    ["reason_code", "TEXT"],
    ["suggestion_id", "TEXT"],
    ["suggestion_json", "TEXT"],
  ]);
  addColumns(db, "devices", [["forget_revoked", "INTEGER NOT NULL DEFAULT 0"]]);
  addColumns(db, "plans", [["generated_at", "INTEGER"]]);
  migratePlanRequests(db);
  // D190: progress names its plan by generatedAt; plans stored before 0.10 get theirs from the body.
  db.exec(
    `UPDATE plans SET generated_at = json_extract(body_json, '$.generatedAt')
     WHERE generated_at IS NULL AND json_valid(body_json)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS plans_generated ON plans (generated_at)`);
}

/** Preserve provenance even when a Request gets a replacement Plan. */
function migratePlanRequests(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info(plans)`).all() as { name: string }[];
  if (columns.some((column) => column.name === "request_id")) return;
  db.exec("BEGIN");
  try {
    db.exec(`
      ALTER TABLE plans ADD COLUMN request_id TEXT;
      UPDATE plans SET request_id = (
        SELECT id FROM requests WHERE plan_id = plans.id LIMIT 1
      );
      UPDATE plans SET request_id = (
        SELECT ref FROM history WHERE kind = 'plan' AND json_valid(body_json)
          AND json_extract(body_json, '$.planId') = plans.id LIMIT 1
      ) WHERE request_id IS NULL;
      CREATE INDEX plans_request ON plans (request_id);
      COMMIT;
    `);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function addColumns(db: DatabaseSync, table: string, added: [string, string][]): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  for (const [name, kind] of added) {
    if (!columns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${kind}`);
    }
  }
}

function matches(
  row: ProgressRow,
  filter?: { account?: string; realm?: string; character?: string },
): boolean {
  if (!filter) return true;
  if (filter.account && row.account !== filter.account) return false;
  if (filter.realm && row.realm !== filter.realm) return false;
  if (filter.character && row.character !== filter.character) return false;
  return true;
}

function planFromRow(row: PlanRow): StoredPlan {
  return {
    id: Number(row.id),
    createdAt: row.created_at,
    plan: fromJson<Plan>(row.body_json)!,
    unb1: row.unb1,
  };
}

function progressFromRow(row: ProgressRow): StoredProgress {
  return {
    id: Number(row.id),
    createdAt: row.created_at,
    account: row.account,
    realm: row.realm,
    character: row.character,
    savedAt: row.saved_at,
    progress: fromJson<ProgressBody>(row.body_json)!,
  };
}

export type DeviceStatus = "pending" | "approved" | "revoked";

export type Device = {
  id: string;
  name: string;
  secretHash: string;
  status: DeviceStatus;
  createdAt: number;
  lastSeenAt: number | null;
  /** This PC used Forget my data while approved, so Connect again is allowed once. */
  forgetRevoked: boolean;
};

export type RegisterDeviceResult =
  | { ok: true; created: boolean; device: Device }
  | { ok: false; status: 409 | 429 | 500; error: string };

export type ReconnectDeviceResult =
  | { ok: true; device: Device }
  | { ok: false; status: 400 | 403 | 409 | 500; error: string };

type DeviceRow = {
  id: string;
  name: string;
  secret_hash: string;
  status: string;
  created_at: number;
  last_seen_at: number | null;
  forget_revoked: number | null;
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
    forgetRevoked: row.forget_revoked === 1,
  };
}

export type RequestStatus = "pending" | "fulfilled" | "failed";

export type DeviceAdvice = {
  character: string;
  realm: string;
  updatedAt: number;
  items: ItemAdvice[];
  alts: DigestAlt[];
};

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
  /** Only set when the player typed minutes in the custom form (ADR 0037). */
  budget: number | null;
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
  /** Why it failed (docs/adr/0013): `timeout` when no Plan came in 60 min (D69). */
  reasonCode: string | null;
  /** With topic "suggestion": the picked Suggestion; its tokens are ground truth for ids (D109). */
  suggestionId: string | null;
  suggestion: RequestSuggestion | null;
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
  context_json: unknown;
  type: string | null;
  question: string | null;
  topic: string | null;
  item_json: unknown;
  answer_json: unknown;
  lang: string | null;
  account: string | null;
  reason_code: string | null;
  suggestion_id: string | null;
  suggestion_json: unknown;
};

function parseJson<T>(value: unknown): T | null {
  return fromJson<T>(value);
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
    budget: row.budget > 0 ? row.budget : null,
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
    reasonCode: row.reason_code,
    suggestionId: row.suggestion_id ?? null,
    suggestion: parseJson<RequestSuggestion>(row.suggestion_json),
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
    reasonCode: request.status === "failed" ? (request.reasonCode ?? "planner_failed") : null,
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
    suggestionId: request.suggestionId,
    suggestion: request.suggestion,
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
    budget: stored.plan.budget ?? null,
    note: stored.plan.note ?? null,
    taskCount: stored.plan.tasks.length,
    unb1: stored.unb1,
  };
}

export type HistoryKind =
  | "request"
  | "answer"
  | "plan"
  | "failed"
  | "progress"
  | "profile"
  | "advice"
  | "win";
export const HISTORY_KINDS: HistoryKind[] = [
  "request",
  "answer",
  "plan",
  "failed",
  "progress",
  "profile",
  "advice",
  "win",
];

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
  body_json: unknown;
};

export type ItemAdvice = {
  itemID: number;
  /** keep, sell, use, bank, send, disenchant, equip, open, turn_in, or info. */
  action: string;
  /** The tooltip line after "Bory: ", in English. */
  line: string;
  /** The same line in Russian. */
  lineRu?: string;
  /** For action "send": the Alt who should get it. */
  to?: string;
};

const ACCOUNT_HASH = /^[a-f0-9]{64}$/;

/** A salted Account key from the Companion (docs/adr/0044), not a folder name. */
export function isAccountHash(value: string): boolean {
  return ACCOUNT_HASH.test(value);
}

/**
 * The WoW account folder ("12345678#1") names one game license; the part before
 * "#" is the same for every license of one Battle.net account, so it is the key.
 * A 64-character hex hash is already that key and is kept whole.
 */
export function accountKey(account: string): string {
  const trimmed = account.trim();
  if (isAccountHash(trimmed)) return trimmed;
  return trimmed.split("#")[0] ?? "";
}

/** The old folder key, when an upload still carries it for the one-time rename. */
export function legacyAccountKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = accountKey(value);
  if (!key || isAccountHash(key)) return "";
  return key;
}

export function legacyOf(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  return (body as Record<string, unknown>).accountLegacy;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profileSummary(profile: Record<string, unknown>): Record<string, unknown> {
  const context = isPlainObject(profile.context) ? profile.context : {};
  const bags = profile.bags;
  return {
    level: context.level ?? null,
    ilvl: context.ilvl ?? null,
    gold: context.gold ?? null,
    zone: context.zone ?? null,
    bagItems: Array.isArray(bags)
      ? bags.length
      : isPlainObject(bags)
        ? Object.keys(bags).length
        : 0,
    collections: isPlainObject(profile.collections) ? profile.collections : null,
    professions: profile.professions ?? null,
  };
}
