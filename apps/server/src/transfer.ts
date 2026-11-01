import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { migrate, type Sql } from "./postgres.ts";

/**
 * The one-off SQLite -> PostgreSQL transfer (ADR 0057 rollout step 6), run by
 * `scripts/sqlite-to-postgres.ts`. It reads the SQLite file read-only,
 * migrates the target, and in ONE transaction copies every table in batches,
 * with `*_json` text parsed into jsonb objects and the month partitions of
 * `section_history` and `history` made back to their oldest row. Before it
 * commits it compares row counts and a checksum of every table on both sides;
 * any mismatch rolls everything back. A dry run does the same and always
 * rolls back, reading from a fresh copy of the file.
 */

/** Legacy tables (D57): already backfilled, they stay only in the SQLite file. */
export const LEGACY_TABLES = new Set(["profiles", "profile_snapshots"]);
/** Postgres-only tables: not in SQLite, must be empty before a transfer. */
const POSTGRES_ONLY = new Set(["raw_uploads"]);
const PARTITIONED = new Set(["section_history", "history"]);

export type TransferOptions = {
  /** The SQLite file (`$UNBORED_DATA_DIR/unbored.sqlite`). */
  sqlitePath: string;
  /** Target pool; the transfer sets no statement timeout on its own connection. */
  sql: Sql;
  /** Empty the target tables first instead of refusing when they have rows. */
  force?: boolean;
  /** Copy and verify, then roll back: the target stays as it was. */
  dryRun?: boolean;
  /** Rows per INSERT (also capped at about 4 MB of JSON per batch). */
  batchRows?: number;
  log?: (line: string) => void;
};

export type TableReport = {
  table: string;
  rows: number;
  /** Order-independent sha256 multiset sum of the rows, hex. */
  checksum: string;
};

export type TransferReport = {
  tables: TableReport[];
  /** Legacy tables left in SQLite, with their row counts. */
  skipped: { table: string; rows: number }[];
  /** Month partitions made for historic rows. */
  partitions: number;
  committed: boolean;
};

export class TransferError extends Error {}

type Column = { sqlite: string; pg: string; json: boolean };
type Plan = { table: string; columns: Column[]; key: string[]; identity: boolean };

const MOD = 1n << 256n;

/** Sum of the rows' sha256 digests mod 2^256: the same set of rows in any order, same sum. */
class Checksum {
  rows = 0;
  private sum = 0n;
  add(values: unknown[]) {
    const digest = createHash("sha256").update(JSON.stringify(values)).digest("hex");
    this.sum = (this.sum + BigInt(`0x${digest}`)) % MOD;
    this.rows += 1;
  }
  hex() {
    return this.sum.toString(16).padStart(64, "0");
  }
}

