import { test, expect } from "vite-plus/test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { testDatabase, hasPostgres } from "./postgres-db.ts";
import { migrate, migrationFiles } from "../src/postgres.ts";
test.skipIf(!hasPostgres)(
  "0036 upgrades 0035 and the restricted web role can read but cannot write",
  async () => {
    const db = await testDatabase({ migrated: false });
    const dir = mkdtempSync(path.join(import.meta.dirname, ".quest-migration-"));
    try {
      for (const f of migrationFiles().filter((f) => f.version <= 35))
        copyFileSync(f.url, path.join(dir, f.name));
      await migrate(db.sql, pathToFileURL(dir + "/"));
      await db.sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN CREATE ROLE unbored_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END $$`;
      expect(await migrate(db.sql)).toEqual(["0036_quest_sightings.sql"]);
      expect(await migrate(db.sql)).toEqual([]);
      await db.sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES ('owner', 'Owner', 1, 1)`;
      for (const [id, title] of [
        [1, "Same Name"],
        [2, "Same Name"],
        [3, "Same Name 2"],
        [4, null],
        [5, "Chains"],
      ] as const)
        await db.sql`INSERT INTO quest_sightings (account_id, game, quest_id, kind, title, first_seen, last_seen) VALUES ('owner','forever',${id},'accept',${title},1,1)`;
      await db.sql`UPDATE quest_sightings SET title = 'Renamed'`;
      expect(
        (await db.sql`SELECT slug FROM game.quest_slugs ORDER BY quest_id`).map((r) => r.slug),
      ).toEqual(["same-name", "same-name-2", "same-name-2-3", "quest-4", "chains-5"]);
      // Old installs created the role before 0031; reproduce those existing grants here.
      await db.sql`GRANT USAGE ON SCHEMA game TO unbored_web`;
      await db.sql`GRANT SELECT ON game.rows, game.builds, characters, sections_latest TO unbored_web`;
      await db.sql.begin(async (sql) => {
        await sql`SET LOCAL ROLE unbored_web`;
        expect(await sql`SELECT quest_id, title FROM quest_sightings`).toHaveLength(5);
        expect(await sql`SELECT slug FROM game.quest_slugs`).toHaveLength(5);
        expect(await sql`SELECT body FROM game.quest_chains`).toEqual([]);
        await expect(sql.savepoint(async (tx) => tx`DELETE FROM quest_sightings`)).rejects.toThrow(
          /permission denied/,
        );
        await expect(
          sql.savepoint(async (tx) => tx`INSERT INTO game.quest_slugs VALUES ('forever',9,'no')`),
        ).rejects.toThrow(/permission denied/);
      });
      await db.sql`DELETE FROM accounts WHERE id = 'owner'`;
      expect(await db.sql`SELECT quest_id FROM quest_sightings`).toEqual([]);
      expect(await db.sql`SELECT slug FROM game.quest_slugs`).toHaveLength(5);
    } finally {
      await db.drop();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
