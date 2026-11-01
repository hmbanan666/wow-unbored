import { randomBytes } from "node:crypto";

import postgres from "postgres";

import { connectPostgres, migrate, migrationsHash, type Sql } from "../src/postgres.ts";

/**
 * Per-test-file PostgreSQL databases (ADR 0057). CI sets
 * UNBORED_TEST_DATABASE_URL to the `postgres:18` service; locally the
 * Postgres tests are skipped without it.
 */
export const ADMIN_URL = process.env.UNBORED_TEST_DATABASE_URL?.trim() || undefined;
export const hasPostgres = ADMIN_URL !== undefined;

const TEMPLATE_LOCK = 57_0002;

function urlFor(database: string): string {
  const url = new URL(ADMIN_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

function admin() {
  return postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
}

/** A migrated template, made once per set of migration files. */
async function template(sql: ReturnType<typeof admin>): Promise<string> {
  const name = `unbored_tpl_${migrationsHash().slice(0, 12)}`;
  const [found] = await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
  if (found) return name;
  const building = `${name}_build`;
  await sql.unsafe(`DROP DATABASE IF EXISTS "${building}" WITH (FORCE)`);
  await sql.unsafe(`CREATE DATABASE "${building}"`);
  const fresh = connectPostgres(urlFor(building), { max: 1 });
  try {
    await migrate(fresh);
  } finally {
    await fresh.end();
  }
  await sql.unsafe(`ALTER DATABASE "${building}" RENAME TO "${name}"`);
  return name;
}

/** An empty database; `migrated` copies the template, so the schema is current. */
export async function testDatabase(options: { migrated?: boolean } = {}) {
  if (!ADMIN_URL) throw new Error("UNBORED_TEST_DATABASE_URL is not set.");
  const root = admin();
  const name = `unbored_test_${process.pid}_${randomBytes(4).toString("hex")}`;
  const conn = await root.reserve();
  try {
    await conn`SELECT pg_advisory_lock(${TEMPLATE_LOCK})`;
    try {
      const from = options.migrated === false ? "template0" : await template(conn as never);
      await conn.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${from}"`);
    } finally {
      await conn`SELECT pg_advisory_unlock(${TEMPLATE_LOCK})`;
    }
  } finally {
    conn.release();
  }
  const url = urlFor(name);
  const sql: Sql = connectPostgres(url, { max: 4 });
  return {
    name,
    url,
    sql,
    async drop() {
      await sql.end();
      await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await root.end();
    },
  };
}
