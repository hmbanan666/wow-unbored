import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";

import { configFromEnv } from "../src/config.ts";
import { ensurePartitions, migrate, migrationFiles } from "../src/postgres.ts";
import { Store } from "../src/store.ts";
import { hasPostgres, testDatabase } from "./postgres-db.ts";

const tokens = { UNBORED_COMPANION_TOKEN: "c", UNBORED_PLANNER_TOKEN: "p" };
const pg = test.skipIf(!hasPostgres);

test("the Server workflow runs the Postgres tests", async () => {
  if (process.env.UNBORED_REQUIRE_POSTGRES === "1") {
    assert.ok(hasPostgres, "UNBORED_TEST_DATABASE_URL must be set");
  }
});

test("without DATABASE_URL the Server stays on SQLite", async () => {
  const config = configFromEnv(tokens);
  assert.equal(config.databaseUrl, undefined);
  assert.equal(config.databasePoolMax, 10);
  assert.equal(configFromEnv({ ...tokens, DATABASE_URL: "  " }).databaseUrl, undefined);
});

test("DATABASE_URL and DATABASE_POOL_MAX are read and checked", async () => {
  const config = configFromEnv({
    ...tokens,
    DATABASE_URL: " postgres://u:p@db:5432/unbored ",
    DATABASE_POOL_MAX: "4",
  });
  assert.equal(config.databaseUrl, "postgres://u:p@db:5432/unbored");
  assert.equal(config.databasePoolMax, 4);
  assert.throws(() => configFromEnv({ ...tokens, DATABASE_URL: "mysql://db/x" }), /DATABASE_URL/);
  for (const bad of ["0", "101", "2.5", "many"]) {
    assert.throws(
      () => configFromEnv({ ...tokens, DATABASE_POOL_MAX: bad }),
      /DATABASE_POOL_MAX/,
      bad,
    );
  }
});

test("migrations are numbered once each", async () => {
  const files = migrationFiles();
  assert.equal(files[0]?.name, "0001_schema.sql");
  assert.deepEqual(
    files.map((file) => file.version),
    files.map((_, index) => index + 1),
  );
});

pg("migrate applies each file once, also when two Servers start together", async () => {
  const db = await testDatabase({ migrated: false });
  try {
    const runs = await Promise.all([migrate(db.sql), migrate(db.sql), migrate(db.sql)]);
    assert.deepEqual(runs.flat(), ["0001_schema.sql", "0002_raw_uploads.sql"]);
    assert.deepEqual(await migrate(db.sql), []);
    const rows = await db.sql`SELECT version, name FROM schema_migrations ORDER BY version`;
    assert.deepEqual(
      rows.map((row) => [row.version, row.name]),
      [
        [1, "0001_schema.sql"],
        [2, "0002_raw_uploads.sql"],
      ],
    );
  } finally {
    await db.drop();
  }
});

pg("the schema has every SQLite table and column, but the legacy profiles", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "unbored-pg-"));
  new Store(dir).close();
  const sqlite = new DatabaseSync(path.join(dir, "unbored.sqlite"), { readOnly: true });
  const db = await testDatabase();
  try {
    const tables = (
      sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[]
    )
      .map((row) => row.name)
      .filter((name) => name !== "profiles" && name !== "profile_snapshots");
    assert.ok(tables.length >= 17);
    for (const table of tables) {
      const expected = (
        sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[]
      )
        .map((column) => (column.name === "body_json" ? "body" : column.name))
        .sort();
      const actual = (
        await db.sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}`
      )
        .map((row) => row.column_name as string)
        .sort();
      assert.deepEqual(actual, expected, table);
    }
    const legacy =
      await db.sql`SELECT to_regclass('profiles') AS a, to_regclass('profile_snapshots') AS b`;
    assert.deepEqual([legacy[0].a, legacy[0].b], [null, null]);
    const json = await db.sql`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND (column_name = 'body' OR column_name LIKE '%\_json')
        AND data_type <> 'jsonb'`;
    assert.deepEqual([...json], [], "body and *_json columns are jsonb");
  } finally {
    sqlite.close();
    await db.drop();
  }
});

pg("history tables are partitioned by UTC month of at", async () => {
  const db = await testDatabase();
  try {
    const at = Math.floor(Date.UTC(2026, 9, 31, 23, 59, 59) / 1000);
    const [row] = await db.sql`
      INSERT INTO history (at, character_name, realm, kind, body)
      VALUES (${at}, 'Mira', 'Realm', 'win', ${db.sql.json({ a: 1 })})
      RETURNING id, at, tableoid::regclass::text AS part`;
    assert.equal(row.part, "history_y2026m10");
    assert.equal(row.at, at, "bigint reads back as a number");
    const [next] = await db.sql`
      INSERT INTO section_history (owner_kind, owner_id, section, at, hash, kind, body)
      VALUES ('char', 'c', 'bags', ${at + 1}, 'h', 'full', '{}')
      RETURNING tableoid::regclass::text AS part`;
    assert.equal(next.part, "section_history_y2026m11");

    const far = Math.floor(Date.UTC(2031, 2, 15) / 1000);
    await assert.rejects(
      db.sql`INSERT INTO history (at, character_name, realm, kind, body)
        VALUES (${far}, 'Mira', 'Realm', 'win', '{}')`,
      /no partition/,
    );
    assert.equal(await ensurePartitions(db.sql, far), 4, "this month and the next, both tables");
    assert.equal(await ensurePartitions(db.sql, far), 0);
    await db.sql`INSERT INTO history (at, character_name, realm, kind, body)
      VALUES (${far}, 'Mira', 'Realm', 'win', '{}')`;
  } finally {
    await db.drop();
  }
});
