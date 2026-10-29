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
