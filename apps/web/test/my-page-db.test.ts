import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { test } from "vite-plus/test";

import { connectPostgres, migrate } from "../../server/src/postgres.ts";
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
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS history_my_test PARTITION OF history FOR VALUES FROM (0) TO (4000000000)`,
    );
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
