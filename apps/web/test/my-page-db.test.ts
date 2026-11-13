import { PostgresDb } from "../../server/src/db.ts";
import { readProfessionProgress } from "../../server/src/profession-progress.ts";
import { readHistoryPage } from "../server/utils/character-history.ts";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { test } from "vite-plus/test";

import { connectPostgres, migrate, migrationFiles } from "../../server/src/postgres.ts";
import { readCharacterPage } from "../server/utils/character-page.ts";
import { readMyPage } from "../server/utils/account-page.ts";
import { sessionIsLive } from "../server/utils/session.ts";

const adminUrl = process.env.UNBORED_WEB_TEST_DATABASE_URL?.trim();
const dbTest = test.skipIf(!adminUrl);

const mine = "a".repeat(64);
const theirs = "b".repeat(64);

dbTest(
  "migrations 0031 through 0033 let the web role read sources and private history without write access",
  async () => {
    const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    const name = `unbored_recipe_web_${randomBytes(4).toString("hex")}`;
    await root.unsafe(`CREATE DATABASE "${name}"`);
    const url = new URL(adminUrl!);
    url.pathname = `/${name}`;
    // Keep BEGIN, SET LOCAL ROLE and every page query on the same connection.
    const sql = connectPostgres(url.toString(), { max: 1 });
    try {
      for (const file of migrationFiles().filter((file) => file.version < 31)) {
        await sql.unsafe(readFileSync(file.url, "utf8"));
      }
      await sql`BEGIN`;
      // A newly created cluster role remains invisible to other tests and rolls back below.
      await sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'unbored_web') THEN
        CREATE ROLE unbored_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      END IF;
    END $$`;
      await sql`GRANT SELECT ON characters, sections_latest TO unbored_web`;
      await sql.unsafe(
        readFileSync(migrationFiles().find((file) => file.version === 31)!.url, "utf8"),
      );
      await sql.unsafe(
        readFileSync(migrationFiles().find((file) => file.version === 32)!.url, "utf8"),
      );
      await sql.unsafe(
        readFileSync(migrationFiles().find((file) => file.version === 33)!.url, "utf8"),
      );
      await sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES (${mine}, 'Mine', 1, 2)`;
      await sql`INSERT INTO characters (id, game, account_id, name, realm, level, last_seen)
      VALUES ('forever/Realm/Mine', 'forever', ${mine}, 'Mine', 'Realm', 23, 2)`;
      await sql`INSERT INTO sections_latest (owner_kind, owner_id, section, v, hash, updated_at, bytes, body)
      VALUES ('char', 'forever/Realm/Mine', 'professions', 1, 'p1', 2, 10,
        '{"list":[{"skillLine":171,"name":"Alchemy","skill":112,"max":150}]}'::jsonb),
        ('char', 'forever/Realm/Mine', 'recipes', 1, 'r1', 2, 10,
        '{"byProfession":{"171":{"learned":["ids1"]}}}'::jsonb)`;
      await sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements)
      VALUES ('forever', '1.60.1.70888', 70888, 2, 0)`;
      const recipe = {
        spellId: 2334,
        skillLine: 171,
        name: "Elixir of Minor Fortitude",
        category: { id: 2450, name: "Elixirs", order: 30 },
        minSkill: 50,
        thresholds: { orange: 50, yellow: 80, green: 100, grey: 120 },
        skillUps: 1,
        acquireMethod: 0,
        reagents: [
          { itemId: 2320, count: 1 },
          { itemId: 2321, count: 1 },
        ],
        trainer: true,
        craftedItems: [],
        teachingItems: [2553],
        teaching: [{ itemId: 2553, requiredSkill: 50, quality: 2, bindOnPickup: false }],
      };
      await sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body)
      VALUES ('forever', '1.60.1.70888', 171, 2334, ${JSON.stringify(recipe)}::jsonb)`;
      await sql`INSERT INTO recipe_sightings (account_id, game, kind, source_key, item_id, npc_id, npc_name, ui_map_id, cost, limited, first_seen, last_seen)
      VALUES (${mine}, 'forever', 'vendor', 'i2553', 2553, 123, 'Recipe seller', 1429, 100, 0, 2, 2)`;
      await sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES
      ('forever', '1.60.1.70888', 'UiMap', 'enUS', 1429, '{"Name_lang":"Elwynn Forest"}'::jsonb),
      ('forever', '1.60.1.70888', 'ItemSparse', 'enUS', 2553, '{"Display_lang":"Recipe: Elixir of Minor Fortitude"}'::jsonb)`;
      await sql`INSERT INTO recipe_sightings (account_id, game, kind, source_key, item_id, npc_id, npc_name, cost, limited, first_seen, last_seen)
        VALUES (${mine}, 'forever', 'vendor', 'i2320', 2320, 123, 'Reagent seller', 7, 0, 2, 2)`;
      await sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES
        ('forever', '1.60.1.70888', 'ItemSparse', 'enUS', 2321, '{"Display_lang":"Unseen thread","BuyPrice":999}'::jsonb)`;
      await sql`INSERT INTO character_events (game, character_id, type, key, at, from_value, to_value)
        VALUES ('forever', 'forever/Realm/Mine', 'recipe_learned', '2334', 2, NULL, '2334')`;
      await sql`INSERT INTO character_goals (character_id, skill_line, position, set_id, goal_id, day, created_at, goal_body)
        VALUES ('forever/Realm/Mine', 171, 0, 'fixture-set', 'fixture-goal', 1, 2, '{"title":"Learn a recipe"}')`;
      await sql`SET LOCAL ROLE unbored_web`;
      const goals =
        await sql`SELECT g.goal_body FROM character_goals g JOIN characters c ON c.id = g.character_id
        WHERE c.account_id = ${mine} AND c.game = 'forever' AND c.name = 'Mine' AND c.realm = 'Realm'`;
      assert.equal(goals.length, 1);
      assert.equal(JSON.parse(goals[0]!.goal_body).title, "Learn a recipe");
      assert.equal(
        (
          await sql`SELECT g.goal_body FROM character_goals g JOIN characters c ON c.id = g.character_id
        WHERE c.account_id = ${theirs} AND c.game = 'forever' AND c.name = 'Mine' AND c.realm = 'Realm'`
        ).length,
        0,
      );

      const history = await readHistoryPage(sql, mine, {
        game: "forever",
        realm: "Realm",
        name: "Mine",
      });
      assert.equal(history?.events[0]?.label, "Recipe learned: Elixir of Minor Fortitude");
      assert.equal(
        await readHistoryPage(sql, theirs, { game: "forever", realm: "Realm", name: "Mine" }),
        null,
      );
      const page = await readCharacterPage(sql, mine, {
        game: "forever",
        realm: "Realm",
        name: "Mine",
      });
      assert.deepEqual(
        await readProfessionProgress(
          new PostgresDb(sql),
          { game: "forever", id: "forever/Realm/Mine" },
          171,
        ),
        page?.professions[0],
        "MCP and private API return the same object with restricted SELECT access",
      );
      assert.equal(page?.professions[0]?.total, 1);
      assert.deepEqual(page?.professions[0]?.difficultyCounts, { easy: 1, medium: 0, hard: 0 });
      assert.deepEqual(page?.professions[0]?.missing[0]?.recipes[0]?.difficulty, {
        score: 1,
        label: "easy",
        reasons: ["Seen at a vendor: unlimited supply", "Needs 50: you have it"],
        requiredSkill: 50,
        source: "vendor",
        canGetNow: true,
      });
      assert.equal(
        page?.professions[0]?.missing[0]?.recipes[0]?.reagents[1]?.name,
        "Unseen thread",
      );
      const route = page?.professions[0]?.routes?.[0]?.route;
      assert.equal(route?.reached, 120);
      assert.equal(route?.status, "gap");
      assert.equal(route?.reagents[0]?.unitCopper, 7);
      assert.equal(route?.reagents[1]?.name, "Unseen thread");
      assert.equal(route?.reagents[1]?.unitCopper, null, "BuyPrice without a sighting is unknown");
      const group = page?.professions[0]?.missing[0];
      assert.equal(group?.id, "vendor");
      assert.equal(group?.recipes[0]?.name, "Elixir of Minor Fortitude");
      assert.equal(group?.recipes[0]?.sources[0]?.npcName, "Recipe seller");
      assert.equal(group?.recipes[0]?.sources[0]?.zone, "Elwynn Forest");
      assert.equal(group?.recipes[0]?.sources[0]?.cost, 100);
      assert.deepEqual(group?.recipes[0]?.teachingItemNames, [
        {
          itemId: 2553,
          name: "Recipe: Elixir of Minor Fortitude",
          quality: 2,
          bindOnPickup: false,
        },
      ]);
      assert.equal(
        await readCharacterPage(sql, theirs, { game: "forever", realm: "Realm", name: "Mine" }),
        null,
      );
      await sql`RESET ROLE`;
      await sql`UPDATE sections_latest SET body = '{"list":[{"skillLine":171,"name":"Alchemy","skill":75,"max":75}]}'::jsonb
        WHERE owner_id = 'forever/Realm/Mine' AND section = 'professions'`;
      await sql`DELETE FROM game.profession_recipes WHERE game = 'forever'`;
      await sql`SET LOCAL ROLE unbored_web`;
      const unplaced = await readCharacterPage(sql, mine, {
        game: "forever",
        realm: "Realm",
        name: "Mine",
      });
      assert.equal(unplaced?.professions[0]?.routes?.[0]?.route.status, "needs_rank");
      assert.equal(unplaced?.professions[0]?.routes?.[0]?.route.rankTraining?.trainer, null);
      await sql`RESET ROLE`;
      await sql`INSERT INTO recipe_sightings (account_id, game, kind, source_key, skill_line, spell_id, npc_id, npc_name, ui_map_id, x, y, cost, required_skill, limited, first_seen, last_seen)
        VALUES (${mine}, 'forever', 'trainer', 's2334', 171, 2334, 456, 'Teacher', 37, 12, 34, 100, 50, 0, 2, 2)`;
      await sql`SET LOCAL ROLE unbored_web`;
      const rankPage = await readCharacterPage(sql, mine, {
        game: "forever",
        realm: "Realm",
        name: "Mine",
      });
      const rankRoute = rankPage?.professions[0]?.routes?.[0]?.route;
      assert.equal(rankRoute?.status, "needs_rank");
      assert.deepEqual(rankRoute?.stretches, []);
      assert.deepEqual(rankRoute?.rankTraining, {
        profession: "Alchemy",
        previousMax: 75,
        trainer: { npcId: 456, npcName: "Teacher", uiMapID: 37, x: 12, y: 34 },
      });
      for (const table of [
        "game.builds",
        "game.rows",
        "game.profession_recipes",
        "recipe_sightings",
        "character_events",
        "character_goals",
        "accounts",
      ]) {
        const [permissions] = await sql`SELECT
        has_table_privilege(current_user, ${table}, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS write,
        has_table_privilege(current_user, ${table}, 'SELECT') AS read`;
        assert.equal(permissions.write, false, `${table} must not be writable`);
        assert.equal(permissions.read, table !== "accounts", `${table} read access`);
      }
    } finally {
      await sql`ROLLBACK`;
      await sql.end();
      await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await root.end();
    }
  },
);

