import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { test } from "vite-plus/test";

import { connectPostgres, migrate } from "../../server/src/postgres.ts";
import { readCharacterPage } from "../server/utils/character-page.ts";
import { readMyPage } from "../server/utils/account-page.ts";
import { sessionIsLive } from "../server/utils/session.ts";

const adminUrl = process.env.UNBORED_WEB_TEST_DATABASE_URL?.trim();
const dbTest = test.skipIf(!adminUrl);

const mine = "a".repeat(64);
const theirs = "b".repeat(64);

dbTest("My page reads one Account, and a session needs its open row and connected PC", async () => {
  const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  const name = `unbored_my_${randomBytes(4).toString("hex")}`;
  await root.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const sql = connectPostgres(url.toString(), { max: 2 });
  try {
    await migrate(sql);
    await sql`
      INSERT INTO characters (id, account_id, name, realm, class, level, last_seen, device_id)
      VALUES ('Realm/Mine', ${mine}, 'Mine', 'Realm', 'MAGE', 80, 1762300000, 'pc-mine'),
             ('Realm/Theirs', ${theirs}, 'Theirs', 'Realm', 'ROGUE', 70, 1762300000, 'pc-theirs')`;
    await sql`
      INSERT INTO sections_latest (owner_kind, owner_id, section, v, hash, updated_at, bytes, body)
      VALUES ('char', 'Realm/Mine', 'char', 1, 'h1', 1762300000, 10, '{"level":80,"ilvl":640}'::jsonb),
             ('char', 'Realm/Theirs', 'char', 1, 'h2', 1762300000, 10, '{"level":70,"ilvl":500}'::jsonb)`;
    await sql`
      INSERT INTO history (at, account, character_name, realm, kind, body)
      VALUES (1762300001, ${mine}, 'Mine', 'Realm', 'win', '{"planTitle":"My win"}'::jsonb),
             (1762300002, ${theirs}, 'Theirs', 'Realm', 'win', '{"planTitle":"Their win"}'::jsonb)`;

    const page = await readMyPage(sql, mine, "en");
    assert.deepEqual(
      page.characters.map((row) => row.name),
      ["Mine"],
    );
    assert.equal(page.characters[0]?.ilvl, 640);
    assert.deepEqual(
      page.wins.map((row) => row.title),
      ["My win"],
    );
    assert.equal(JSON.stringify(page).includes("Theirs"), false);

    await sql`
      INSERT INTO characters (id, game, account_id, name, realm, level, last_seen)
      VALUES ('forever/Realm/Mine', 'forever', ${mine}, 'Mine', 'Realm', 23, 1762300005)`;
    const both = await readMyPage(sql, mine, "en");
    assert.deepEqual(
      both.characters.map((row) => [row.name, row.game, row.level]),
      [
        ["Mine", "forever", 23],
        ["Mine", "retail", 80],
      ],
    );
    assert.equal(both.characters[0]?.ilvl, null);

    await sql`
      INSERT INTO sections_latest (owner_kind, owner_id, section, v, hash, updated_at, bytes, body)
      VALUES ('char', 'forever/Realm/Mine', 'professions', 1, 'p1', 1762300005, 10,
        '{"list":[{"skillLine":171,"name":"Alchemy","skill":112,"max":150}]}'::jsonb),
      ('char', 'forever/Realm/Mine', 'recipes', 1, 'r1', 1762300005, 10,
        '{"byProfession":{"171":{"learned":["ids1","2s,2,1,1"]}}}'::jsonb)`;
    const identity = { game: "forever" as const, realm: "Realm", name: "Mine" };
    const character = await readCharacterPage(sql, mine, identity);
    assert.equal(character?.professions[0]?.known, 4);
    assert.equal(character?.professions[0]?.skill, 112);
    assert.equal(await readCharacterPage(sql, theirs, identity), null);
    assert.equal(await readCharacterPage(sql, mine, { ...identity, name: "Missing" }), null);
    const retail = await readCharacterPage(sql, mine, { ...identity, game: "retail" });
    assert.deepEqual(retail?.professions, []);

    const now = 1762300100;
    await sql`
      INSERT INTO devices (id, name, secret_hash, status, created_at)
      VALUES ('pc-mine', 'PC', 'hash-mine', 'approved', ${now})`;
    await sql`
      INSERT INTO web.sessions (id, account_id, device_id, created_at)
      VALUES ('s-live', ${mine}, 'pc-mine', ${now}),
             ('s-old', ${mine}, 'pc-mine', ${now - 31 * 86400})`;
    assert.equal(await sessionIsLive(sql, "s-live", mine, now), true);
    assert.equal(await sessionIsLive(sql, "s-live", theirs, now), false);
    assert.equal(await sessionIsLive(sql, "s-old", mine, now), false);
    await sql`UPDATE devices SET status = 'revoked' WHERE id = 'pc-mine'`;
    assert.equal(await sessionIsLive(sql, "s-live", mine, now), false);
  } finally {
    await sql.end();
    await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await root.end();
  }
});

dbTest("My page shows Path completions with safe links, scoped to its Account", async () => {
  const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  const name = `unbored_history_${randomBytes(4).toString("hex")}`;
  await root.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const sql = connectPostgres(url.toString(), { max: 2 });
  try {
    await migrate(sql);
    const body = {
      kind: "collection",
      slug: "first-mounts",
      title: "First mounts",
      version: 1,
      done: 2,
      total: 2,
    };
    await sql`INSERT INTO history (at, account, character_name, realm, kind, body) VALUES
      (1762300001, ${mine}, 'Mine', 'Realm', 'path_completion', ${JSON.stringify(body)}::jsonb),
      (1762300002, ${theirs}, 'Other', 'Realm', 'path_completion', ${JSON.stringify({ ...body, title: "Other completion" })}::jsonb)`;
    const page = await readMyPage(sql, mine, "ru");
    assert.deepEqual(page.completions, [
      {
        game: "retail",
        at: 1762300001,
        character: "Mine",
        realm: "Realm",
        title: "First mounts",
        href: "/collections/first-mounts",
        version: 1,
      },
    ]);
    assert.equal(JSON.stringify(page).includes("Other completion"), false);
  } finally {
    await sql.end();
    await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await root.end();
  }
});
