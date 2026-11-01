import type { Sql } from "./postgres.ts";

/**
 * Retention jobs (ADR 0057 rollout step 5), Postgres only. Once a day, and at
 * startup, the Server:
 *
 * - makes the month partitions of `section_history` and `history` for this
 *   month and the next two, so a write never lands on a missing partition;
 * - detaches (`DETACH ... CONCURRENTLY`) and drops the month partitions that
 *   ended more than 13 months ago, so history is never deleted row by row;
 * - deletes `raw_uploads` rows 7 days after they were processed (`done`) and
 *   30 days after they failed.
 *
 * SQLite keeps everything as before: the job is not started there.
 */
export const RETENTION = {
  /** Months of `section_history` and `history` kept before this month. */
  historyMonths: 13,
  /** Partitions made ahead of this month. */
  monthsAhead: 2,
  doneUploadDays: 7,
  failedUploadDays: 30,
  /** Rows per DELETE, so one batch never holds many locks. */
  deleteBatch: 5_000,
  everyMs: 24 * 60 * 60 * 1000,
  /** Two Servers starting together run the job once. */
  lock: 57_0005,
};

export const PARTITIONED = ["section_history", "history"] as const;
const PARTITION = /^(section_history|history)_y(\d{4})m(\d{2})$/;
const DAY = 24 * 60 * 60;

export type RetentionReport = {
  /** Partitions made. */
  made: number;
  /** Partitions dropped, by name. */
  dropped: string[];
  /** raw_uploads rows deleted. */
  doneUploads: number;
  failedUploads: number;
  /** False when another Server held the lock and this run did nothing. */
  ran: boolean;
};

