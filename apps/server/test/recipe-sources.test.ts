import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { Store } from "../src/store.ts";
import { cleanSnapshot } from "../src/data.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
import { NOW } from "./helpers.ts";

const pg = postgresPerFile();
for (const backend of BACKENDS) {
  test(`recipe sightings merge without exposing Accounts and retries do not count twice (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".sightings-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      const builds = store.db.pg ? "game.builds" : "game_builds";
      const recipes = store.db.pg ? "game.profession_recipes" : "game_profession_recipes";
      await store.db.run(
        `INSERT INTO ${builds} (game, build, build_number, imported_at, achievements) VALUES ('forever', '1.60.1.70888', 70888, ?, 0)`,
        NOW,
      );
      await store.db.run(
        `INSERT INTO ${recipes} (game, build, skill_line, spell_id, ${store.db.body}) VALUES ('forever', '1.60.1.70888', 171, 2335, ?)`,
        JSON.stringify({
          spellId: 2335,
          skillLine: 171,
          name: "Swiftness Potion",
          minSkill: 60,
          teachingItems: [2555],
        }),
      );
      const upload = (account: string, at: number) =>
        store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game: "forever",
            account,
            character: account,
            realm: "Realm",
            savedAt: at,
            sections: {
              trainerSeen: {
                scope: "char",
                v: 1,
                at,
                body: {
                  entries: [
                    {
                      npcId: 123,
                      npcName: "Teacher",
                      uiMapID: 37,
                      x: 12.3,
                      y: 45.6,
                      spellId: 2335,
                      skillLine: 171,
                      cost: 100,
                      requiredSkill: 60,
                      seenAt: at,
                    },
                  ],
                },
              },
            },
          }),
          account,
          at,
        );
      await upload("a", NOW);
      await upload("a", NOW);
      await upload("b", NOW + 10);
      const sources = await store.game.forGame("forever").recipeSources(171);
      assert.equal(sources.recipes[0]?.sources.length, 1);
      assert.deepEqual(sources.recipes[0]?.sources[0], {
        kind: "trainer",
        npcId: 123,
        npcName: "Teacher",
        uiMapID: 37,
        zone: "Unknown zone (37)",
        x: 12.3,
        y: 45.6,
        cost: 100,
        requiredSkill: 60,
        itemId: null,
        limited: false,
        firstSeen: NOW,
        lastSeen: NOW + 10,
      });
      assert.equal(
        (await store.db.get<{ n: number }>("SELECT SUM(seen_count) AS n FROM recipe_sightings"))?.n,
        2,
      );
      await store.forgetDevice("a", NOW + 20);
      assert.equal(
        (await store.game.forGame("forever").recipeSources(171)).recipes[0]?.sources[0]?.firstSeen,
        NOW + 10,
      );
      await store.deleteAccountData("b");
      assert.deepEqual(
        (await store.game.forGame("forever").recipeSources(171)).recipes[0]?.sources,
        [],
      );
      assert.deepEqual((await store.game.recipeSources(171)).recipes, []);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const backend of BACKENDS) {
  test(`recipe resolution uses spell ids, teaching items and only unique enUS names (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".sightings-"));
    const { readFileSync } = await import("node:fs");
    const { createApp } = await import("../src/app.ts");
    const app = createApp({
      database: pg(backend),
      dataDir: dir,
      ingest: "inline",
      blizzard: null,
      companionToken: "companion",
      plannerToken: "owner",
      webhook: { url: "", key: "", headerName: "" },
      log: () => {},
    });
    const { store } = app;
    try {
      await store.game.forGame("forever").importBuild("1.60.1.70888", async (input) => {
        const table = new URL(String(input)).pathname.split("/")[2];
        return new Response(
          readFileSync(new URL(`./fixtures/forever/${table}.csv`, import.meta.url)),
        );
      });
      const fixture = JSON.parse(
        readFileSync(
          new URL("../../../packages/contracts/fixtures/recipe-sightings.json", import.meta.url),
          "utf8",
        ),
      );
      await store.putSnapshot(cleanSnapshot(fixture), "pc", NOW);
      const result = await store.game.forGame("forever").recipeSources(171);
      const recipe = result.recipes.find((r) => r.spellId === 2335)!;
      assert.deepEqual(
        recipe.sources.map((s) => s.npcId),
        [123, 124, 126, 127],
      );
      assert.equal(recipe.sources[3]?.limited, true, "zero remaining stock is limited supply");
      assert.equal(recipe.sources[0]?.zone, "Elwynn Forest");
      assert.equal(recipe.teachingItems[0]?.name, "Recipe: Swiftness Potion");
      assert.equal(
        (
          await store.db.get<{ n: number }>(
            "SELECT COUNT(*) AS n FROM recipe_sightings WHERE recipe_spell_id IS NULL",
          )
        )?.n,
        1,
        "non-enUS names remain unresolved",
      );
      const request = await app.app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer owner",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_recipe_sources", arguments: { game: "forever", skillLine: 171 } },
        }),
      });
      const text = await request.text();
      const rpc = JSON.parse(text.startsWith("event:") ? text.split("data: ")[1]!.trim() : text);
      assert.deepEqual(JSON.parse(rpc.result.content[0].text), result);
      const delivered = await (
        await app.app.request("/v1/advice?game=forever", {
          headers: { authorization: "Bearer companion" },
        })
      ).json();
      assert.deepEqual(delivered.teaching.items["2555"], [2335, 171, 60]);
      assert.deepEqual(delivered.characters, []);
      const retail = await (
        await app.app.request("/v1/advice", { headers: { authorization: "Bearer companion" } })
      ).json();
      assert.deepEqual(retail.teaching, { v: 1, game: "retail", items: {} });
      assert.equal(
        (
          await app.app.request("/v1/advice?game=other", {
            headers: { authorization: "Bearer companion" },
          })
        ).status,
        400,
      );
      // Same recipe name in the same profession is ambiguous. Never use the earlier resolution.
      const target = store.db.pg ? "game.profession_recipes" : "game_profession_recipes";
      const catalog = await store.game.forGame("forever").professionCatalog(171);
      const original = catalog.recipes.find((r) => r.spellId === 2335)!;
      await store.db.run(
        `INSERT INTO ${target} (game, build, skill_line, spell_id, ${store.db.body}) VALUES ('forever', '1.60.1.70888', 171, 999999, ?)`,
        JSON.stringify({ ...original, spellId: 999999, teachingItems: [] }),
      );
      const ambiguous = await store.game.forGame("forever").recipeSources(171);
      assert.deepEqual(
        ambiguous.recipes.find((r) => r.spellId === 2335)?.sources.map((s) => s.npcId),
        [123, 126, 127],
      );
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const backend of BACKENDS) {
  test(`Account rebinding preserves sightings and overlapping saves stay idempotent (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".sightings-"));
    const store = new Store(dir, { postgres: pg(backend) });
    const hash = "a".repeat(64);
    const upload = (account: string, char: string, at: number, seenAt: number, extra = false) =>
      store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          game: "forever",
          account,
          character: char,
          realm: "Realm",
          savedAt: at,
          sections: {
            merchantSeen: {
              scope: "char",
              v: 1,
              at,
              body: {
                entries: [
                  {
                    npcId: 123,
                    npcName: "Vendor",
                    itemId: 2555,
                    cost: 400,
                    numAvailable: -1,
                    seenAt,
                  },
                  ...(extra
                    ? [
                        {
                          npcId: 999,
                          npcName: "Another vendor",
                          itemId: 2555,
                          cost: 500,
                          numAvailable: 0,
                          seenAt: at,
                        },
                      ]
                    : []),
                ],
              },
            },
          },
        }),
        "pc",
        at,
      );
    try {
      await upload("111111#1", "A", NOW, NOW);
      await upload("111111#1", "A", NOW + 1, NOW, true);
      await upload("111111#1", "B", NOW + 2, NOW);
      assert.equal(
        (
          await store.db.get<{ n: number }>(
            "SELECT seen_count AS n FROM recipe_sightings WHERE npc_id = 123",
          )
        )?.n,
        1,
      );
      await upload(hash, "C", NOW + 3, NOW + 3);
      await store.bindAccount(hash, "111111#1");
      assert.equal(
        (await store.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM recipe_sightings"))?.n,
        2,
      );
      assert.equal(
        (
          await store.db.get<{ n: number }>(
            "SELECT COUNT(*) AS n FROM recipe_sightings WHERE account_id <> ?",
            hash,
          )
        )?.n,
        0,
      );
      assert.equal(
        (
          await store.db.get<{ first_seen: number }>(
            "SELECT first_seen FROM recipe_sightings WHERE npc_id = 123",
          )
        )?.first_seen,
        NOW,
      );
      await store.deleteAccountData(hash);
      assert.equal(
        (await store.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM recipe_sightings"))?.n,
        0,
      );
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
