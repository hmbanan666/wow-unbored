import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { hasPostgres, testDatabase } from "./postgres-db.ts";
import { migrate, migrationFiles } from "../src/postgres.ts";
import { GameDb } from "../src/game-db.ts";
import { PostgresDb } from "../src/db.ts";

const oldBuild = "12.0.1.66337";

test("an existing SQLite Game DB upgrades to Retail and keeps names, rows and watch state", async () => {
  const dataDir = mkdtempSync(path.join(import.meta.dirname, ".game-migration-"));
  const raw = new DatabaseSync(path.join(dataDir, "unbored.sqlite"));
  raw.exec(`
    CREATE TABLE game_builds (build TEXT PRIMARY KEY, build_number INTEGER UNIQUE, imported_at INTEGER, achievements INTEGER);
    CREATE TABLE game_rows (build TEXT REFERENCES game_builds(build), table_name TEXT, locale TEXT, id INTEGER, body_json TEXT, PRIMARY KEY (build, table_name, locale, id));
    CREATE TABLE game_achievements (build TEXT REFERENCES game_builds(build), id INTEGER, name_en TEXT, name_ru TEXT, PRIMARY KEY (build, id));
    CREATE TABLE game_watch (id INTEGER PRIMARY KEY CHECK (id = 1), live_build TEXT, pending_since INTEGER, checked_at INTEGER, last_error TEXT);
    INSERT INTO game_builds VALUES ('${oldBuild}', 66337, 10, 1);
    INSERT INTO game_achievements VALUES ('${oldBuild}', 964, 'Going Down?', 'Летим!');
    INSERT INTO game_rows VALUES ('${oldBuild}', 'ItemSparse', 'enUS', 19019, '{"ID":19019,"Display_lang":"Thunderfury"}');
    INSERT INTO game_watch VALUES (1, '12.0.1.66338', 20, 30, 'import_failed');
  `);
  raw.close();
  const app = createApp({
    dataDir,
    ingest: "inline",
    blizzard: null,
    companionToken: "companion",
    plannerToken: "owner",
    webhook: { url: "", key: "", headerName: "" },
    log: () => {},
  });
  try {
    assert.equal(await app.store.game.currentBuild(), oldBuild);
    assert.equal((await app.store.game.entity("achievement", 964))?.names.enUS, "Going Down?");
    assert.equal(
      (await app.store.game.row("ItemSparse", 19019))?.fields.Display_lang,
      "Thunderfury",
    );
    assert.equal((await app.store.game.status()).pendingSince, 20);
    assert.equal((await app.store.game.status()).lastError, "import_failed");
    assert.equal(await app.store.game.forGame("forever").currentBuild(), undefined);
    assert.equal(
      await app.store.game.forGame("forever").row("ItemSparse", 19019, "enUS", oldBuild),
      undefined,
    );
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test.skipIf(!hasPostgres)(
  "0030 preserves an existing Postgres import as Retail and permits identical build ids in Forever",
  async () => {
    const db = await testDatabase({ migrated: false });
    const directory = mkdtempSync(path.join(import.meta.dirname, ".old-migrations-"));
    try {
      for (const file of migrationFiles().filter((f) => f.version < 30))
        copyFileSync(file.url, path.join(directory, file.name));
      await migrate(db.sql, pathToFileURL(directory + "/"));
      await db.sql`INSERT INTO game.builds VALUES (${oldBuild}, 66337, 10, 1)`;
      await db.sql`INSERT INTO game.achievements VALUES (${oldBuild}, 964, 'Going Down?', 'Летим!')`;
      await db.sql`INSERT INTO game.rows VALUES (${oldBuild}, 'ItemSparse', 'enUS', 19019, '{"ID":19019,"Display_lang":"Thunderfury"}'::jsonb)`;
      await db.sql`INSERT INTO game.imports VALUES (${oldBuild}, '{"ItemSparse":1}'::jsonb)`;
      await db.sql`INSERT INTO game.watch VALUES (1, '12.0.1.66338', 20, 30, 'import_failed')`;
      assert.deepEqual(await migrate(db.sql), [
        "0030_game_dimension.sql",
        "0031_recipe_sightings.sql",
        "0032_character_events.sql",
        "0033_character_goals.sql",
        "0034_recipe_slugs.sql",
      ]);
      const game = new GameDb(new PostgresDb(db.sql), directory);
      assert.equal((await game.entity("achievement", 964))?.names.enUS, "Going Down?");
      assert.equal((await game.row("ItemSparse", 19019))?.fields.Display_lang, "Thunderfury");
      assert.equal((await game.status()).pendingSince, 20);
      await db.sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements) VALUES ('forever', ${oldBuild}, 66337, 15, 0)`;
      await db.sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES ('forever', ${oldBuild}, 'ItemSparse', 'enUS', 19019, '{"ID":19019,"Display_lang":"Forever item"}'::jsonb)`;
      assert.equal(
        (await game.forGame("forever").row("ItemSparse", 19019))?.fields.Display_lang,
        "Forever item",
      );
      assert.equal((await game.row("ItemSparse", 19019))?.fields.Display_lang, "Thunderfury");
      assert.deepEqual(await migrate(db.sql), []);
    } finally {
      await db.drop();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
