import { expect, test } from "vite-plus/test";
import { testDatabase, hasPostgres } from "../../server/test/postgres-db";
const dbTest = test.skipIf(!hasPostgres);
import { readPublicProfessions } from "../server/utils/public-professions";
import { readPickerCharacters, ownsCharacter } from "../server/utils/selected-character";
import {
  seedPublicProfessions,
  fixtureAccount,
  fixtureOtherAccount,
  fixtureCharacter,
} from "./public-professions-fixture";
import { characterKey, parseCharacter } from "../shared/selected-character";

test("character cookies round-trip spaces and escaped separators and reject invalid values", () => {
  expect(parseCharacter(characterKey(fixtureCharacter))).toEqual(fixtureCharacter);
  const special = { ...fixtureCharacter, realm: "A / B", name: "Mira% Sun" };
  expect(parseCharacter(characterKey(special))).toEqual(special);
  for (const value of [
    null,
    "other/realm/name",
    "forever//name",
    "forever/realm/%zz",
    "forever/realm/name/extra",
    "forever/realm/%00",
  ])
    expect(parseCharacter(value)).toBeNull();
});

dbTest(
  "public catalog joins English item names and aggregate sightings without Account identities",
  async () => {
    const db = await testDatabase();
    try {
      await seedPublicProfessions(db.sql);
      const catalog = await readPublicProfessions(db.sql, "forever");
      const enchanting = catalog.find((p) => p.slug === "enchanting")!;
      expect(enchanting.album).toHaveLength(262);
      const rod = enchanting.album.find((r) => r.name === "Runed Copper Rod")!;
      expect(rod.sources).toHaveLength(1);
      expect(rod.sources[0]).toMatchObject({
        npcName: "Fixture trainer",
        zone: "Elwynn Forest",
        cost: 80,
        firstSeen: 1,
        lastSeen: 2,
      });
      expect(rod.difficulty).toMatchObject({ score: 0, reasons: ["Seen at a trainer"] });
      expect(rod.reagents.some((r) => r.name !== null)).toBe(true);
      expect(JSON.stringify(catalog)).not.toContain(fixtureAccount);
      expect(JSON.stringify(catalog)).not.toContain(fixtureOtherAccount);
      expect(await readPublicProfessions(db.sql, "retail")).toEqual([]);
      expect(await readPickerCharacters(db.sql, fixtureAccount)).toEqual([
        { ...fixtureCharacter, class: "WARLOCK", level: 23 },
      ]);
      expect(await readPickerCharacters(db.sql, fixtureOtherAccount)).toEqual([]);
      expect(await ownsCharacter(db.sql, fixtureAccount, fixtureCharacter)).toBe(true);
      expect(await ownsCharacter(db.sql, fixtureOtherAccount, fixtureCharacter)).toBe(false);
    } finally {
      await db.drop();
    }
  },
);

dbTest(
  "a profession with only unnamed catalog rows is listed, without inventing recipe pages",
  async () => {
    const db = await testDatabase();
    try {
      await seedPublicProfessions(db.sql);
      await db.sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) SELECT 'forever', 'fixture', 185, 9999, body || '{"spellId":9999,"skillLine":185,"name":null}'::jsonb FROM game.profession_recipes LIMIT 1`;
      const cooking = (await readPublicProfessions(db.sql, "forever")).find(
        (p) => p.slug === "cooking",
      );
      expect(cooking).toEqual({ name: "Cooking", skillLine: 185, slug: "cooking", album: [] });
    } finally {
      await db.drop();
    }
  },
);

dbTest(
  "Forever trainer sightings under a client profession tier resolve to its base catalog",
  async () => {
    const db = await testDatabase();
    try {
      await seedPublicProfessions(db.sql);
      await db.sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES ('forever', 'fixture', 'SkillLine', 'enUS', 2940, '{"ParentSkillLineID":333}'::jsonb)`;
      await db.sql`UPDATE recipe_sightings SET skill_line = 2940 WHERE kind = 'trainer'`;
      const rod = (await readPublicProfessions(db.sql, "forever"))
        .find((p) => p.slug === "enchanting")!
        .album.find((r) => r.spellId === 7421)!;
      expect(rod.sources[0]?.npcName).toBe("Fixture trainer");
    } finally {
      await db.drop();
    }
  },
);
