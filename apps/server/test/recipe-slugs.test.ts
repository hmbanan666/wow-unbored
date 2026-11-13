import { expect, test } from "vite-plus/test";
import { testDatabase, hasPostgres } from "./postgres-db.ts";

const dbTest = test.skipIf(!hasPostgres);
dbTest(
  "recipe addresses survive rebuilds, renames and collisions, and unnamed rows have no address",
  async () => {
    const db = await testDatabase();
    try {
      await db.sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements) VALUES ('forever', 'one', 1, 1, 0)`;
      for (const [id, name] of [
        [1, "Enchant Bracer - Agility"],
        [2, "Enchant Bracer: Agility"],
        [3, null],
        [4, "Enchant Bracer Agility 2"],
      ] as const) {
        await db.sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) VALUES ('forever', 'one', 333, ${id}, ${JSON.stringify({ name })}::jsonb)`;
      }
      const addresses = () =>
        db.sql`SELECT spell_id, slug FROM game.recipe_slugs ORDER BY spell_id`;
      expect(await addresses()).toEqual([
        { spell_id: 1, slug: "enchant-bracer-agility" },
        { spell_id: 2, slug: "enchant-bracer-agility-2" },
        { spell_id: 4, slug: "enchant-bracer-agility-2-4" },
      ]);
      await db.sql`DELETE FROM game.profession_recipes`;
      for (const id of [4, 2, 1]) {
        await db.sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) VALUES ('forever', 'one', 333, ${id}, '{"name":"Renamed"}'::jsonb)`;
      }
      expect((await addresses()).map((r) => r.slug)).toEqual([
        "enchant-bracer-agility",
        "enchant-bracer-agility-2",
        "enchant-bracer-agility-2-4",
      ]);
      await db.sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements) VALUES ('forever', 'two', 2, 2, 0)`;
      await db.sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) VALUES
        ('forever', 'two', 333, 1, '{"name":"New English name"}'::jsonb),
        ('forever', 'two', 333, 5, '{"name":"Enchant Bracer Agility"}'::jsonb)`;
      expect((await addresses()).map((r) => r.slug)).toEqual([
        "enchant-bracer-agility",
        "enchant-bracer-agility-2",
        "enchant-bracer-agility-2-4",
        "enchant-bracer-agility-5",
      ]);
    } finally {
      await db.drop();
    }
  },
);

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { migrate, migrationFiles } from "../src/postgres.ts";
dbTest("migration backfills existing catalogs in build and spell order", async () => {
  const db = await testDatabase({ migrated: false });
  const dir = mkdtempSync(path.join(import.meta.dirname, ".slug-migration-"));
  try {
    for (const file of migrationFiles().filter((f) => f.version <= 33))
      copyFileSync(file.url, path.join(dir, file.name));
    await migrate(db.sql, pathToFileURL(dir + "/"));
    await db.sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements) VALUES ('forever', 'old', 1, 1, 0), ('forever', 'new', 2, 2, 0)`;
    await db.sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) VALUES
      ('forever', 'new', 333, 1, '{"name":"Renamed recipe"}'),
      ('forever', 'old', 333, 2, '{"name":"Same Name"}'),
      ('forever', 'old', 333, 1, '{"name":"Same name"}'),
      ('forever', 'old', 333, 3, '{"name":null}')`;
    await migrate(db.sql);
    expect(await db.sql`SELECT spell_id, slug FROM game.recipe_slugs ORDER BY spell_id`).toEqual([
      { spell_id: 1, slug: "same-name" },
      { spell_id: 2, slug: "same-name-2" },
    ]);
  } finally {
    await db.drop();
    rmSync(dir, { recursive: true, force: true });
  }
});
