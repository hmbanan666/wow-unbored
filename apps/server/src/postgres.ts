import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import postgres from "postgres";

/**
 * PostgreSQL storage (ADR 0057). Off while DATABASE_URL is unset: the Server
 * then runs on SQLite only. Times are bigint epoch seconds and read back as
 * numbers, as `node:sqlite` returns them.
 */
const epochSeconds = {
  to: 20,
  from: [20],
  serialize: (value: number) => String(value),
  parse: (value: string) => Number(value),
};

/**
 * json/jsonb parameters: the storage layer (db.ts) sends JSON as the text
 * `JSON.stringify` made, so it goes to the server as is. The default would
 * stringify it again and store a jsonb string instead of the object. Other
 * values (an object from a tagged template) are stringified once.
 */
const jsonText = {
  to: 3802,
  from: [114, 3802],
  serialize: (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value)),
  parse: (value: string) => JSON.parse(value) as unknown,
};

export function connectPostgres(
  url: string,
  options: { max?: number; statementTimeoutMs?: number; application_name?: string } = {},
) {
  return postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    types: { bigint: epochSeconds, jsonText },
    // The request path never waits on one statement for more than 5 s.
    connection: {
      statement_timeout: options.statementTimeoutMs ?? 5000,
      application_name: options.application_name ?? "unbored-server",
    },
  });
}

export type Sql = ReturnType<typeof connectPostgres>;

export const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
/** Any constant: two Servers starting at once apply each file once. */
const MIGRATION_LOCK = 57_0001;
const FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

export function migrationFiles(dir: URL = MIGRATIONS_DIR) {
  const files = readdirSync(dir)
    .filter((name) => FILE.test(name))
    .sort()
    .map((name) => ({ version: Number(FILE.exec(name)![1]), name, url: new URL(name, dir) }));
  const versions = new Set(files.map((file) => file.version));
  if (versions.size !== files.length) throw new Error("Two migrations share a number.");
  return files;
}

/** sha256 of every migration, in order; the test template is named by it. */
export function migrationsHash(dir: URL = MIGRATIONS_DIR): string {
  const hash = createHash("sha256");
  for (const file of migrationFiles(dir)) hash.update(file.name).update(readFileSync(file.url));
  return hash.digest("hex");
}

/**
 * Applies the numbered SQL files not in `schema_migrations` yet, each in its own
 * transaction, under a session advisory lock. Returns the names it applied.
 */
export async function migrate(sql: Sql, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  const files = migrationFiles(dir);
  const applied: string[] = [];
  const conn = await sql.reserve();
  try {
    // Migrations and the lock wait are not on the request path.
    await conn`SET statement_timeout = 0`;
    await conn`SELECT pg_advisory_lock(${MIGRATION_LOCK})`;
    try {
      await conn`CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;
      const done = new Set(
        (await conn`SELECT version FROM schema_migrations`).map((row) => Number(row.version)),
      );
      for (const file of files) {
        if (done.has(file.version)) continue;
        await conn.unsafe("BEGIN");
        try {
          await conn.unsafe(readFileSync(file.url, "utf8"));
          await conn`INSERT INTO schema_migrations (version, name) VALUES (${file.version}, ${file.name})`;
          await conn.unsafe("COMMIT");
        } catch (error) {
          await conn.unsafe("ROLLBACK");
          throw new Error(`Migration ${file.name} failed: ${(error as Error).message}`, {
            cause: error,
          });
        }
        applied.push(file.name);
      }
    } finally {
      await conn`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`;
    }
  } finally {
    await conn`RESET statement_timeout`.catch(() => {});
    conn.release();
  }
  return applied;
}
