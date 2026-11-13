import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "vite-plus/test";
import { Store } from "../src/store.ts";
import { hasPostgres, testDatabase } from "./postgres-db.ts";
import { migrate, migrationFiles } from "../src/postgres.ts";

test("an existing SQLite database gains recipe sightings without losing Accounts", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".sightings-migration-"));
  let store = new Store(dir);
  try {
    await store.db.run(
      "INSERT INTO accounts (id, label, first_seen, last_seen) VALUES ('old', 'old', 1, 2)",
    );
    await store.db.run("DROP TABLE recipe_sightings");
    store.close();
    store = new Store(dir);
    assert.equal((await store.data.accounts())[0]?.id, "old");
    assert.deepEqual(await store.game.forGame("forever").recipeSources(171), {
      game: "forever",
      skillLine: 171,
      build: null,
      recipes: [],
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test.skipIf(!hasPostgres)(
  "0031 applies once over an existing 0030 database and cascades Forget",
  async () => {
    const db = await testDatabase({ migrated: false });
    const dir = mkdtempSync(path.join(import.meta.dirname, ".sightings-migration-"));
    try {
      for (const file of migrationFiles().filter((f) => f.version <= 30))
        copyFileSync(file.url, path.join(dir, file.name));
      await migrate(db.sql, pathToFileURL(dir + "/"));
      await db.sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES ('old', 'old', 1, 2)`;
      assert.deepEqual(await migrate(db.sql), [
        "0031_recipe_sightings.sql",
        "0032_character_events.sql",
        "0033_character_goals.sql",
        "0034_recipe_slugs.sql",
        "0035_page_link_character.sql",
        "0036_quest_sightings.sql",
        "0037_character_feeds.sql",
      ]);
      await db.sql`INSERT INTO recipe_sightings (account_id, game, kind, source_key, npc_id, npc_name, limited, first_seen, last_seen) VALUES ('old', 'forever', 'vendor', 'i2555', 123, 'Vendor', 1, 1, 2)`;
      assert.deepEqual(await migrate(db.sql), []);
      await db.sql`DELETE FROM accounts WHERE id = 'old'`;
      assert.equal((await db.sql`SELECT count(*)::int AS n FROM recipe_sightings`)[0]!.n, 0);
    } finally {
      await db.drop();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
