import { afterAll, beforeAll, beforeEach } from "vite-plus/test";

import type { Sql } from "../src/postgres.ts";
import { hasPostgres, testDatabase } from "./postgres-db.ts";

/**
 * The backend the whole suite runs on (ADR 0057). Default SQLite, as live hk;
 * `UNBORED_TEST_BACKEND=postgres` (with UNBORED_TEST_DATABASE_URL) runs every
 * Store and app of a test file on one Postgres database, emptied before each
 * test. Importing this module registers those hooks for the file.
 */
export const TEST_BACKEND: "sqlite" | "postgres" =
  process.env.UNBORED_TEST_BACKEND === "postgres" ? "postgres" : "sqlite";
export const onPostgres = TEST_BACKEND === "postgres";

if (onPostgres && !hasPostgres) {
  throw new Error("UNBORED_TEST_BACKEND=postgres needs UNBORED_TEST_DATABASE_URL.");
}

let db: Awaited<ReturnType<typeof testDatabase>> | undefined;
if (onPostgres) {
  beforeAll(async () => {
    db = await testDatabase();
  });
  afterAll(async () => {
    await db?.drop();
    db = undefined;
  });
  beforeEach(async () => {
    const tables = await db!.sql<{ name: string }[]>`
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`;
    await db!.sql.unsafe(
      `TRUNCATE ${tables.map((t) => `"${t.name}"`).join(", ")} RESTART IDENTITY`,
    );
  });
}

/** The Postgres pool of this file on the Postgres run; undefined on SQLite. */
export function database(): Sql | undefined {
  if (!onPostgres) return undefined;
  if (!db) throw new Error("The test database is not ready yet.");
  return db.sql;
}

/**
 * createApp options for this run. The whole-suite Postgres run ingests inline
 * (200 with the result, as on SQLite); `inbox.test.ts` covers the 202 inbox.
 */
export function storage(): { database?: Sql; ingest: "inline" } {
  return { database: database(), ingest: "inline" };
}