/** JSON with sorted object keys, so jsonb's key order does not matter. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function parseJson(table: string, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new TransferError(`${table}.${column}: expected JSON text, got ${typeof value}`);
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new TransferError(`${table}.${column}: not JSON (${(error as Error).message})`, {
      cause: error,
    });
  }
}

/** A value as both sides compare it: numbers as numbers, JSON parsed with sorted keys. */
function comparable(value: unknown, json: boolean): unknown {
  if (value === undefined || value === null) return null;
  if (json) return canonical(value);
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  return value;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function sqliteTables(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
}

async function plan(db: DatabaseSync, sql: Sql): Promise<{ plans: Plan[]; skipped: string[] }> {
  const pgColumns = await sql<{ table: string; column: string; type: string; identity: string }[]>`
    SELECT c.table_name AS table, c.column_name AS column, c.data_type AS type,
      c.is_identity AS identity
    FROM information_schema.columns c
    JOIN pg_class k ON k.relname = c.table_name AND NOT k.relispartition
    JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = c.table_schema
    WHERE c.table_schema = current_schema() AND c.table_name <> 'schema_migrations'`;
  const byTable = new Map<string, Map<string, { type: string; identity: boolean }>>();
  for (const row of pgColumns) {
    if (!byTable.has(row.table)) byTable.set(row.table, new Map());
    byTable.get(row.table)!.set(row.column, { type: row.type, identity: row.identity === "YES" });
  }
  const plans: Plan[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const table of sqliteTables(db)) {
    if (LEGACY_TABLES.has(table)) {
      skipped.push(table);
      continue;
    }
    const target = byTable.get(table);
    if (!target) throw new TransferError(`SQLite table ${table} has no Postgres table.`);
    seen.add(table);
    const info = db.prepare(`PRAGMA table_info(${quote(table)})`).all() as {
      name: string;
      pk: number;
    }[];
    const columns: Column[] = info.map((column) => {
      const pg = column.name === "body_json" ? "body" : column.name;
      const found = target.get(pg);
      if (!found) throw new TransferError(`${table}.${column.name} has no Postgres column.`);
      return { sqlite: column.name, pg, json: found.type === "jsonb" };
    });
    const key = info
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const identity = [...target.values()].some((column) => column.identity);
    plans.push({ table, columns, key, identity });
  }
  for (const table of byTable.keys()) {
    if (!seen.has(table) && !POSTGRES_ONLY.has(table)) {
      throw new TransferError(`Postgres table ${table} is missing in the SQLite file.`);
    }
  }
  return { plans, skipped };
}

/** Copies the SQLite file through the online backup API (safe while a Server writes it). */
export async function snapshotCopy(source: string): Promise<{ path: string; remove: () => void }> {
  const dir = mkdtempSync(path.join(tmpdir(), "unbored-transfer-"));
  const copy = path.join(dir, "unbored.sqlite");
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, copy);
  } finally {
    db.close();
  }
  return { path: copy, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

class Rollback extends Error {}

export async function transfer(options: TransferOptions): Promise<TransferReport> {
  const log = options.log ?? (() => {});
  const batchRows = options.batchRows ?? 500;
  const copy = options.dryRun ? await snapshotCopy(options.sqlitePath) : undefined;
  const db = new DatabaseSync(copy?.path ?? options.sqlitePath, { readOnly: true });
  try {
    if (!sqliteTables(db).includes("accounts")) {
      throw new TransferError(`${options.sqlitePath} is not an Unbored SQLite file.`);
    }
    const applied = await migrate(options.sql);
    if (applied.length) log(`Migrated the target: ${applied.join(", ")}`);
    const { plans, skipped } = await plan(db, options.sql);
    const skippedRows = skipped.map((table) => ({
      table,
      rows: Number(
        (db.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get() as { n: number }).n,
      ),
    }));

    let report: TransferReport | undefined;
    try {
      await options.sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = 0`;
        const targets = [...plans.map((p) => p.table), ...POSTGRES_ONLY];
        const busy: string[] = [];
        for (const table of targets) {
          const [row] = await tx.unsafe(`SELECT EXISTS (SELECT 1 FROM ${quote(table)}) AS any`);
          if (row.any) busy.push(table);
        }
        if (busy.length && !options.force) {
          throw new TransferError(
            `The target already has rows in ${busy.join(", ")}. Use --force to empty it first.`,
          );
        }
        if (busy.length) {
          log(`--force: emptying ${busy.join(", ")}`);
          await tx.unsafe(`TRUNCATE ${targets.map(quote).join(", ")} RESTART IDENTITY`);
        }

        let partitions = 0;
        for (const table of PARTITIONED) {
          const range = db
            .prepare(`SELECT min(at) AS lo, max(at) AS hi FROM ${quote(table)}`)
            .get() as {
            lo: number | null;
            hi: number | null;
          };
          if (range.lo === null || range.hi === null) continue;
          const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
          const [row] = await tx`
            SELECT ensure_month_partitions(${table}, ${day(range.lo)}::date, ${day(range.hi)}::date) AS made`;
          partitions += Number(row.made);
        }
        if (partitions) log(`Made ${partitions} month partitions for historic rows`);

        const tables: TableReport[] = [];
        const mismatches: string[] = [];
        for (const p of plans) {
          const source = new Checksum();
          const order = p.key.length ? p.key.map(quote).join(", ") : "rowid";
          const select = `SELECT ${p.columns.map((c) => quote(c.sqlite)).join(", ")} FROM ${quote(p.table)} ORDER BY ${order}`;
          const pgColumns = p.columns.map((c) => c.pg);
          let batch: Record<string, unknown>[] = [];
          let bytes = 0;
          const flush = async () => {
            if (!batch.length) return;
            await tx`INSERT INTO ${tx(p.table)} ${tx(batch as never, pgColumns)}`;
            batch = [];
            bytes = 0;
          };
          for (const raw of db.prepare(select).iterate() as Iterable<Record<string, unknown>>) {
            const row: Record<string, unknown> = {};
            const values: unknown[] = [];
            for (const c of p.columns) {
              let value = raw[c.sqlite] ?? null;
              if (c.json) {
                const parsed = parseJson(p.table, c.sqlite, value);
                values.push(comparable(parsed, true));
                // JSON text as is: Postgres parses it into the jsonb object.
                value = parsed === null ? null : (value as string);
                bytes += typeof value === "string" ? value.length : 0;
              } else {
                if (typeof value === "bigint") value = value.toString();
                values.push(comparable(value, false));
              }
              row[c.pg] = value;
            }
            source.add(values);
            batch.push(row);
            if (batch.length >= batchRows || bytes >= 4 * 1024 * 1024) await flush();
          }
          await flush();
          if (p.identity) {
            await tx.unsafe(
              `SELECT setval(pg_get_serial_sequence($1, 'id'), max(id)) FROM ${quote(p.table)} HAVING max(id) IS NOT NULL`,
              [p.table],
            );
          }

          const target = new Checksum();
          const read = tx.unsafe(
            `SELECT ${pgColumns.map(quote).join(", ")} FROM ${quote(p.table)}`,
          );
          for await (const rows of read.cursor(1000)) {
            for (const row of rows) {
              target.add(p.columns.map((c) => comparable(row[c.pg], c.json)));
            }
          }
          const ok = source.rows === target.rows && source.hex() === target.hex();
          log(
            `${p.table}: ${source.rows} rows, checksum ${source.hex().slice(0, 16)} ${ok ? "ok" : `MISMATCH (target ${target.rows} rows, ${target.hex().slice(0, 16)})`}`,
          );
          if (!ok) mismatches.push(p.table);
          tables.push({ table: p.table, rows: source.rows, checksum: source.hex() });
        }
        if (mismatches.length) {
          throw new TransferError(
            `Row counts or checksums differ in ${mismatches.join(", ")}; nothing was committed.`,
          );
        }
        report = { tables, skipped: skippedRows, partitions, committed: !options.dryRun };
        if (options.dryRun) throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    for (const s of skippedRows)
      log(`${s.table}: ${s.rows} rows left in SQLite (legacy, not moved)`);
    return report!;
  } finally {
    db.close();
    copy?.remove();
  }
}