dbTest("My page reads one Account, and a session needs its open row and connected PC", async () => {
  const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  const name = `unbored_my_${randomBytes(4).toString("hex")}`;
  await root.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const sql = connectPostgres(url.toString(), { max: 2 });
  try {
    await migrate(sql);
    await sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES (${mine}, ${mine}, 1, 2), (${theirs}, ${theirs}, 1, 2)`;
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
    await sql`INSERT INTO game.builds (game, build, build_number, imported_at, achievements) VALUES
      ('forever', '1.60.1.70888', 70888, 1762300000, 0), ('retail', '12.0.1.70889', 70889, 1762300000, 0)`;
    const recipe = {
      spellId: 2334,
      skillLine: 171,
      name: "Elixir of Minor Fortitude",
      category: { id: 2450, name: "Elixirs", order: 30 },
      minSkill: 50,
      thresholds: { orange: 50, yellow: 80, green: 100, grey: 120 },
      skillUps: 1,
      acquireMethod: 0,
      reagents: [],
      craftedItems: [],
      teachingItems: [],
    };
    await sql`INSERT INTO game.profession_recipes (game, build, skill_line, spell_id, body) VALUES
      ('forever', '1.60.1.70888', 171, 2334, ${JSON.stringify(recipe)}::jsonb),
      ('retail', '12.0.1.70889', 171, 2334, ${JSON.stringify({ ...recipe, name: "Retail recipe" })}::jsonb)`;
    await sql`INSERT INTO recipe_sightings (account_id, game, kind, source_key, spell_id, skill_line, npc_id, npc_name, ui_map_id, cost, required_skill, limited, first_seen, last_seen) VALUES
      (${mine}, 'forever', 'trainer', 's2334', 2334, 171, 123, 'Teacher', 1429, 100, 50, 0, 10, 10),
      (${theirs}, 'forever', 'trainer', 's2334', 2334, 171, 123, 'Teacher', 1429, 80, 50, 0, 20, 20),
      (${mine}, 'retail', 'trainer', 's2334', 2334, 171, 123, 'Retail teacher', 1429, 999, 50, 0, 30, 30)`;
    await sql`INSERT INTO game.rows (game, build, table_name, locale, id, body) VALUES
      ('forever', '1.60.1.70888', 'UiMap', 'enUS', 1429, '{"Name_lang":"Elwynn Forest"}'::jsonb),
      ('retail', '12.0.1.70889', 'UiMap', 'enUS', 1429, '{"Name_lang":"Different Retail zone"}'::jsonb)`;
    const withCatalog = await readCharacterPage(sql, mine, identity);
    assert.equal(withCatalog?.professions[0]?.total, 1);
    assert.equal(withCatalog?.professions[0]?.uncatalogued, 4);
    assert.equal(withCatalog?.professions[0]?.missing[0]?.recipes[0]?.band, "green");
    assert.equal(
      withCatalog?.professions[0]?.missing[0]?.recipes[0]?.name,
      "Elixir of Minor Fortitude",
    );
    const observed = withCatalog?.professions[0]?.missing[0];
    assert.equal(observed?.id, "trainer");
    assert.equal(observed?.recipes[0]?.sources.length, 1);
    assert.equal(observed?.recipes[0]?.sources[0]?.cost, 80);
    assert.equal(observed?.recipes[0]?.sources[0]?.zone, "Elwynn Forest");
    assert.ok(!JSON.stringify(withCatalog).includes(theirs));
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
    await sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES (${mine}, ${mine}, 1, 2), (${theirs}, ${theirs}, 1, 2)`;
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

dbTest(
  "history reads both games, pages ties without omissions and keeps charts independent",
  async () => {
    const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    const name = `unbored_history_${randomBytes(4).toString("hex")}`;
    await root.unsafe(`CREATE DATABASE "${name}"`);
    const url = new URL(adminUrl!);
    url.pathname = `/${name}`;
    const sql = connectPostgres(url.toString(), { max: 2 });
    try {
      await migrate(sql);
      await sql`INSERT INTO accounts (id, label, first_seen, last_seen) VALUES (${mine}, 'Mine', 1, 2)`;
      for (const game of ["retail", "forever"] as const) {
        const id = `${game}/Realm/Mine`;
        const identity = { game, realm: "Realm", name: "Mine" };
        await sql`INSERT INTO characters (id, game, account_id, name, realm, last_seen) VALUES (${id}, ${game}, ${mine}, 'Mine', 'Realm', 2)`;
        assert.deepEqual((await readHistoryPage(sql, mine, identity))?.events, []);
        await sql`INSERT INTO character_events (game, character_id, type, key, at, to_value)
        SELECT ${game}, ${id}, 'recipe_learned', n::text, 1790000000, n::text FROM generate_series(1,105) n`;
        await sql`INSERT INTO character_events (game, character_id, type, key, at, to_value) VALUES (${game}, ${id}, 'level_up', '', 1790000000, '10')`;
        const first = (await readHistoryPage(sql, mine, identity, { types: ["recipe_learned"] }))!;
        assert.equal(first.events.length, 100);
        assert.ok(first.next);
        assert.equal(first.charts[0]?.title, "Level over time");
        const second = (await readHistoryPage(sql, mine, identity, {
          types: ["recipe_learned"],
          cursor: first.next!,
        }))!;
        assert.equal(second.events.length, 5);
        assert.equal(second.next, null);
        assert.equal(new Set([...first.events, ...second.events].map((e) => e.id)).size, 105);
        assert.deepEqual(first.charts, second.charts);
        assert.ok(first.events[0]?.label.startsWith("Recipe learned: "));
        assert.equal(await readHistoryPage(sql, theirs, identity), null);
      }
    } finally {
      await sql.end();
      await root.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      await root.end();
    }
  },
);
