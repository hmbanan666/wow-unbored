import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { characterId, cleanSnapshot, type CleanSnapshot, type SnapshotResult } from "./data.ts";
import type { PostgresDb } from "./db.ts";
import { PlanError } from "./plan.ts";
import type { Sql } from "./postgres.ts";
import type { Store } from "./store.ts";

/**
 * The upload inbox (ADR 0057 rollout step 4), Postgres only. `POST /v1/snapshot`
 * checks the upload on the request path, stores the gzip bytes in `raw_uploads`
 * and answers 202. The worker here claims queued rows with
 * `FOR UPDATE SKIP LOCKED`, the oldest of each Account first, and runs today's
 * ingest (Sections, wins, history, Suggestions) in the claim's transaction.
 */
export const INBOX = {
  /** Claims in flight at once. */
  concurrency: 2,
  /** Poll even without a NOTIFY. */
  pollMs: 5_000,
  /** Attempts before a row becomes failed. */
  attempts: 5,
  /** Backoff after attempt n: base * 2^(n-1) seconds. */
  backoffSeconds: 5,
  /** Requests and planner data tools wait at most this long for queued uploads. */
  barrierMs: 10_000,
  barrierStepMs: 100,
  channel: "raw_uploads",
};

/** Sections a plan needs first: their uploads jump the queue. */
const HOT_SECTIONS = new Set(["questLog", "bags"]);

export type UploadState = "queued" | "done" | "failed";

export type UploadResult = Pick<SnapshotResult, "stored" | "unchanged" | "unknown" | "stale">;

export type UploadStatus = {
  id: string;
  state: UploadState;
  receivedAt: number;
  processedAt: number | null;
  attempts: number;
  result: UploadResult | null;
  error: string | null;
};

export type FailedUpload = UploadStatus & {
  account: string;
  deviceId: string;
  character: string;
  bytes: number;
};

type UploadRow = {
  id: number;
  account_id: string;
  device_id: string;
  character_id: string;
  state: UploadState;
  attempts: number;
  bytes: number;
  received_at: number;
  processed_at: number | null;
  result: UploadResult | null;
  last_error: string | null;
};

const STATUS_COLUMNS = `id, account_id, device_id, character_id, state, attempts, bytes,
  received_at, processed_at, result, last_error`;

