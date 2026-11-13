import { expect, test, beforeEach, afterEach } from "vite-plus/test";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db";
import {
  seedPublicProfessions,
  fixtureAccount,
  fixtureOtherAccount,
  fixtureCharacter,
} from "./public-professions-fixture";
import { readProfileHome } from "../server/utils/profile-home";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
  if (hasPostgres) {
    db = await testDatabase();
    await seedPublicProfessions(db.sql);
    await seedProfile();
  }
});
afterEach(async () => {
  await db?.drop();
});
async function seedProfile() {
  const id = `forever/${fixtureCharacter.realm}/${fixtureCharacter.name}`;
  const bodies = {
    char: {
      class: "Warlock",
      classFile: "WARLOCK",
      race: "Troll",
      raceFile: "Troll",
      faction: "Horde",
      level: 25,
      xp: 18993,
      xpMax: 34000,
      rested: 6000,
      ilvl: 24.5,
      money: 123456,
    },
    played: { total: 194400 },
    sessions: {
      list: [
        { start: 86400, stop: 90000, zones: ["Orgrimmar"], maps: [{ mapID: 85, minutes: 60 }] },
      ],
    },
  };
  for (const [section, body] of Object.entries(bodies))
    await db.sql`INSERT INTO sections_latest (owner_kind, owner_id, section, v, hash, updated_at, bytes, body) VALUES ('char', ${id}, ${section}, 1, ${section}, 1, 10, ${JSON.stringify(body)}::jsonb)`;
  await db.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'level_up', 'level', 86401, 24, 25), (${id}, 'forever', 'skill_step', '333', 86402, 144, 145), (${id}, 'forever', 'skill_step', '333', 86403, 145, 146), (${id}, 'forever', 'rep_standing', '76', 86404, 4, 5)`;
  for (let i = 0; i < 110; i++)
    await db.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'gear_change', ${String(i)}, ${90000 + i}, 100, 101)`;
}
test.skipIf(!hasPostgres)(
  "profile reads only its owner's Sections and all milestones beyond the history page limit",
  async () => {
    const page = await readProfileHome(db.sql, fixtureAccount, fixtureCharacter);
    expect(page?.hero).toMatchObject({
      className: "Warlock",
      race: "Troll",
      level: 25,
      cap: 60,
      xp: 18993,
      xpMax: 34000,
      played: 194400,
      money: 123456,
    });
    expect(page?.journey.map((s) => s.label)).toEqual([
      "Most time in Orgrimmar",
      "Level 25",
      "Enchanting · first recorded skill 145",
      "Reputation · Friendly",
    ]);
    expect(await readProfileHome(db.sql, fixtureOtherAccount, fixtureCharacter)).toBeNull();
    expect(
      await readProfileHome(db.sql, fixtureAccount, { ...fixtureCharacter, game: "retail" }),
    ).toBeNull();
  },
);

test.skipIf(!hasPostgres)(
  "journey thins long level histories, caps learned recipes per day and omits ambiguous zones and reputation drops",
  async () => {
    const id = `forever/${fixtureCharacter.realm}/${fixtureCharacter.name}`;
    for (let level = 1; level < 25; level++)
      await db.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'level_up', 'level', ${100 + level}, ${String(level - 1)}, ${String(level)})`;
    for (const [i, spell] of [7421, 7418, 7428, 7457].entries())
      await db.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'recipe_learned', ${String(spell)}, ${86420 + i}, NULL, ${String(spell)})`;
    await db.sql`INSERT INTO character_events (character_id, game, type, key, at, from_value, to_value) VALUES (${id}, 'forever', 'rep_standing', '76', 86430, '5', '4')`;
    await db.sql`UPDATE sections_latest SET body = ${JSON.stringify({ list: [{ start: 86400, zones: ["Orgrimmar", "Durotar"], maps: [{ mapID: 999, minutes: 50 }] }] })}::jsonb WHERE owner_id = ${id} AND section = 'sessions'`;
    const page = await readProfileHome(db.sql, fixtureAccount, fixtureCharacter);
    expect(page!.journey.filter((s) => s.kind === "level").map((s) => s.label)).toEqual([
      "Level 5",
      "Level 10",
      "Level 15",
      "Level 20",
      "Level 25",
    ]);
    expect(page!.journey.filter((s) => s.kind === "recipe")).toHaveLength(3);
    expect(page!.journey.filter((s) => s.kind === "zone")).toHaveLength(0);
    expect(page!.journey.filter((s) => s.kind === "reputation")).toHaveLength(1);
  },
);

import { readPickerCharacters } from "../server/utils/selected-character";
test.skipIf(!hasPostgres)(
  "picker's fallback order uses last_seen across Games and deterministic ties",
  async () => {
    await db.sql`INSERT INTO characters (id, game, account_id, name, realm, level, last_seen) VALUES ('retail/Realm/Zed', 'retail', ${fixtureAccount}, 'Zed', 'Realm', 90, 100), ('forever/Realm/Ada', 'forever', ${fixtureOtherAccount}, 'Ada', 'Realm', 60, 200)`;
    expect((await readPickerCharacters(db.sql, fixtureAccount)).map((c) => c.name)).toEqual([
      "Zed",
      "Kania",
    ]);
  },
);

test.skipIf(!hasPostgres)(
  "Retail hero uses the observed client cap and keeps absent statistics unknown",
  async () => {
    await db.sql`INSERT INTO characters (id, game, account_id, name, realm, level, last_seen) VALUES ('retail/Realm/Zed', 'retail', ${fixtureAccount}, 'Zed', 'Realm', 90, 100)`;
    await db.sql`INSERT INTO sections_latest (owner_kind, owner_id, section, v, hash, updated_at, bytes, body) VALUES ('char', 'retail/Realm/Zed', 'char', 1, 'retail-cap', 1, 10, '{"classFile":"DEATHKNIGHT","raceFile":"BloodElf","level":90,"levelCap":90}'::jsonb)`;
    const page = await readProfileHome(db.sql, fixtureAccount, {
      game: "retail",
      realm: "Realm",
      name: "Zed",
    });
    expect(page?.hero).toMatchObject({
      cap: 90,
      level: 90,
      className: "Death Knight",
      race: "Blood Elf",
      xp: null,
      played: null,
      money: null,
    });
  },
);
