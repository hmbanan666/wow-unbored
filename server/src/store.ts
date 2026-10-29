import { DatabaseSync } from "node:sqlite";

import { sqlitePath } from "./config.ts";
import {
  cleanPlan,
  cleanProgress,
  encodeUnb1,
  type Plan,
  type ProgressBody,
  type ProgressPost,
} from "./plan.ts";

const PLAYER = "self";

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
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER
      );
    `);
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
