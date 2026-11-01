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

import { IdCache, NameCache } from "./blizzard.ts";
import {
  DataStore,
  type DigestAlt,
  mergeProfile,
  type CleanSnapshot,
  type SectionChange,
  type SnapshotResult,
} from "./data.ts";
import type { Holdings } from "./holdings.ts";
import type { ProfileUpload } from "./profile.ts";
import { SuggestionStore } from "./suggestions.ts";
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
  readonly data: DataStore;
  readonly suggestions: SuggestionStore;
  readonly gameIds: IdCache;
  readonly creatureNames: NameCache;

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
      ["reason_code", "TEXT"],
      ["suggestion_id", "TEXT"],
      ["suggestion_json", "TEXT"],
    ]);
    this.addColumns("devices", [["forget_revoked", "INTEGER NOT NULL DEFAULT 0"]]);
    this.addColumns("plans", [["generated_at", "INTEGER"]]);
    this.migratePlanRequests();
    // D190: progress names its plan by generatedAt; plans stored before 0.10 get theirs from the body.
    this.db.exec(
      `UPDATE plans SET generated_at = json_extract(body_json, '$.generatedAt')
       WHERE generated_at IS NULL AND json_valid(body_json)`,
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS plans_generated ON plans (generated_at)`);
    this.data = new DataStore(this.db);
    this.gameIds = new IdCache(this.db);
    this.creatureNames = new NameCache(this.db);
    this.suggestions = new SuggestionStore(this.db, this.data, this.creatureNames);
  }

  /** Preserve provenance even when a Request gets a replacement Plan. */
  private migratePlanRequests(): void {
    const columns = this.db.prepare(`PRAGMA table_info(plans)`).all() as { name: string }[];
    if (columns.some((column) => column.name === "request_id")) return;
    this.db.exec("BEGIN");
    try {
      this.db.exec(`
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
      this.db.exec("ROLLBACK");
      throw error;
    }
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
    this.suggestions.close();
    this.db.close();
  }

  putPlan(
    raw: unknown,
    nowSeconds = Math.floor(Date.now() / 1000),
    check: MarkupCheck = {},
  ): StoredPlan {
    const plan = cleanPlan(raw, nowSeconds, check);
    const unb1 = encodeUnb1(plan);
    const createdAt = nowSeconds;
    const result = this.db
      .prepare(
        `INSERT INTO plans (player_key, created_at, body_json, unb1, generated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(PLAYER, createdAt, JSON.stringify(plan), unb1, plan.generatedAt);
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

  /** Direct Plans plus Plans for this Device's Requests (ADR 0002). */
  latestPlanForDevice(deviceId: string): StoredPlan | undefined {
    const row = this.db
      .prepare(
        `SELECT p.id, p.created_at, p.body_json, p.unb1 FROM plans p
         LEFT JOIN requests r ON r.id = p.request_id
         WHERE p.player_key = ? AND (p.request_id IS NULL OR r.device_id = ?)
         ORDER BY p.id DESC LIMIT 1`,
      )
      .get(PLAYER, deviceId) as PlanRow | undefined;
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
    post.account = this.bindAccount(post.account, legacyOf(raw));
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
    this.db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(nowSeconds, id);
  }

  listDevices(): Device[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, secret_hash, status, created_at, last_seen_at, forget_revoked
         FROM devices ORDER BY created_at DESC, id ASC`,
      )
      .all() as DeviceRow[];
    return rows.map(deviceFromRow);
  }

  setDeviceStatus(
    id: string,
    status: DeviceStatus,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): Device | undefined {
    const current = this.deviceById(id);
    if (!current) return undefined;
    this.db
      .prepare(`UPDATE devices SET status = ?, last_seen_at = ?, forget_revoked = 0 WHERE id = ?`)
      .run(status, nowSeconds, id);
    return this.deviceById(id);
  }

  /**
   * Connect again after Forget my data (docs/adr/0045). The old device stays
   * revoked. The new one is approved only when this PC proved the secret of a
   * device it forgot while that device was approved. Same id and secret checks
   * as a first registration; an owner revoke cannot use this.
   */
  reconnectForgotten(input: {
    oldId: string;
    id: string;
    name: string;
    secretHash: string;
    nowSeconds: number;
  }): ReconnectDeviceResult {
    const old = this.deviceById(input.oldId);
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
    if (this.deviceById(input.id)) {
      return { ok: false, status: 409, error: "This device id is already registered." };
    }
    if (this.deviceByHash(input.secretHash)) {
      return { ok: false, status: 409, error: "This device secret is already registered." };
    }
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO devices (id, name, secret_hash, status, created_at, last_seen_at, forget_revoked)
           VALUES (?, ?, ?, 'approved', ?, ?, 0)`,
        )
        .run(input.id, input.name, input.secretHash, input.nowSeconds, input.nowSeconds);
      this.db.prepare(`UPDATE devices SET forget_revoked = 0 WHERE id = ?`).run(old.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const device = this.deviceById(input.id);
    if (!device) return { ok: false, status: 500, error: "Could not store the device." };
    return { ok: true, device };
  }

  addRequest(input: {
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
  }): { created: boolean; request: PlanRequest } {
    const existing = this.requestById(input.id);
    if (existing) {
      if (existing.deviceId !== input.deviceId)
        throw new PlanError("Request id is already in use.");
      return { created: false, request: existing };
    }
    const account = input.account
      ? this.bindAccount(input.account, input.accountLegacy)
      : (this.profileFor(input.character, input.realm || undefined)?.account ?? "");
    this.db
      .prepare(
        `INSERT INTO requests
           (id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at,
            context_json, type, question, topic, item_json, lang, account, suggestion_id, suggestion_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      ...(request.suggestionId ? { suggestionId: request.suggestionId } : {}),
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
  webhookDue(input: {
    nowSeconds: number;
    sinceSeconds: number;
    maxAttempts: number;
    limit?: number;
  }): PlanRequest[] {
    const rows = this.db
      .prepare(
        `SELECT r.id FROM requests r LEFT JOIN webhook_deliveries w ON w.request_id = r.id
         WHERE r.status = 'pending' AND r.created_at >= ? AND w.delivered_at IS NULL
           AND COALESCE(w.attempts, 0) < ? AND COALESCE(w.next_at, 0) <= ?
         ORDER BY r.created_at ASC, r.id ASC LIMIT ?`,
      )
      .all(input.sinceSeconds, input.maxAttempts, input.nowSeconds, input.limit ?? 20) as {
      id: string;
    }[];
    return rows
      .map((row) => this.requestById(row.id))
      .filter((request): request is PlanRequest => request !== undefined);
  }

  listRequests(status = "pending", limit = 50): PlanRequest[] {
    const rows = this.db
      .prepare(
        `SELECT id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account, reason_code,
                suggestion_id, suggestion_json
         FROM requests WHERE status = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
      )
      .all(status, limit) as RequestRow[];
    return rows.map(requestFromRow);
  }

  requestById(id: string): PlanRequest | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account, reason_code,
                suggestion_id, suggestion_json
         FROM requests WHERE id = ?`,
      )
      .get(id) as RequestRow | undefined;
    return row ? requestFromRow(row) : undefined;
  }

  /**
   * The newest Request this device made. Ordered by creation, never by
   * update: failing an old Request must not make it "latest" (D82).
   */
  latestRequestForDevice(deviceId: string): PlanRequest | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_id, character_name, realm, mode, budget, wish, status, reason, plan_id, created_at, updated_at, context_json,
                type, question, topic, item_json, answer_json, lang, account, reason_code,
                suggestion_id, suggestion_json
         FROM requests WHERE device_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(deviceId) as RequestRow | undefined;
    return row ? requestFromRow(row) : undefined;
  }

  fulfillRequest(
    id: string,
    planId: number,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): PlanRequest | undefined {
    if (!this.requestById(id)) return undefined;
    this.db.prepare(`UPDATE plans SET request_id = ? WHERE id = ?`).run(id, planId);
    this.db
      .prepare(
        `UPDATE requests SET status = 'fulfilled', plan_id = ?, reason = NULL, reason_code = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(planId, nowSeconds, id);
    const request = this.requestById(id);
    if (request)
      this.historyFor(request, "plan", { planId, ...this.planSummary(planId) }, nowSeconds);
    return request;
  }

  answerRequest(
    id: string,
    answer: Answer,
    planId: number | null,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): PlanRequest | undefined {
    if (!this.requestById(id)) return undefined;
    if (planId !== null)
      this.db.prepare(`UPDATE plans SET request_id = ? WHERE id = ?`).run(id, planId);
    this.db
      .prepare(
        `UPDATE requests SET status = 'fulfilled', answer_json = ?, plan_id = COALESCE(?, plan_id), reason = NULL,
           reason_code = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(JSON.stringify(answer), planId, nowSeconds, id);
    const request = this.requestById(id);
    if (request) {
      this.historyFor(
        request,
        "answer",
        { message: answer.message, waypoints: answer.waypoints ?? null },
        nowSeconds,
      );
      if (planId)
        this.historyFor(request, "plan", { planId, ...this.planSummary(planId) }, nowSeconds);
    }
    return request;
  }

  failRequest(
    id: string,
    reason: string,
    nowSeconds = Math.floor(Date.now() / 1000),
    reasonCode: string | null = null,
  ): PlanRequest | undefined {
    if (!this.requestById(id)) return undefined;
    this.db
      .prepare(
        `UPDATE requests SET status = 'failed', reason = ?, reason_code = ?, updated_at = ? WHERE id = ?`,
      )
      .run(reason, reasonCode, nowSeconds, id);
    const request = this.requestById(id);
    if (request) this.historyFor(request, "failed", { reason }, nowSeconds);
    return request;
  }

  /**
   * Requests still pending after an hour fail with Reason code `timeout`
   * (D69). Only their status changes, so the game still gets the answer to
   * the Request it waits for (D82).
   */
  expireRequests(nowSeconds = Math.floor(Date.now() / 1000)): string[] {
    const rows = this.db
      .prepare(
        `SELECT id FROM requests WHERE status = 'pending' AND created_at <= ? ORDER BY created_at`,
      )
      .all(nowSeconds - REQUEST_TIMEOUT_SECONDS) as { id: string }[];
    for (const row of rows) {
      this.failRequest(row.id, "No plan came back within an hour.", nowSeconds, "timeout");
    }
    return rows.map((row) => row.id);
  }

  /** How long recent Plan Requests took (p50), for the game's ETA (D68). */
  planEta(): number {
    const rows = this.db
      .prepare(
        `SELECT updated_at - created_at AS took FROM requests
         WHERE status = 'fulfilled' AND type = 'plan' AND updated_at >= created_at
         ORDER BY updated_at DESC LIMIT 50`,
      )
      .all() as { took: number }[];
    if (rows.length < ETA_MIN_SAMPLES) return ETA_DEFAULT_SECONDS;
    const sorted = rows.map((row) => row.took).sort((a, b) => a - b);
    const middle = sorted[Math.floor(sorted.length / 2)]!;
    return Math.min(ETA_MAX_SECONDS, Math.max(ETA_MIN_SECONDS, Math.round(middle)));
  }

  /**
   * A 0.6 profile upload, kept as the Character's `profile` Section: the
   * newest upload wins, an older savedAt is ignored, and an empty field never
   * overwrites a good one (docs/adr/0020, 0029).
   */
  putProfile(
    input: ProfileUpload & { deviceId: string },
    nowSeconds = Math.floor(Date.now() / 1000),
  ): { profile: StoredProfile; updated: boolean } {
    const saved = this.data.ingestProfile(input, nowSeconds);
    const profile = this.exactProfile(input.character, input.realm)!;
    if (saved.updated) {
      this.addHistory({
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
  }

  /** A Game data snapshot upload (docs/adr/0029). */
  putSnapshot(
    snapshot: CleanSnapshot,
    deviceId: string,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): SnapshotResult {
    const changes: SectionChange[] = [];
    const result = this.data.ingestSnapshot(snapshot, deviceId, nowSeconds, changes);
    try {
      this.detectWins(result.account, snapshot.character, snapshot.realm, changes, nowSeconds);
    } catch {
      // Wins are a bonus; a bad body must not fail the upload that was already stored.
    }
    if (result.stored.length > 0) {
      this.suggestions.schedule(result.account);
      const view = this.exactProfile(snapshot.character, snapshot.realm);
      this.addHistory({
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
  }

  /**
   * Plans linked to a Request of this Account, made in the last 30 days, with
   * what each promised (D194, D195). Newest first.
   */
  private openPlans(account: string, now: number) {
    const own = new Set(this.data.characters(account).map((row) => `${row.name}\0${row.realm}`));
    const rows = this.db
      .prepare(
        `SELECT r.id AS request_id, r.account, r.character_name, r.realm, r.topic, r.mode,
                r.suggestion_json, p.id AS plan_id, p.created_at, p.body_json
         FROM requests r JOIN plans p ON p.id = r.plan_id
         WHERE p.created_at >= ? ORDER BY p.created_at DESC, p.id DESC`,
      )
      .all(now - WIN_PLAN_DAYS * 86_400) as {
      request_id: string;
      account: string | null;
      character_name: string;
      realm: string;
      topic: string | null;
      mode: string | null;
      suggestion_json: string | null;
      plan_id: number;
      created_at: number;
      body_json: string;
    }[];
    return rows
      .filter(
        (row) =>
          (account !== "" && row.account === account) ||
          own.has(`${row.character_name}\0${row.realm}`),
      )
      .map((row) => {
        const plan = parseJson<Plan>(row.body_json);
        const suggestion = parseJson<{ kind?: string }>(row.suggestion_json);
        return {
          planId: row.plan_id,
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
  private itemElsewhere(account: string, change: SectionChange, id: number): boolean {
    const places: { scope: "char" | "account"; owner: string; section: string }[] = [
      { scope: "account", owner: account, section: "warband" },
    ];
    for (const row of this.data.characters(account)) {
      for (const section of ["bags", "bank", "reagentBank"]) {
        places.push({ scope: "char", owner: row.id, section });
      }
    }
    return places.some((place) => {
      if (
        place.scope === change.scope &&
        place.owner === change.ownerId &&
        place.section === change.section
      )
        return false;
      const body = this.data.section(place.scope, place.owner, place.section)?.body;
      return body ? unpackIds(body.items).includes(id) : false;
    });
  }

  /**
   * Wins (D196, D197): ids a stored Section newly gained that an open plan of
   * this Account promised, changed after the plan was made. One per id, ever.
   */
  private detectWins(
    account: string,
    character: string,
    realm: string,
    changes: SectionChange[],
    now: number,
  ): number {
    const relevant = changes.filter((change) => WIN_SECTIONS[change.section]);
    if (!account || relevant.length === 0) return 0;
    const plans = this.openPlans(account, now);
    if (plans.length === 0) return 0;
    const moved = new Set(
      changes.filter((change) => WIN_SECTIONS[change.section] === "item").flatMap(removedIds),
    );
    const known = this.db.prepare(
      `SELECT 1 FROM history WHERE kind = 'win' AND account = ? AND ref = ? LIMIT 1`,
    );
    let found = 0;
    for (const change of relevant) {
      const kind = WIN_SECTIONS[change.section]!;
      for (const id of addedIds(change)) {
        const ref = `${kind}:${id}`;
        const plan = plans.find((row) => row.createdAt < change.at && row.targets.has(ref));
        if (!plan || known.get(account, ref)) continue;
        if (kind === "item" && (moved.has(id) || this.itemElsewhere(account, change, id))) continue;
        this.addHistory({
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
  listWins(filter: { account?: string; character?: string; since?: number; limit: number }) {
    const wins: WinEntry[] = this.history({
      account: filter.account,
      character: filter.character,
      since: filter.since,
      kinds: ["win"],
      limit: filter.limit,
    }).map((entry) => {
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
  readyNow(
    filter: { account?: string; character?: string; realm?: string },
    now = Math.floor(Date.now() / 1000),
  ): ReadyNow | undefined {
    const row = filter.character
      ? this.data.character(filter.character, filter.realm)
      : filter.account
        ? this.data.characters(filter.account)[0]
        : this.data.character();
    if (!row || (filter.account && row.accountId !== accountKey(filter.account))) return undefined;
    const others = row.accountId
      ? this.data
          .characters(row.accountId)
          .filter((other) => other.id !== row.id)
          .map((other) => ({ name: other.name, sections: this.data.sectionsFor(other) }))
      : [];
    return readyNow({
      character: row.name,
      realm: row.realm,
      account: row.accountId,
      sections: this.data.sectionsFor(row),
      others,
      taste: row.accountId ? this.taste(row.accountId, now) : [],
      now,
    });
  }

  /** Taste of one Account (D189-D191). */
  taste(account: string, now = Math.floor(Date.now() / 1000)): TasteRow[] {
    return computeTaste(this.db, accountKey(account), this.data.characters(account), now);
  }

  /** list_errors (D178): newest first, with the device name; `new` when first seen after since. */
  listErrors(filter: { account?: string; since?: number; version?: string; limit: number }) {
    return this.data.errors(filter).map((row) => ({
      account: row.account,
      device: row.deviceId ? (this.deviceById(row.deviceId)?.name ?? null) : null,
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
    }));
  }

  private exactProfile(character: string, realm: string): StoredProfile | undefined {
    const row = this.data.character(character, realm);
    return row && row.realm === realm ? this.data.profileView(row) : undefined;
  }

  /** Every character of one Account (docs/adr/0021). */
  profilesForAccount(account: string): StoredProfile[] {
    return this.data.characters(account).map((row) => this.data.profileView(row));
  }

  listAccounts(): { account: string; characters: { character: string; realm: string }[] }[] {
    const out = new Map<string, { character: string; realm: string }[]>();
    for (const row of [...this.data.characters()].sort((a, b) =>
      a.accountId === b.accountId
        ? a.name.localeCompare(b.name)
        : a.accountId.localeCompare(b.accountId),
    )) {
      if (!out.has(row.accountId)) out.set(row.accountId, []);
      out.get(row.accountId)!.push({ character: row.name, realm: row.realm });
    }
    return [...out.entries()].map(([account, characters]) => ({ account, characters }));
  }

  /**
   * Erases one Account (D62): Game data, profiles, Player history, advice and
   * ideas, and by default its Requests and the plans made for them. Used by the
   * owner (delete_account_data) and by the player (Forget my data).
   */
  deleteAccountData(account: string, options: { requests?: boolean } = {}) {
    const key = accountKey(account);
    if (!key) throw new Error("Name the Account to erase.");
    const names = this.data.characters(key).map((row) => [row.name, row.realm] as const);
    const removed = this.data.deleteAccount(key);
    let legacy = 0;
    for (const table of ["profiles", "profile_snapshots", "history", "advice"]) {
      legacy += Number(this.db.prepare(`DELETE FROM ${table} WHERE account = ?`).run(key).changes);
    }
    legacy += Number(
      this.db
        .prepare(`DELETE FROM progress WHERE account = ? OR account LIKE ?`)
        .run(key, `${key}#%`).changes,
    );
    for (const [name, realm] of names) {
      for (const table of ["profiles", "profile_snapshots", "history", "advice"]) {
        legacy += Number(
          this.db
            .prepare(`DELETE FROM ${table} WHERE character_name = ? AND realm = ?`)
            .run(name, realm).changes,
        );
      }
    }
    const suggestions = Number(
      this.db.prepare(`DELETE FROM suggestions WHERE owner_id = ?`).run(key).changes,
    );
    let erased = { requests: 0, plans: 0 };
    if (options.requests !== false) {
      const ids = new Set<string>();
      const add = (rows: unknown[]) => {
        for (const row of rows as { id: string }[]) ids.add(row.id);
      };
      if (key) add(this.db.prepare(`SELECT id FROM requests WHERE account = ?`).all(key));
      for (const [name, realm] of names) {
        add(
          this.db
            .prepare(`SELECT id FROM requests WHERE character_name = ? AND realm = ?`)
            .all(name, realm),
        );
      }
      erased = this.deleteRequests([...ids]);
    }
    return { account: key, ...removed, legacyRows: legacy, suggestions, ...erased };
  }

  /** Requests by id, with their webhook rows and the plans made for them. */
  private deleteRequests(ids: string[]): { requests: number; plans: number } {
    let requests = 0;
    let plans = 0;
    for (const id of ids) {
      const row = this.db.prepare(`SELECT plan_id FROM requests WHERE id = ?`).get(id) as
        | { plan_id: number | null }
        | undefined;
      if (!row) continue;
      plans += Number(
        this.db.prepare(`DELETE FROM plans WHERE request_id = ? OR id = ?`).run(id, row.plan_id)
          .changes,
      );
      this.db.prepare(`DELETE FROM webhook_deliveries WHERE request_id = ?`).run(id);
      requests += Number(this.db.prepare(`DELETE FROM requests WHERE id = ?`).run(id).changes);
    }
    return { requests, plans };
  }

  /**
   * Forget my data: the player erases every Account this device sent data or
   * Requests for, and this device's own Requests, then the device is revoked
   * so nothing more is stored from it.
   */
  forgetDevice(deviceId: string, nowSeconds = Math.floor(Date.now() / 1000)) {
    const accounts = new Set<string>();
    for (const row of this.data.characters()) {
      if (row.deviceId === deviceId && row.accountId) accounts.add(row.accountId);
    }
    for (const table of ["profiles", "requests"]) {
      const rows = this.db
        .prepare(`SELECT DISTINCT account FROM ${table} WHERE device_id = ? AND account <> ''`)
        .all(deviceId) as { account: string | null }[];
      for (const row of rows) if (row.account) accounts.add(accountKey(row.account));
    }
    const totals = { accounts: 0, characters: 0, sections: 0, requests: 0, plans: 0 };
    for (const account of accounts) {
      const removed = this.deleteAccountData(account);
      totals.accounts += 1;
      totals.characters += removed.characters;
      totals.sections += removed.sections;
      totals.requests += removed.requests;
      totals.plans += removed.plans;
    }
    const own = this.db.prepare(`SELECT id FROM requests WHERE device_id = ?`).all(deviceId) as {
      id: string;
    }[];
    const loose = this.deleteRequests(own.map((row) => row.id));
    totals.requests += loose.requests;
    totals.plans += loose.plans;
    const profiles = this.db
      .prepare(`SELECT character_name, realm FROM profiles WHERE device_id = ?`)
      .all(deviceId) as { character_name: string; realm: string }[];
    for (const profile of profiles) {
      for (const table of ["profiles", "profile_snapshots", "history", "advice"]) {
        this.db
          .prepare(`DELETE FROM ${table} WHERE character_name = ? AND realm = ?`)
          .run(profile.character_name, profile.realm);
      }
    }
    const current = this.deviceById(deviceId);
    const reconnect = current?.status === "approved" || current?.forgetRevoked ? 1 : 0;
    this.db
      .prepare(
        `UPDATE devices SET status = 'revoked', last_seen_at = ?, forget_revoked = ? WHERE id = ?`,
      )
      .run(nowSeconds, reconnect, deviceId);
    return { ...totals, revoked: true };
  }

  /**
   * Rename rows stored under a WTF folder key to the salted hash the Companion
   * now sends (docs/adr/0044). No-op when nothing is stored under the old key.
   * Returns the account string to store: the hash when that is what was sent,
   * otherwise the value unchanged so an older Companion still works.
   */
  bindAccount(account: string, legacyRaw: unknown): string {
    const presented = account.trim();
    const legacy = legacyAccountKey(legacyRaw);
    if (legacy && isAccountHash(presented)) this.migrateAccount(legacy, presented);
    return accountKey(presented);
  }

  private migrateAccount(from: string, to: string): void {
    if (!from || !to || from === to || !isAccountHash(to) || isAccountHash(from)) return;
    const textHit = (table: string) =>
      `SELECT 1 FROM ${table} WHERE account = ? OR substr(account, 1, length(?) + 1) = ? || '#'`;
    const hit = this.db
      .prepare(
        `SELECT 1 AS n FROM accounts WHERE id = ?
         UNION ALL SELECT 1 FROM characters WHERE account_id = ?
         UNION ALL ${textHit("progress")}
         UNION ALL ${textHit("requests")}
         UNION ALL ${textHit("profiles")}
         UNION ALL ${textHit("history")}
         UNION ALL ${textHit("profile_snapshots")}
         UNION ALL ${textHit("advice")}
         UNION ALL SELECT 1 FROM suggestions WHERE owner_id = ?
         UNION ALL SELECT 1 FROM sections_latest WHERE owner_kind = 'account' AND owner_id = ?
         UNION ALL SELECT 1 FROM section_history WHERE owner_kind = 'account' AND owner_id = ?
         LIMIT 1`,
      )
      .get(
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
        from,
      );
    if (!hit) return;
    const retarget = (table: string) => {
      this.db
        .prepare(
          `UPDATE ${table} SET account = ?
           WHERE account = ? OR substr(account, 1, length(?) + 1) = ? || '#'`,
        )
        .run(to, from, from, from);
    };
    this.db.exec("BEGIN");
    try {
      const dest = this.db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(to) as
        | { id: string }
        | undefined;
      if (dest) this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(from);
      else this.db.prepare(`UPDATE accounts SET id = ?, label = ? WHERE id = ?`).run(to, to, from);
      this.db.prepare(`UPDATE characters SET account_id = ? WHERE account_id = ?`).run(to, from);
      this.db
        .prepare(`UPDATE OR IGNORE addon_errors SET account = ? WHERE account = ?`)
        .run(to, from);
      this.db.prepare(`DELETE FROM addon_errors WHERE account = ?`).run(from);
      for (const table of [
        "progress",
        "requests",
        "profiles",
        "history",
        "profile_snapshots",
        "advice",
      ]) {
        retarget(table);
      }
      this.db.prepare(`UPDATE suggestions SET owner_id = ? WHERE owner_id = ?`).run(to, from);
      const clash = this.db
        .prepare(
          `SELECT section FROM sections_latest WHERE owner_kind = 'account' AND owner_id = ?`,
        )
        .all(to) as { section: string }[];
      for (const row of clash) {
        this.db
          .prepare(
            `DELETE FROM sections_latest WHERE owner_kind = 'account' AND owner_id = ? AND section = ?`,
          )
          .run(from, row.section);
      }
      for (const table of ["sections_latest", "section_history"]) {
        this.db
          .prepare(`UPDATE ${table} SET owner_id = ? WHERE owner_kind = 'account' AND owner_id = ?`)
          .run(to, from);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
      .run(
        entry.at,
        entry.account,
        entry.character,
        entry.realm,
        entry.kind,
        entry.ref,
        JSON.stringify(entry.body),
      );
  }

  private historyFor(
    request: PlanRequest,
    kind: HistoryKind,
    body: unknown,
    at = request.updatedAt,
  ): void {
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

  /** Whole 0.6 profile uploads, newest first, from the `profile` Section history. */
  profileSnapshots(filter: {
    account?: string;
    character?: string;
    realm?: string;
    limit: number;
  }): {
    at: number;
    account: string;
    character: string;
    realm: string;
    savedAt: number | null;
    profile: unknown;
  }[] {
    const characters = (
      filter.account ? this.data.characters(filter.account) : this.data.characters()
    ).filter(
      (row) =>
        (!filter.character || row.name === filter.character) &&
        (!filter.realm || row.realm === filter.realm),
    );
    const byId = new Map(characters.map((row) => [row.id, row]));
    return this.data
      .history({
        owners: characters.map((row) => ({ kind: "char" as const, id: row.id })),
        sections: ["profile"],
        limit: filter.limit,
      })
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
  putItemAdvice(input: {
    character: string;
    realm: string;
    account?: string;
    items: ItemAdvice[];
    replace?: boolean;
    nowSeconds?: number;
  }): number {
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    const account = accountKey(
      input.account || this.exactProfile(input.character, input.realm)?.account || "",
    );
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

  /**
   * Advice for every character this device uploaded data for, with the Account
   * digest (its Alts) so routing works for Alts seen on other PCs (D76).
   */
  /** Suggestions for this device's characters (docs/adr/0040). */
  suggestionsForDevice(deviceId: string) {
    const rows = this.data
      .characters()
      .filter((row) => deviceId === "legacy" || row.deviceId === deviceId);
    return this.suggestions.body(rows);
  }

  /**
   * The holdings index (ADR 0048) for the Account of this device's most
   * recently seen Character; the addon shows it only on that Account.
   */
  holdingsForDevice(deviceId: string, now?: number): Holdings | null {
    const row = this.data
      .characters()
      .find((other) => (deviceId === "legacy" || other.deviceId === deviceId) && other.accountId);
    if (!row) return null;
    const holdings = this.data.holdings(row, now);
    return holdings.places.length ? holdings : null;
  }

  adviceForDevice(deviceId: string): DeviceAdvice[] {
    const rows = this.db
      .prepare(
        `SELECT a.character_name, a.realm, a.item_id, a.body_json, a.updated_at FROM advice a
         JOIN characters c ON c.name = a.character_name AND c.realm = a.realm
         WHERE c.device_id = ? OR ? = 'legacy' ORDER BY a.character_name, a.realm, a.item_id`,
      )
      .all(deviceId, deviceId) as {
      character_name: string;
      realm: string;
      item_id: number;
      body_json: string;
      updated_at: number;
    }[];
    const out = new Map<string, DeviceAdvice>();
    for (const character of this.data.characters()) {
      if (deviceId !== "legacy" && character.deviceId !== deviceId) continue;
      const key = `${character.realm}\0${character.name}`;
      if (out.has(key)) continue;
      out.set(key, {
        character: character.name,
        realm: character.realm,
        updatedAt: 0,
        items: [],
        alts: this.data.accountAlts(character),
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
        ...parseJson<Omit<ItemAdvice, "itemID">>(row.body_json),
      } as ItemAdvice);
    }
    return [...out.values()];
  }

  /** The named character, or the most recently updated one. */
  profileFor(character?: string, realm?: string): StoredProfile | undefined {
    const row = this.data.character(character, realm);
    return row ? this.data.profileView(row) : undefined;
  }

  listProfiles(): Omit<StoredProfile, "profile">[] {
    return this.data.characters().map((row) => ({
      character: row.name,
      realm: row.realm,
      account: row.accountId,
      deviceId: row.deviceId ?? "",
      savedAt: row.savedAt || null,
      updatedAt: row.lastSeen,
    }));
  }

  deviceById(id: string): Device | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, secret_hash, status, created_at, last_seen_at, forget_revoked
         FROM devices WHERE id = ?`,
      )
      .get(id) as DeviceRow | undefined;
    return row ? deviceFromRow(row) : undefined;
  }

  private deviceByHash(secretHash: string): Device | undefined {
    const row = this.db
      .prepare(
        `SELECT id, name, secret_hash, status, created_at, last_seen_at, forget_revoked
         FROM devices WHERE secret_hash = ?`,
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
  context_json: string | null;
  type: string | null;
  question: string | null;
  topic: string | null;
  item_json: string | null;
  answer_json: string | null;
  lang: string | null;
  account: string | null;
  reason_code: string | null;
  suggestion_id: string | null;
  suggestion_json: string | null;
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
  body_json: string;
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
