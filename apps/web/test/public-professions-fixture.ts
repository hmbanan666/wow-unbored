import type { Sql } from "../../server/src/postgres";
import { albumCharacter } from "./fixtures/profession-album";
import { packIds } from "@unbored/contracts/packed";
export const fixtureAccount = "c".repeat(64);
export const fixtureOtherAccount = "d".repeat(64);
export const fixtureCharacter = {
  game: "forever" as const,
  realm: "CAMWOW EU4 Realm 3 PvE",
  name: "Kania",
};
export async function seedPublicProfessions(sql: Sql) {
  const character = albumCharacter("unopened");
  const now = Math.floor(Date.now() / 1000);
  await sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES (${fixtureAccount}, 'Fixture', 1, 2), (${fixtureOtherAccount}, 'Other fixture', 1, 2)`;
  await sql`INSERT INTO devices (id, name, secret_hash, status, created_at) VALUES ('fixture-device', 'Fixture PC', 'test-only', 'approved', ${now})`;
  await sql`INSERT INTO web.sessions (id, account_id, device_id, created_at) VALUES ('fixture-session', ${fixtureAccount}, 'fixture-device', ${now}), ('other-fixture-session', ${fixtureOtherAccount}, 'fixture-device', ${now})`;
  await sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements) VALUES ('forever', 'fixture', 1, 1, 0)`;
  const id = `forever/${character.realm}/${character.name}`;
  await sql`INSERT INTO characters (id, game, account_id, name, realm, class, level, last_seen) VALUES (${id}, 'forever', ${fixtureAccount}, ${character.name}, ${character.realm}, 'WARLOCK', 23, 1)`;
  const professions = JSON.stringify({
    list: character.professions.map(({ skillLine, name, skill, max }) => ({
      skillLine,
      name,
      skill,
      max,
    })),
  });
  const recipes = JSON.stringify({
    byProfession: {
      "197": {
        learned: packIds(
          character.professions[1]!.album.filter((r) => r.known).map((r) => r.spellId),
        ),
      },
    },
  });
  await sql`INSERT INTO sections_latest (owner_kind, owner_id, section, v, hash, updated_at, bytes, body) VALUES ('char', ${id}, 'professions', 1, 'fixture-p', 1, 10, ${professions}::jsonb), ('char', ${id}, 'recipes', 1, 'fixture-r', 1, 10, ${recipes}::jsonb)`;
  const items = new Map<number, string>();
  for (const p of character.professions)
    for (const r of p.album) {
      const {
        known: _known,
        band: _band,
        sources: _sources,
        difficulty: _difficulty,
        teachingItemNames,
        ...catalog
      } = r;
      for (const item of [...r.reagents, ...teachingItemNames])
        if (item.name) items.set(item.itemId, item.name);
      await sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) VALUES ('forever', 'fixture', ${r.skillLine}, ${r.spellId}, ${JSON.stringify(catalog)}::jsonb)`;
    }
  for (const [id, name] of items)
    await sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES ('forever', 'fixture', 'ItemSparse', 'enUS', ${id}, ${JSON.stringify({ Display_lang: name })}::jsonb)`;
  // Two Accounts saw the same trainer: only the aggregate may leave the public API.
  for (const [account, at, cost] of [
    [fixtureAccount, 1, 100],
    [fixtureOtherAccount, 2, 80],
  ] as const) {
    await sql`INSERT INTO recipe_sightings (account_id, game, kind, source_key, spell_id, skill_line, npc_id, npc_name, ui_map_id, x, y, cost, required_skill, limited, first_seen, last_seen) VALUES (${account}, 'forever', 'trainer', 's7421', 7421, 333, 1, 'Fixture trainer', 1, 40, 50, ${cost}, 1, 0, ${at}, ${at})`;
  }
  await sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES ('forever', 'fixture', 'UiMap', 'enUS', 1, '{"Name_lang":"Elwynn Forest"}'::jsonb)`;
  return character;
}
