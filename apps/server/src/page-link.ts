import { randomBytes } from "node:crypto";

import { sha256Hex } from "./auth.ts";
import { accountId } from "./data.ts";
import type { Db } from "./db.ts";

/** A sign-in link works once, for 10 minutes (ADR 0073). */
export const PAGE_LINK_SECONDS = 10 * 60;

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

function tables(pg: boolean) {
  return {
    links: pg ? "web.sign_in_links" : "web_sign_in_links",
    sessions: pg ? "web.sessions" : "web_sessions",
  };
}

async function ensureSqlite(db: Db): Promise<void> {
  if (db.pg) return;
  await db.run(`CREATE TABLE IF NOT EXISTS web_sign_in_links (
    token_hash TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS web_sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ended_at INTEGER
  )`);
}

/** The Account this Device has been sending, newest Character first. */
export async function accountForDevice(db: Db, deviceId: string): Promise<string | undefined> {
  const character = await db.get<{ account_id: string }>(
    `SELECT account_id FROM characters WHERE device_id = ? AND account_id <> '' ORDER BY last_seen DESC LIMIT 1`,
    deviceId,
  );
  if (character?.account_id) return character.account_id;
  const request = await db.get<{ account: string }>(
    `SELECT account FROM requests WHERE device_id = ? AND account <> '' ORDER BY updated_at DESC LIMIT 1`,
    deviceId,
  );
  const key = request?.account ? accountId(request.account) : "";
  return key || undefined;
}

export async function issuePageLink(
  db: Db,
  input: { deviceId: string; accountId: string; now: number; origin: string },
): Promise<{ url: string; expiresAt: number }> {
  await ensureSqlite(db);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = input.now + PAGE_LINK_SECONDS;
  const { links } = tables(db.pg);
  await db.run(
    `INSERT INTO ${links} (token_hash, device_id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
    sha256Hex(token),
    input.deviceId,
    input.accountId,
    input.now,
    expiresAt,
  );
  return { url: `${input.origin}/enter/${token}`, expiresAt };
}

export type RedeemResult =
  | { ok: true; sessionId: string; accountId: string; deviceId: string }
  | { ok: false; error: "unknown" | "used" | "expired" };

/** Marks the link used and opens a session. A second call cannot replay it. */
export async function redeemPageLink(db: Db, token: string, now: number): Promise<RedeemResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "unknown" };
  await ensureSqlite(db);
  const hash = sha256Hex(token);
  const { links, sessions } = tables(db.pg);
  return db.tx(async () => {
    const row = await db.get<{ account_id: string; device_id: string }>(
      `UPDATE ${links} SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING account_id, device_id`,
      now,
      hash,
      now,
    );
    if (row) {
      const sessionId = randomBytes(18).toString("base64url");
      await db.run(
        `INSERT INTO ${sessions} (id, account_id, device_id, created_at) VALUES (?, ?, ?, ?)`,
        sessionId,
        row.account_id,
        row.device_id,
        now,
      );
      return { ok: true as const, sessionId, accountId: row.account_id, deviceId: row.device_id };
    }
    const existing = await db.get<{ used_at: number | null; expires_at: number }>(
      `SELECT used_at, expires_at FROM ${links} WHERE token_hash = ?`,
      hash,
    );
    if (!existing) return { ok: false as const, error: "unknown" as const };
    if (existing.used_at !== null && existing.used_at !== undefined)
      return { ok: false as const, error: "used" as const };
    return { ok: false as const, error: "expired" as const };
  });
}

/** Forget my data ends every open session and unused link for this Device. */
export async function endPageSessions(
  db: Db,
  input: { accounts: string[]; deviceId: string; now: number },
): Promise<void> {
  await ensureSqlite(db);
  const { links, sessions } = tables(db.pg);
  const accounts = input.accounts.filter(Boolean);
  const marks = accounts.map(() => "?").join(", ");
  const accountSql = accounts.length ? `OR account_id IN (${marks})` : "";
  await db.run(
    `UPDATE ${sessions} SET ended_at = ? WHERE ended_at IS NULL AND (device_id = ? ${accountSql})`,
    input.now,
    input.deviceId,
    ...accounts,
  );
  await db.run(
    `DELETE FROM ${links} WHERE device_id = ? ${accountSql}`,
    input.deviceId,
    ...accounts,
  );
}