function monthStart(nowSeconds: number, offset: number): Date {
  const now = new Date(nowSeconds * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Month partitions of `section_history` and `history`, this month through
 * `ahead` months later. Returns how many it made.
 */
export async function ensurePartitions(
  sql: Sql,
  nowSeconds = Math.floor(Date.now() / 1000),
  ahead = RETENTION.monthsAhead,
): Promise<number> {
  return ensureMonths(sql, monthStart(nowSeconds, 0), monthStart(nowSeconds, ahead));
}

/** Month partitions from the month of `first` through the month of `last`. */
export async function ensureMonths(sql: Sql, first: Date, last: Date): Promise<number> {
  let made = 0;
  for (const table of PARTITIONED) {
    const [row] = await sql`
      SELECT ensure_month_partitions(${table}, ${day(first)}::date, ${day(last)}::date) AS made`;
    made += Number(row.made);
  }
  return made;
}

/**
 * The first second still kept: the start of the month `historyMonths` before
 * this one. A partition that ends at or before it is dropped.
 */
export function historyCutoff(nowSeconds: number, months = RETENTION.historyMonths): number {
  return monthStart(nowSeconds, -months).getTime() / 1000;
}

/**
 * Drops the month partitions that ended before the cutoff. A partition still
 * attached is detached concurrently first (no lock on the parent for writers);
 * one a crashed run left `DETACH PENDING` is finalized first (a parent
 * allows only one pending detach); one already detached
 * but not dropped is dropped. Months come from the partition name, which
 * `ensure_month_partitions` sets.
 */
export async function dropOldPartitions(
  sql: Sql,
  nowSeconds = Math.floor(Date.now() / 1000),
  months = RETENTION.historyMonths,
): Promise<string[]> {
  const cutoff = historyCutoff(nowSeconds, months);
  const rows = await sql<{ name: string; parent: string | null; pending: boolean | null }[]>`
    SELECT c.relname AS name, p.relname AS parent, i.inhdetachpending AS pending
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = current_schema()
    LEFT JOIN pg_inherits i ON i.inhrelid = c.oid
    LEFT JOIN pg_class p ON p.oid = i.inhparent
    WHERE c.relkind = 'r' AND c.relname ~ '^(section_history|history)_y[0-9]{4}m[0-9]{2}$'
    -- A parent allows one pending detach at a time: finish those first.
    ORDER BY coalesce(i.inhdetachpending, false) DESC, c.relname`;
  const dropped: string[] = [];
  for (const row of rows) {
    const match = PARTITION.exec(row.name);
    if (!match) continue;
    const [, table, year, month] = match;
    // The partition covers [year-month-01, next month): it ends at the next month.
    const end = Date.UTC(Number(year), Number(month), 1) / 1000;
    if (end > cutoff) continue;
    // DETACH CONCURRENTLY cannot run in a transaction and waits for readers:
    // its own connection with no statement timeout.
    const conn = await sql.reserve();
    try {
      await conn`SET statement_timeout = 0`;
      if (row.parent === table) {
        const mode = row.pending ? "FINALIZE" : "CONCURRENTLY";
        await conn.unsafe(`ALTER TABLE "${table}" DETACH PARTITION "${row.name}" ${mode}`);
      } else if (row.parent !== null) {
        // Attached to something else: not ours to drop.
        continue;
      }
      await conn.unsafe(`DROP TABLE IF EXISTS "${row.name}"`);
      dropped.push(row.name);
    } finally {
      await conn`RESET statement_timeout`.catch(() => {});
      conn.release();
    }
  }
  return dropped;
}

/** Deletes processed inbox rows past their retention, in batches. */
export async function cleanUploads(
  sql: Sql,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ done: number; failed: number }> {
  const purge = async (state: "done" | "failed", days: number) => {
    const before = nowSeconds - days * DAY;
    let total = 0;
    for (;;) {
      const result = await sql`
        DELETE FROM raw_uploads WHERE id IN (
          SELECT id FROM raw_uploads
          WHERE state = ${state} AND processed_at IS NOT NULL AND processed_at < ${before}
          LIMIT ${RETENTION.deleteBatch})`;
      total += result.count;
      if (result.count < RETENTION.deleteBatch) return total;
    }
  };
  return {
    done: await purge("done", RETENTION.doneUploadDays),
    failed: await purge("failed", RETENTION.failedUploadDays),
  };
}

/** One retention pass. Skipped (ran: false) while another Server runs it. */
export async function runRetention(
  sql: Sql,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<RetentionReport> {
  const conn = await sql.reserve();
  try {
    const [lock] = await conn`SELECT pg_try_advisory_lock(${RETENTION.lock}) AS ok`;
    if (!lock.ok) return { made: 0, dropped: [], doneUploads: 0, failedUploads: 0, ran: false };
    try {
      const made = await ensurePartitions(sql, nowSeconds);
      const dropped = await dropOldPartitions(sql, nowSeconds);
      const uploads = await cleanUploads(sql, nowSeconds);
      return {
        made,
        dropped,
        doneUploads: uploads.done,
        failedUploads: uploads.failed,
        ran: true,
      };
    } finally {
      await conn`SELECT pg_advisory_unlock(${RETENTION.lock})`;
    }
  } finally {
    conn.release();
  }
}

/** Runs `runRetention` now and then every RETENTION.everyMs, in this process. */
export class RetentionJob {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<RetentionReport | undefined> | undefined;
  private readonly sql: Sql;
  private readonly log: (line: string) => void;
  private readonly clock: () => number;

  constructor(
    sql: Sql,
    log: (line: string) => void = () => {},
    clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.sql = sql;
    this.log = log;
    this.clock = clock;
  }

  /** Runs once (awaited, so startup has next months' partitions) and schedules the rest. */
  async start(): Promise<RetentionReport | undefined> {
    if (this.timer) return undefined;
    this.timer = setInterval(() => void this.run(), RETENTION.everyMs);
    this.timer.unref?.();
    return this.run();
  }

  /** One pass; errors are logged, never thrown, so a bad day does not stop the Server. */
  run(): Promise<RetentionReport | undefined> {
    this.running ??= (async () => {
      try {
        const report = await runRetention(this.sql, this.clock());
        if (
          report.ran &&
          (report.made || report.dropped.length || report.doneUploads || report.failedUploads)
        ) {
          this.log(
            `Retention: made ${report.made} partitions, dropped ${report.dropped.length ? report.dropped.join(", ") : "none"}, deleted ${report.doneUploads} done and ${report.failedUploads} failed uploads`,
          );
        }
        return report;
      } catch (error) {
        this.log(`Retention failed: ${(error as Error).message}`);
        return undefined;
      } finally {
        this.running = undefined;
      }
    })();
    return this.running;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
