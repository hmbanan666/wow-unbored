import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { Store } from "../src/store.ts";
import { cleanSnapshot } from "../src/data.ts";
import { readCharacterHistory } from "../src/character-events.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
import { NOW } from "./helpers.ts";

const pg = postgresPerFile();
for (const backend of BACKENDS) {
  test(`character history derives changes, uses baselines and closes gold daily (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".events-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      const upload = (
        at: number,
        level: number,
        money: number,
        skill: number,
        recipes: string[],
        itemID: number,
        reaction: number,
        standing = 100,
      ) =>
        store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game: "forever",
            account: "a",
            character: "Mira",
            realm: "Realm",
            savedAt: at,
            sections: Object.fromEntries(
              Object.entries({
                char: { level, money },
                professions: { list: [{ skillLine: 171, name: "Alchemy", skill }] },
                recipes: { byProfession: { 171: { learned: recipes } } },
                gear: { slots: [{ slot: 1, itemID }] },
                reputation: { factions: [{ factionID: 72, reaction, standing }] },
              }).map(([name, body]) => [name, { scope: "char", v: 1, at, body }]),
            ),
          }),
          "pc",
          at,
        );
      const read = () =>
        readCharacterHistory(store.db, {
          accountId: "a",
          game: "forever",
          characterId: "forever/Realm/Mira",
        });
      await upload(NOW, 10, 10000, 10, ["ids1", "1"], 100, 4);
      assert.deepEqual((await read()).events.map((e) => e.type).sort(), ["gold_close", "level_up"]);
      await upload(NOW + 10, 11, 12345, 13, ["ids1", "1,1"], 101, 5);
      let events = (await read()).events;
      assert.equal(events.length, 7);
      assert.deepEqual(
        events.find((e) => e.type === "skill_step"),
        {
          id: events.find((e) => e.type === "skill_step")!.id,
          type: "skill_step",
          key: "171",
          at: NOW + 10,
          from: 10,
          to: 13,
        },
      );
      assert.equal(events.find((e) => e.type === "gold_close")?.to, 12345);
      assert.equal(events.find((e) => e.type === "gear_change")?.from, 100);
      assert.equal(events.find((e) => e.type === "rep_standing")?.to, 5);
      assert.equal(events.find((e) => e.type === "recipe_learned")?.key, "2");
      await upload(NOW + 10, 11, 12345, 13, ["ids1", "1,1"], 101, 5);
      await upload(NOW + 20, 11, 12345, 13, ["ids1", "1,1"], 101, 5, 200);
      assert.equal((await read()).events.length, 7);
      await upload(NOW + 30, 11, 12345, 13, ["ids1", "1,1"], -1, 5, 200);
      assert.equal((await read()).events.length, 7, "invalid item ids are unknown, not unequipped");
      await upload(NOW + 86400, 11, 0, 14, ["ids1", "1,1"], 101, 5);
      events = (await read()).events;
      assert.equal(events.filter((e) => e.type === "gold_close").length, 2);
      assert.equal(events.find((e) => e.type === "gold_close")?.to, 0);
      assert.deepEqual(
        (
          await readCharacterHistory(store.db, {
            accountId: "other",
            game: "forever",
            characterId: "forever/Realm/Mira",
          })
        ).events,
        [],
      );
      const { backfillCharacterEvents } = await import("../src/character-history-backfill.ts");
      const beforeBackfill = await store.db.all(
        "SELECT type, key, at, from_value, to_value FROM character_events ORDER BY at, type, key",
      );
      await store.db.run("DELETE FROM character_events");
      await backfillCharacterEvents(store.db, { now: NOW + 86401, batchSize: 2 });
      assert.deepEqual(
        await store.db.all(
          "SELECT type, key, at, from_value, to_value FROM character_events ORDER BY at, type, key",
        ),
        beforeBackfill,
      );
      await store.forgetDevice("pc", NOW + 86401);
      assert.deepEqual((await read()).events, []);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const backend of BACKENDS) {
  test(`backfill is bounded, idempotent and does not revive erased history (${backend})`, async () => {
    const { backfillCharacterEvents } = await import("../src/character-history-backfill.ts");
    const dir = mkdtempSync(path.join(import.meta.dirname, ".events-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      for (const game of ["retail", "forever"] as const) {
        for (let i = 0; i < 4; i++) {
          await store.putSnapshot(
            cleanSnapshot({
              schema: 2,
              game,
              account: "a",
              character: "Mira",
              realm: "Realm",
              savedAt: NOW + i,
              sections: {
                char: { scope: "char", v: 1, at: NOW + i, body: { level: 10 + i, money: i * 100 } },
                recipes: {
                  scope: "char",
                  v: 1,
                  at: NOW + i,
                  body: {
                    byProfession: {
                      171: {
                        learned: ["ids1", Array.from({ length: i + 1 }, () => "1").join(",")],
                      },
                    },
                  },
                },
              },
            }),
            "pc",
            NOW + i,
          );
        }
      }
      await store.db.run("DELETE FROM character_events");
      const log: string[] = [];
      await backfillCharacterEvents(store.db, {
        now: NOW + 5,
        batchSize: 2,
        log: (line) => log.push(line),
      });
      const rows = await store.db.all(
        "SELECT game, type, key, at, from_value, to_value FROM character_events ORDER BY game, at, type, key",
      );
      assert.equal(rows.length, 16);
      assert.equal(rows.filter((r) => r.type === "recipe_learned").length, 6);
      await backfillCharacterEvents(store.db, { now: NOW + 5 });
      assert.deepEqual(
        await store.db.all(
          "SELECT game, type, key, at, from_value, to_value FROM character_events ORDER BY game, at, type, key",
        ),
        rows,
      );
      // Also rerun the derivation without its completion marker, as after a restart.
      await store.db.run("DELETE FROM data_meta WHERE key = 'character_events_v1'");
      await backfillCharacterEvents(store.db, { now: NOW + 5, batchSize: 3 });
      assert.deepEqual(
        await store.db.all(
          "SELECT game, type, key, at, from_value, to_value FROM character_events ORDER BY game, at, type, key",
        ),
        rows,
      );
      assert.ok(log.some((line) => line.includes("complete")));
      await store.deleteAccountData("a");
      assert.deepEqual(await store.db.all("SELECT * FROM character_events"), []);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const backend of BACKENDS) {
  test(`MCP history filters changes, paginates equal timestamps and keeps games separate (${backend})`, async () => {
    const { createApp } = await import("../src/app.ts");
    const dir = mkdtempSync(path.join(import.meta.dirname, ".events-"));
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
    try {
      for (const game of ["retail", "forever"] as const) {
        await app.store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game,
            account: "a",
            character: "Mira",
            realm: "Realm",
            savedAt: NOW,
            sections: {
              recipes: {
                scope: "char",
                v: 1,
                at: NOW,
                body: { byProfession: { 171: { learned: ["ids1"] } } },
              },
            },
          }),
          "pc",
          NOW,
        );
        await app.store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game,
            account: "a",
            character: "Mira",
            realm: "Realm",
            savedAt: NOW + 1,
            sections: {
              recipes: {
                scope: "char",
                v: 1,
                at: NOW + 1,
                body: {
                  byProfession: {
                    171: {
                      learned: [
                        "ids1",
                        Array.from({ length: game === "forever" ? 105 : 1 }, () => "1").join(","),
                      ],
                    },
                  },
                },
              },
            },
          }),
          "pc",
          NOW + 1,
        );
      }
      const read = (filter = {}) =>
        readCharacterHistory(
          app.store.db,
          { accountId: "a", game: "forever", characterId: "forever/Realm/Mira" },
          filter,
        );
      const first = await read();
      assert.equal(first.events.length, 100);
      assert.ok(first.next);
      const second = await read({ cursor: first.next! });
      assert.equal(second.events.length, 5);
      assert.equal(second.next, null);
      assert.equal(new Set([...first.events, ...second.events].map((e) => e.id)).size, 105);
      const call = async (game: string, types: string[], since: number) => {
        const response = await app.app.request("/mcp", {
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
            params: {
              name: "get_character_history",
              arguments: { game, character: "Mira", types, since, limit: 2 },
            },
          }),
        });
        const body = await response.text();
        const rpc = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1]!.trim() : body);
        return JSON.parse(rpc.result.content[0].text);
      };
      assert.equal((await call("forever", ["recipe_learned"], NOW)).events.length, 2);
      assert.equal((await call("retail", ["recipe_learned"], NOW)).events.length, 1);
      assert.equal((await call("forever", ["level_up"], NOW)).events.length, 0);
      assert.equal((await call("forever", ["recipe_learned"], NOW + 2)).events.length, 0);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const backend of BACKENDS) {
  test(`legacy recipe diffs never turn a later full snapshot into duplicate learns (${backend})`, async () => {
    const { backfillCharacterEvents } = await import("../src/character-history-backfill.ts");
    const dir = mkdtempSync(path.join(import.meta.dirname, ".events-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      await store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          account: "a",
          character: "Mira",
          realm: "Realm",
          savedAt: NOW,
          sections: { char: { scope: "char", v: 1, at: NOW, body: { level: 10 } } },
        }),
        "pc",
        NOW,
      );
      const full = (ids: string) => ({ byProfession: { 171: { learned: ["ids1", ids] } } });
      for (const [i, kind, body] of [
        [0, "full", full("1")],
        [1, "diff", { ids: { "byProfession.171.learned": { added: [2], addedMore: 3000 } } }],
        [2, "full", full("1,1")],
        [3, "full", full("1,1,1")],
      ] as const) {
        await store.db.run(
          `INSERT INTO section_history (owner_kind, owner_id, section, at, hash, kind, ${store.db.body}) VALUES ('char', 'Realm/Mira', 'recipes', ?, ?, ?, ?)`,
          NOW + i,
          String(i),
          kind,
          JSON.stringify(body),
        );
      }
      await backfillCharacterEvents(store.db, { now: NOW + 4, batchSize: 1 });
      const page = await readCharacterHistory(
        store.db,
        { accountId: "a", game: "retail", characterId: "Realm/Mira" },
        { types: ["recipe_learned"] },
      );
      assert.deepEqual(
        page.events.map((e) => [e.to, e.at]),
        [
          [3, NOW + 3],
          [2, NOW + 1],
        ],
      );
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
