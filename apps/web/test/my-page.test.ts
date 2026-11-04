import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { test } from "vite-plus/test";

import { connectPostgres, migrate } from "../../server/src/postgres.ts";
import { readMyPage } from "../server/utils/account-page.ts";
import { characterView } from "../shared/my-page.ts";

const adminUrl = process.env.UNBORED_WEB_TEST_DATABASE_URL?.trim();
const dbTest = test.skipIf(!adminUrl);

test("a character shows level, keystone and renown from its own sections", () => {
  const view = characterView({
    name: "Mira",
    realm: "Silvermoon",
    className: null,
    level: 10,
    charBody: { class: "Mage", level: 80, ilvl: 652.4 },
    mplusBody: { keyLevel: 12 },
    reputationBody: {
      renown: [
        { name: "Dornogal", level: 7 },
        { name: "", level: 3 },
      ],
    },
  });
  assert.equal(view.level, 80);
  assert.equal(view.ilvl, 652);
  assert.equal(view.keystone, 12);
  assert.deepEqual(view.renown, [{ name: "Dornogal", level: 7 }]);
  assert.equal(view.className, "Mage");
});

dbTest("My page reads one Account and hides the other", async () => {
  const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  const name = `unbored_my_${randomBytes(4).toString("hex")}`;
  await root.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const sql = connectPostgres(url.toString(), { max: 2 });
  try {
    await migrate(sql);
    const at = 1_762_300_000;
    await sql`
      INSERT INTO characters (id, account_id, name, realm, class, level, last_seen)
      VALUES
        ('Silvermoon/Mira', 'mine', 'Mira', 'Silvermoon', 'Mage', 80, ${at}),
        ('Area 52/Grub', 'theirs', 'Grub', 'Area 52', 'Warrior', 70, ${at})`;
    await sql`
      INSERT INTO sections_latest
        (owner_kind, owner_id, section, v, hash, at, updated_at, unknown, bytes, body)
      VALUES
        ('char', 'Silvermoon/Mira', 'mplus', 1, 'h1', ${at}, ${at}, 0, 10, ${JSON.stringify({ keyLevel: 12 })}::jsonb),
        ('char', 'Area 52/Grub', 'mplus', 1, 'h2', ${at}, ${at}, 0, 10, ${JSON.stringify({ keyLevel: 2 })}::jsonb)`;
    await sql`
      INSERT INTO plans (player_key, created_at, body, unb1, generated_at)
      VALUES ('self', ${at}, ${JSON.stringify({ title: "Badges for a Timereaver" })}::jsonb, 'UNB1', ${at})`;
    const [plan] = await sql<{ id: number }[]>`SELECT id FROM plans`;
    await sql`
      INSERT INTO history (at, account, character_name, realm, kind, ref, body)
      VALUES
        (${at}, 'mine', 'Mira', 'Silvermoon', 'plan', 'r1', ${JSON.stringify({ planId: plan!.id, steps: [] })}::jsonb),
        (${at + 1}, 'mine', 'Mira', 'Silvermoon', 'win', 'mount:1', ${JSON.stringify({ planTitle: "Badges for a Timereaver", kind: "mount" })}::jsonb),
        (${at}, 'theirs', 'Grub', 'Area 52', 'plan', 'r2', ${JSON.stringify({ planId: plan!.id })}::jsonb),
        (${at + 2}, 'theirs', 'Grub', 'Area 52', 'win', 'mount:9', ${JSON.stringify({ planTitle: "Not yours", kind: "mount" })}::jsonb)`;

    const mine = await readMyPage(sql, "mine", "en");
    assert.deepEqual(
      mine.characters.map((row) => row.name),
      ["Mira"],
    );
    assert.equal(mine.characters[0]?.keystone, 12);
    assert.deepEqual(
      mine.plans.map((row) => row.title),
      ["Badges for a Timereaver"],
    );
    assert.deepEqual(
      mine.wins.map((row) => row.title),
      ["Badges for a Timereaver"],
    );
    const theirs = JSON.stringify(mine);
    assert.equal(theirs.includes("Grub"), false);
    assert.equal(theirs.includes("Not yours"), false);
    assert.equal("accountId" in mine, false);

    const empty = await readMyPage(sql, "nobody", "ru");
    assert.deepEqual(empty, { characters: [], plans: [], wins: [] });
  } finally {
    await sql.end();
    await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await root.end();
  }
});