function statusOf(row: UploadRow): UploadStatus {
  return {
    id: String(row.id),
    state: row.state,
    receivedAt: Number(row.received_at),
    processedAt: row.processed_at === null ? null : Number(row.processed_at),
    attempts: row.attempts,
    result: row.state === "done" ? row.result : null,
    error: row.state === "done" ? null : row.last_error,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class UploadInbox {
  private running = false;
  private active = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unlisten: (() => Promise<void>) | undefined;
  private idleWaiters: (() => void)[] = [];

  private readonly store: Store;
  private readonly db: PostgresDb;
  private readonly sql: Sql;
  private readonly log: (line: string) => void;
  /** Epoch seconds; tests move it to skip a backoff. */
  clock: () => number;

  constructor(
    store: Store,
    db: PostgresDb,
    sql: Sql,
    log: (line: string) => void = () => {},
    clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.store = store;
    this.db = db;
    this.sql = sql;
    this.log = log;
    this.clock = clock;
  }

  /**
   * Queues a checked upload. Call it inside the device's write transaction
   * (Store.asDevice): the row and the NOTIFY commit with it. A body this
   * Account already sent returns the existing row.
   */
  async enqueue(input: {
    deviceId: string;
    snapshot: CleanSnapshot;
    inflated: Buffer;
    gzipped: Buffer | null;
    nowSeconds?: number;
  }): Promise<{ id: string; state: UploadState; created: boolean }> {
    const hash = createHash("sha256").update(input.inflated).digest("hex");
    const body = input.gzipped ?? gzipSync(input.inflated);
    const priority = input.snapshot.sections.some((section) => HOT_SECTIONS.has(section.name))
      ? 1
      : 0;
    const account = input.snapshot.account;
    const inserted = await this.db.get<{ id: number }>(
      `INSERT INTO raw_uploads
         (account_id, device_id, character_id, hash, priority, body_gz, bytes, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, hash) DO NOTHING
       RETURNING id`,
      account,
      input.deviceId,
      characterId(input.snapshot.character, input.snapshot.realm),
      hash,
      priority,
      body,
      input.inflated.byteLength,
      input.nowSeconds ?? this.clock(),
    );
    if (inserted) {
      await this.db.run(`SELECT pg_notify(?, ?)`, INBOX.channel, String(inserted.id));
      return { id: String(inserted.id), state: "queued", created: true };
    }
    const existing = await this.db.get<{ id: number; state: UploadState }>(
      `SELECT id, state FROM raw_uploads WHERE account_id = ? AND hash = ?`,
      account,
      hash,
    );
    if (!existing) throw new Error("The upload was neither stored nor found.");
    return { id: String(existing.id), state: existing.state, created: false };
  }

  /** One upload of this device; undefined for another device's or a missing id. */
  async status(id: string, deviceId: string): Promise<UploadStatus | undefined> {
    if (!/^\d{1,18}$/.test(id)) return undefined;
    const row = await this.db.get<UploadRow>(
      `SELECT ${STATUS_COLUMNS} FROM raw_uploads WHERE id = ? AND device_id = ?`,
      id,
      deviceId,
    );
    return row ? statusOf(row) : undefined;
  }

  /** Failed uploads, newest first, for the owner (MCP list_failed_uploads). */
  async failed(options: { account?: string; limit: number }): Promise<FailedUpload[]> {
    const rows = await this.db.all<UploadRow>(
      `SELECT ${STATUS_COLUMNS} FROM raw_uploads
       WHERE state = 'failed' ${options.account ? "AND account_id = ?" : ""}
       ORDER BY processed_at DESC, id DESC LIMIT ?`,
      ...(options.account ? [options.account] : []),
      options.limit,
    );
    return rows.map((row) => ({
      ...statusOf(row),
      account: row.account_id,
      deviceId: row.device_id,
      character: row.character_id,
      bytes: row.bytes,
    }));
  }

  /**
   * Read barrier: waits until the Account (every Account without one) has no
   * upload queued before now, for at most INBOX.barrierMs. Returns whether it
   * settled; on false the caller reads what is there.
   */
  async settle(account?: string, maxMs = INBOX.barrierMs): Promise<boolean> {
    const since = this.clock();
    const deadline = Date.now() + maxMs;
    for (;;) {
      const row = await this.db.get(
        `SELECT 1 AS n FROM raw_uploads
         WHERE state = 'queued' AND received_at <= ? ${account ? "AND account_id = ?" : ""}
         LIMIT 1`,
        since,
        ...(account ? [account] : []),
      );
      if (!row) return true;
      if (Date.now() >= deadline) return false;
      this.wake();
      await sleep(Math.min(INBOX.barrierStepMs, Math.max(1, deadline - Date.now())));
    }
  }

  /** Starts the worker: LISTEN plus a poll every INBOX.pollMs. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const listener = await this.sql.listen(INBOX.channel, () => this.wake());
      this.unlisten = () => listener.unlisten();
    } catch (error) {
      this.log(`Upload inbox: LISTEN failed, polling only (${(error as Error).message})`);
    }
    this.wake();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const unlisten = this.unlisten;
    this.unlisten = undefined;
    await unlisten?.().catch(() => {});
    while (this.active > 0) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  /** Fills the free worker slots; each drains the queue, then sleeps. */
  wake(): void {
    if (!this.running) return;
    while (this.active < INBOX.concurrency) {
      this.active += 1;
      void this.drain().finally(() => {
        this.active -= 1;
        if (this.active === 0) for (const resolve of this.idleWaiters.splice(0)) resolve();
        this.schedule();
      });
    }
  }

  private schedule() {
    if (!this.running || this.active > 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.wake();
    }, INBOX.pollMs);
    this.timer.unref?.();
  }

  private async drain(): Promise<void> {
    while (this.running) {
      let worked: boolean;
      try {
        worked = await this.processNext();
      } catch (error) {
        this.log(`Upload inbox: ${(error as Error).message}`);
        return;
      }
      if (!worked) return;
    }
  }

  /**
   * Claims and processes one row; false when nothing is due. Only the oldest
   * queued row of an Account is eligible, so one Account's uploads apply in
   * `received_at` order; the advisory lock skips an Account a Forget or an
   * Account migration holds.
   */
  async processNext(): Promise<boolean> {
    const now = this.clock();
    return this.db.tx(async () => {
      const row = await this.db.get<UploadRow & { body_gz: Buffer }>(
        `SELECT u.id, u.account_id, u.device_id, u.character_id, u.attempts, u.received_at, u.body_gz
         FROM raw_uploads u
         WHERE u.state = 'queued' AND u.next_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM raw_uploads o
             WHERE o.account_id = u.account_id AND o.state = 'queued'
               AND (o.received_at, o.id) < (u.received_at, u.id))
         ORDER BY u.priority DESC, u.received_at, u.id
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        now,
      );
      if (!row) return false;
      const locked = await this.db.get<{ ok: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtext(?)) AS ok`,
        `account:${row.account_id}`,
      );
      if (!locked?.ok) return false;
      const device = await this.db.get<{ status: string }>(
        `SELECT status FROM devices WHERE id = ? FOR SHARE`,
        row.device_id,
      );
      if (row.device_id !== "legacy" && device?.status !== "approved") {
        // Revoked or forgotten after the 202: drop the bytes, write nothing.
        await this.db.run(`DELETE FROM raw_uploads WHERE id = ?`, row.id);
        return true;
      }
      try {
        const result = await this.db.savepoint(() => this.ingest(row));
        await this.db.run(
          `UPDATE raw_uploads SET state = 'done', result = ?, processed_at = ?,
             attempts = attempts + 1, last_error = NULL
           WHERE id = ?`,
          JSON.stringify(result),
          this.clock(),
          row.id,
        );
      } catch (error) {
        const attempts = row.attempts + 1;
        const permanent = error instanceof PlanError;
        const failed = permanent || attempts >= INBOX.attempts;
        const message = ((error as Error).message ?? String(error)).slice(0, 500);
        await this.db.run(
          `UPDATE raw_uploads SET attempts = ?, last_error = ?, state = ?, next_at = ?,
             processed_at = ?
           WHERE id = ?`,
          attempts,
          message,
          failed ? "failed" : "queued",
          now + INBOX.backoffSeconds * 2 ** (attempts - 1),
          failed ? this.clock() : null,
          row.id,
        );
        this.log(
          `Upload inbox: upload ${row.id} attempt ${attempts} ${failed ? "failed" : "will retry"}: ${message}`,
        );
      }
      return true;
    });
  }

  private async ingest(row: UploadRow & { body_gz: Buffer }): Promise<UploadResult> {
    const inflated = gunzipSync(row.body_gz);
    const snapshot = cleanSnapshot(JSON.parse(inflated.toString("utf8")));
    snapshot.account = row.account_id;
    const result = await this.store.putSnapshot(snapshot, row.device_id, Number(row.received_at));
    return {
      stored: result.stored,
      unchanged: result.unchanged,
      unknown: result.unknown,
      stale: result.stale,
    };
  }
}
