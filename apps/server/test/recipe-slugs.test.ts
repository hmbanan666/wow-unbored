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
