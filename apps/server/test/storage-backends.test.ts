import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { BlizzardIds, type GameDataFetch } from "../src/blizzard.ts";
import { Store } from "../src/store.ts";
import { ACCOUNT, NOW, snapshot } from "./helpers.ts";
import { BACKENDS, postgresPerFile, type Backend } from "./postgres-db.ts";

// ADR 0057 rollout step 2: the id and name caches and the Suggestions behave
// the same on SQLite and on Postgres.
const pg = postgresPerFile();
const DAY = 86_400;

function open(backend: Backend) {
  return new Store(mkdtempSync(path.join(tmpdir(), "unbored-backend-")), {
    postgres: pg(backend),
  });
}

const chain = (done: number) => ({
  lines: [
    { questLineID: 5678, name: "The Long Road", mapID: 2248, done, total: 8, nextQuestID: 79100 },
  ],
});

async function pgCount(backend: Backend, table: string): Promise<number | undefined> {
  const sql = pg(backend);
  if (!sql) return undefined;
  const [row] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
  return row!.n as number;
}

for (const backend of BACKENDS) {
  test(`the id cache keeps a found id 30 days and a missing one a day (${backend})`, async () => {
    const store = open(backend);
    try {
      assert.equal(await store.gameIds.get("item", 6948, NOW), undefined);
      await store.gameIds.put("item", 6948, true, NOW);
      await store.gameIds.put("item", 999_999, false, NOW);
      assert.equal(await store.gameIds.get("item", 6948, NOW + 29 * DAY), true);
      assert.equal(await store.gameIds.get("item", 6948, NOW + 30 * DAY), undefined);
      assert.equal(await store.gameIds.get("item", 999_999, NOW + DAY - 1), false);
      assert.equal(await store.gameIds.get("item", 999_999, NOW + DAY), undefined);
      await store.gameIds.put("item", 999_999, true, NOW + DAY);
      assert.equal(await store.gameIds.get("item", 999_999, NOW + DAY), true, "overwritten");
      assert.equal(await store.gameIds.get("quest", 6948, NOW), undefined, "per kind");
      assert.equal(await pgCount(backend, "game_ids"), backend === "postgres" ? 2 : undefined);
    } finally {
      store.close();
    }
  });

  test(`creature names are kept per locale, a miss as null (${backend})`, async () => {
    const store = open(backend);
    try {
      await store.creatureNames.put(73167, "ru_RU", "Хуолон", NOW);
      await store.creatureNames.put(73167, "en_US", null, NOW);
      await store.creatureNames.put(50, "ru_RU", "Другой", NOW);
      assert.deepEqual(await store.creatureNames.entry(73167, "en_US"), {
        name: null,
        checkedAt: NOW,
      });
      assert.equal(await store.creatureNames.get(73167, "en_US"), undefined);
      assert.equal(await store.creatureNames.get(73167, "ru_RU"), "Хуолон");
      assert.deepEqual(
        [...(await store.creatureNames.many([73167, 50, 1, 73167], "ru_RU"))].sort(),
        [
          [50, "Другой"],
          [73167, "Хуолон"],
        ],
      );
      assert.equal((await store.creatureNames.many([73167], "en_US")).size, 0);
      assert.equal((await store.creatureNames.many([], "ru_RU")).size, 0);
    } finally {
      store.close();
    }
  });

  test(`the Blizzard check asks once, then reads its cache (${backend})`, async () => {
    const store = open(backend);
    const asked: string[] = [];
    const fetchImpl: GameDataFetch = async (url) => {
      asked.push(url);
      if (url.startsWith("https://oauth.battle.net/")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) };
      }
      const missing = url.includes("/item/999999");
      return { ok: !missing, status: missing ? 404 : 200, json: async () => ({}) };
    };
    const ids = new BlizzardIds(
      { clientId: "id", clientSecret: "secret", region: "eu" },
      store.gameIds,
      fetchImpl,
      () => NOW,
    );
    try {
      assert.deepEqual([...(await ids.missing(["item:6948", "item:999999"]))], ["item:999999"]);
      const calls = asked.length;
      assert.equal(calls, 3);
      assert.deepEqual([...(await ids.missing(["item:6948", "item:999999"]))], ["item:999999"]);
      assert.equal(asked.length, calls, "both answers came from the cache");
    } finally {
      store.close();
    }
  });

  test(`Suggestions are computed, read, and erased with the Account (${backend})`, async () => {
    const store = open(backend);
    try {
      const upload = (done: number, at: number) =>
        store.putSnapshot(
          snapshot({ questLines: { body: chain(done) } }, { savedAt: at }),
          "pc-1",
          at,
        );
      const { account } = upload(3, NOW);
      store.suggestions.close();
      assert.equal(await store.suggestions.computeAccount(account, NOW), 1);
      const row = store.data.characters(account)[0]!;
      const first = await store.suggestions.forCharacter(row, NOW);
      assert.equal(first?.computedAt, NOW);
      assert.ok(first?.list.some((item) => item.kind === "chain"));
      assert.equal(await pgCount(backend, "suggestions"), backend === "postgres" ? 1 : undefined);
      assert.equal(
        await pgCount(backend, "chain_progress"),
        backend === "postgres" ? 1 : undefined,
      );

      const later = NOW + 15 * DAY;
      await store.suggestions.computeAccount(account, later);
      const stale = (await store.suggestions.forCharacter(row, later))!.list.find(
        (item) => item.kind === "chain",
      );
      assert.deepEqual(stale?.reason, { kind: "stopped", at: NOW });

      const body = await store.suggestionsForDevice("pc-1");
      assert.equal(body.computedAt, later);
      assert.deepEqual(Object.keys(body.characters), [`${row.realm}-${row.name}`]);
      assert.deepEqual(await store.suggestionsForDevice("pc-2"), {
        v: 1,
        computedAt: 0,
        characters: {},
      });

      const erased = await store.deleteAccountData(ACCOUNT, { requests: false });
      assert.equal(erased.suggestions, 1);
      assert.equal(await store.suggestions.forCharacter(row, later), undefined);
      assert.equal(await pgCount(backend, "suggestions"), backend === "postgres" ? 0 : undefined);
    } finally {
      store.close();
    }
  });

  test(`Forget my data erases the device's Suggestions too (${backend})`, async () => {
    const store = open(backend);
    try {
      const { account } = store.putSnapshot(
        snapshot({ questLines: { body: chain(3) } }),
        "pc-1",
        NOW,
      );
      store.suggestions.close();
      await store.suggestions.computeAccount(account, NOW);
      const row = store.data.characters(account)[0]!;
      assert.ok(await store.suggestions.forCharacter(row, NOW));
      const totals = await store.forgetDevice("pc-1", NOW);
      assert.equal(totals.accounts, 1);
      assert.equal(totals.revoked, true);
      assert.equal(await store.suggestions.forCharacter(row, NOW), undefined);
      assert.equal(await pgCount(backend, "suggestions"), backend === "postgres" ? 0 : undefined);
    } finally {
      store.close();
    }
  });
}
