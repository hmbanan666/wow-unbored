import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import type { GameDataFetch } from "../src/blizzard.ts";
import { GameDb } from "../src/game-db.ts";
import { getQuestLine } from "../src/game-tools.ts";
import { createApp } from "../src/app.ts";
import { coreCsv } from "./game-content-fixture.ts";
import { BACKENDS, hasPostgres, postgresPerFile, type Backend } from "./postgres-db.ts";

const pg = postgresPerFile();
const build = "12.0.1.66337";
async function fixture(backend: Backend, blizzardFetch?: GameDataFetch) {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".planner-game-"));
  const server = createApp({
    dataDir: dir,
    database: pg(backend),
    companionToken: "companion",
    plannerToken: "owner",
    blizzard: blizzardFetch ? { clientId: "fixture", clientSecret: "fixture", region: "us" } : null,
    blizzardFetch,
    log: () => {},
  });
  const tables = { ...coreCsv };
  const load = (version = build) =>
    server.store.game.importBuild(version, async (input) => {
      const url = new URL(String(input));
      let csv = tables[url.pathname.split("/")[2]];
      if (url.searchParams.get("locale") === "ruRU")
        csv = csv
          .replaceAll("Thunderfury", "Громовая Ярость")
          .replaceAll("A new beginning", "Новое начало")
          .replaceAll("A small adventure", "Небольшое приключение");
      return new Response(csv);
    });
  return {
    ...server,
    dir,
    tables,
    load,
    async call(name: string, args: Record<string, unknown>) {
      const response = await server.app.request("/mcp", {
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
          params: { name, arguments: args },
        }),
      });
      const rpc = await response.json();
      assert.ok(!rpc.error, JSON.stringify(rpc));
      assert.ok(!rpc.result.isError, JSON.stringify(rpc.result));
      return JSON.parse(rpc.result.content[0].text);
    },
    async close() {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("item sources explain the chance-only verdict used by Plan submission", async () => {
  const app = await fixture("sqlite");
  try {
    const result = await app.call("get_item_sources", { itemID: 32458 });
    assert.equal(result.acquisition, "chance-only");
    assert.equal(result.sources[0].acquisition, "chance-only");
    assert.equal(result.sources[0].guaranteed, false);
    assert.match(result.sources[0].source.url, /32458/);
    const unknown = await app.call("get_item_sources", { itemID: 999999 });
    assert.equal(unknown.acquisition, "unknown");
  } finally {
    await app.close();
  }
});

for (const backend of BACKENDS) {
  test(`quest names prefer Game DB and cache localized API evidence per build (${backend})`, async () => {
    let online = true;
    let revision = "First";
    const app = await fixture(backend, async (input) => {
      const url = new URL(String(input));
      if (!online) throw new Error("fixture offline");
      if (url.hostname === "oauth.battle.net")
        return Response.json({ access_token: "fixture", expires_in: 3600 });
      assert.equal(url.pathname, "/data/wow/quest/90002");
      assert.equal(url.searchParams.get("namespace"), "static-us");
      const locale = url.searchParams.get("locale");
      assert.ok(locale === "en_US" || locale === "ru_RU");
      return Response.json({
        id: 90002,
        title: locale === "ru_RU" ? "Путешествие" : `${revision} adventure`,
      });
    });
    try {
      app.tables.QuestV2 += "90002,43\n";
      app.tables.QuestLineXQuest += "12,10,90002,1\n";
      await app.load();
      const line = await app.call("get_quest_line", { questLineID: 10 });
      assert.equal(line.quests[0].name, "A small adventure");
      assert.equal(line.quests[0].nameSource.kind, "Game DB");
      assert.equal(line.quests[1].name, "First adventure");
      assert.equal(line.quests[1].nameSource.kind, "Blizzard Game Data API");
      assert.equal(line.quests[1].nameSource.build, build);
      assert.equal(line.quests[1].nameSource.locale, "enUS");
      assert.match(line.quests[1].nameSource.url, /quest\/90002/);
      assert.deepEqual(line.unavailable, []);
      const ru = await app.call("get_quest_line", { questLineID: 10, locale: "ruRU" });
      assert.equal(ru.quests[1].name, "Путешествие");
      online = false;
      const reopened = new GameDb(app.store.db, app.dir);
      assert.deepEqual(await getQuestLine(reopened, { questLineID: 10, locale: "enUS" }), line);
      assert.deepEqual(await app.call("get_quest_line", { questLineID: 10 }), line);
      await app.load("12.0.1.66338");
      const unavailable = await app.call("get_quest_line", { questLineID: 10 });
      assert.equal(unavailable.quests[1].name, null);
      assert.equal(unavailable.quests[1].nameSource, null);
      assert.ok(unavailable.unavailable.some((reason: string) => reason.includes("90002")));
      online = true;
      revision = "New";
      const fresh = await app.call("get_quest_line", { questLineID: 10 });
      assert.equal(fresh.quests[1].name, "New adventure");
      assert.equal(fresh.quests[1].nameSource.build, "12.0.1.66338");
    } finally {
      await app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`Planner finds exact localized entity names with source and ambiguity (${backend})`, async () => {
    const app = await fixture(backend);
    try {
      app.tables.ItemSparse += "19020,Thunderfury\n19021,100% literal_\n";
      await app.load();
      const found = await app.call("find_game_entity", {
        kind: "item",
        name: "Громовая Ярость",
        locale: "ruRU",
      });
      assert.deepEqual(
        found.entities.map((row: { id: number }) => row.id),
        [19019, 19020],
      );
      assert.equal(found.source.build, build);
      assert.equal(found.source.table, "ItemSparse");
      assert.equal(found.source.locale, "ruRU");
      assert.equal(found.truncated, false);
      assert.deepEqual(
        (await app.call("find_game_entity", { kind: "item", name: "%" })).entities,
        [],
      );
      assert.deepEqual(
        (await app.call("find_game_entity", { kind: "item", name: "100% literal_" })).entities.map(
          (row: { id: number }) => row.id,
        ),
        [19021],
      );
      app.tables.ItemSparse = "ID,Display_lang\n1,Replacement\n";
      await app.load("12.0.1.66338");
      assert.deepEqual(
        (await app.call("find_game_entity", { kind: "item", name: "Thunderfury" })).entities,
        [],
      );
    } finally {
      await app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`Planner reads quest-line order and preserves unknown quest names (${backend})`, async () => {
    const app = await fixture(backend);
    try {
      app.tables.QuestV2 += "90002,43\n";
      app.tables.QuestLineXQuest =
        "ID,QuestLineID,QuestID,OrderIndex\n11,10,90002,3\n12,10,90001,1\n";
      await app.load();
      const line = await app.call("get_quest_line", { questLineID: 10 });
      assert.deepEqual(
        line.quests.map(
          ({ questID, order, name }: { questID: number; order: number; name: string | null }) => ({
            questID,
            order,
            name,
          }),
        ),
        [
          { questID: 90001, order: 1, name: "A small adventure" },
          { questID: 90002, order: 3, name: null },
        ],
      );
      assert.equal(line.source.build, build);
      const localized = await app.call("get_quest_line", { questLineID: 10, locale: "ruRU" });
      assert.equal(localized.name, "Новое начало");
      assert.equal(localized.quests[0].name, "Небольшое приключение");
      assert.ok(line.unavailable.includes("quest name: 90002"));
      assert.equal((await app.call("get_quest_line", { questLineID: 999 })).name, null);
      // A tied order is not evidence for an invented sequence.
      app.tables.QuestLineXQuest =
        "ID,QuestLineID,QuestID,OrderIndex\n11,10,90002,1\n12,10,90001,1\n";
      await app.load("12.0.1.66338");
      const ambiguous = await app.call("get_quest_line", { questLineID: 10 });
      assert.deepEqual(ambiguous.quests, []);
      assert.ok(ambiguous.unavailable.includes("quest order ambiguous"));
    } finally {
      await app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`Planner resolves a place to zone, continent and a proved expansion (${backend})`, async () => {
    const app = await fixture(backend);
    try {
      app.tables.UiMap =
        "ID,Name_lang,ParentUiMapID,Type\n900,A floor,84,4\n84,Stormwind City,13,3\n13,Eastern Kingdoms,0,2\n";
      app.tables.UiMapAssignment += "2,900,0,1519,0,0,100,100,0,0,1,1\n";
      await app.load();
      const place = await app.call("get_place", { mapID: 900 });
      assert.deepEqual(place.zone, { mapID: 84, name: "Stormwind City" });
      assert.deepEqual(place.continent, { mapID: 13, name: "Eastern Kingdoms" });
      assert.deepEqual(place.expansion, { id: 0, scope: "worldMap" });
      assert.equal(place.source.build, build);
      // Conflicting world-map assignments do not justify choosing an expansion.
      app.tables.UiMapAssignment += "3,900,530,0,0,0,100,100,0,0,1,1\n";
      app.tables.Map += "530,Outland,-1,1,0\n";
      await app.load("12.0.1.66338");
      const conflict = await app.call("get_place", { mapID: 900 });
      assert.equal(conflict.expansion, null);
      assert.ok(conflict.unavailable.includes("expansion ambiguous or missing"));
    } finally {
      await app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`Planner reports item sources from the API and vetted Catalog separately (${backend})`, async () => {
    const app = await fixture(backend, async (url) => {
      if (url.includes("oauth.battle.net"))
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "fixture", expires_in: 3600 }),
        };
      const query = new URL(url);
      assert.equal(query.pathname, "/data/wow/search/journal-encounter");
      assert.equal(query.searchParams.get("items.item.id"), "49636");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          pageCount: 1,
          results: [
            {
              data: {
                id: 7,
                name: { en_US: "A journal boss", ru_RU: "Босс" },
                items: [{ id: 1, item: { id: 49636 } }],
              },
            },
            {
              data: {
                id: 8,
                name: { en_US: "Wrong item" },
                items: [{ id: 49636, item: { id: 111 } }],
              },
            },
          ],
        }),
      };
    });
    try {
      const result = await app.call("get_item_sources", { itemID: 49636, locale: "ruRU" });
      assert.equal(result.sources.length, 2);
      const api = result.sources.find(
        (row: { source: { kind: string } }) => row.source.kind === "Blizzard Game Data API",
      );
      assert.equal(api.encounterID, 7);
      assert.equal(api.name, "Босс");
      assert.equal(api.guaranteed, null);
      const catalog = result.sources.find(
        (row: { source: { kind: string } }) => row.source.kind === "Catalog",
      );
      assert.equal(catalog.boss, "Onyxia");
      assert.equal(
        catalog.source.url,
        "https://www.wowhead.com/item=49636/reins-of-the-onyxian-drake",
      );
      assert.equal(catalog.guaranteed, null);
      assert.equal(result.coverage.blizzard, "available");
    } finally {
      await app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`Planner tools report missing imports and bounded results without guessing (${backend})`, async () => {
    const app = await fixture(backend);
    try {
      const missing = await app.call("find_game_entity", { kind: "item", name: "Thunderfury" });
      assert.deepEqual(missing.entities, []);
      assert.deepEqual(missing.unavailable, ["Game DB unavailable"]);
      assert.equal(missing.source.build, null);
      assert.deepEqual((await app.call("get_quest_line", { questLineID: 10 })).quests, []);
      const sources = await app.call("get_item_sources", { itemID: 999999 });
      assert.deepEqual(sources.sources, []);
      assert.equal(sources.coverage.blizzard, "unavailable");
      app.tables.ItemSparse =
        "ID,Display_lang\n" + Array.from({ length: 55 }, (_, i) => `${i + 1},Same name\n`).join("");
      app.tables.QuestLineXQuest =
        "ID,QuestLineID,QuestID,OrderIndex\n" +
        Array.from({ length: 257 }, (_, i) => `${i + 1},10,90001,${i}\n`).join("");
      await app.load();
      const limited = await app.call("find_game_entity", { kind: "item", name: "Same name" });
      assert.equal(limited.entities.length, 50);
      assert.equal(limited.truncated, true);
      const line = await app.call("get_quest_line", { questLineID: 10 });
      assert.deepEqual(
        line.quests.map(
          ({ questID, order, name }: { questID: number; order: number; name: string | null }) => ({
            questID,
            order,
            name,
          }),
        ),
        [],
      );
      assert.ok(line.unavailable.includes("quest line: result limit"));
    } finally {
      await app.close();
    }
  });
}

test("item sources preserve Catalog evidence through API errors and expose partial searches", async () => {
  let body: unknown = {};
  let status = 503;
  const app = await fixture("sqlite", async (url) =>
    url.includes("oauth.battle.net")
      ? { ok: true, status: 200, json: async () => ({ access_token: "fixture", expires_in: 3600 }) }
      : { ok: status === 200, status, json: async () => body },
  );
  try {
    const unavailable = await app.call("get_item_sources", { itemID: 49636 });
    assert.equal(unavailable.sources[0].boss, "Onyxia");
    assert.equal(unavailable.coverage.blizzard, "unavailable");
    status = 200;
    for (const invalid of [
      {},
      { page: 1, pageCount: 1, results: [null] },
      { page: 2, pageCount: 2, results: [] },
    ]) {
      body = invalid;
      assert.equal(
        (await app.call("get_item_sources", { itemID: 49636 })).coverage.blizzard,
        "unavailable",
      );
    }
    body = {
      page: 1,
      pageCount: 2,
      results: [{ data: { id: 7, items: [{ item: { id: 49636 } }] } }],
    };
    const partial = await app.call("get_item_sources", { itemID: 49636 });
    assert.equal(partial.coverage.blizzard, "truncated");
    assert.equal(partial.sources[0].name, null);
    assert.ok(partial.unavailable.includes("journal search: result limit"));
  } finally {
    await app.close();
  }
});

test.skipIf(!hasPostgres)("Path owner save and publish checks use API quest titles", async () => {
  let title = "A verified adventure";
  const app = await fixture("postgres", async (input) => {
    if (String(input).includes("oauth.battle.net"))
      return Response.json({ access_token: "fixture", expires_in: 3600 });
    return Response.json({ id: 90002, title });
  });
  const document = {
    kind: "path",
    slug: "quest-names",
    title: "Quest names",
    tier: "basic",
    description: "A sourced quest goal.",
    blocks: [],
    items: [
      {
        kind: "quest",
        id: 90002,
        name: "Invented name",
        source: { type: "quest", text: "Quest" },
        chance: false,
        note: "Finish the quest.",
      },
    ],
  };
  const save = () =>
    app.app.request("/owner/content", {
      method: "PUT",
      headers: { authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify(document),
    });
  try {
    app.tables.QuestV2 += "90002,43\n";
    await app.load();
    const wrong = await save();
    assert.equal(wrong.status, 400);
    assert.match(JSON.stringify(await wrong.json()), /A verified adventure/);
    document.items[0].name = "A verified adventure";
    assert.equal((await save()).status, 200);
    const saved = await app.call("save_content_draft", { document });
    assert.equal(saved.unchanged, true);
    title = "New build title";
    await app.load("12.0.1.66338");
    const rejected = await app.app.request("/owner/content/path/quest-names/publish", {
      method: "POST",
      headers: { authorization: "Bearer owner" },
    });
    assert.equal(rejected.status, 400);
    assert.match(JSON.stringify(await rejected.json()), /New build title/);
    document.items[0].name = title;
    await app.call("save_content_draft", { document });
    assert.equal(
      (await app.call("publish_content", { kind: "path", slug: "quest-names" })).status,
      "published",
    );
  } finally {
    await app.close();
  }
});

test.each([
  "http",
  "timeout",
  "wrong id",
  "empty",
  "missing title",
  "object",
  "invalid json",
  "oversized",
  "token",
])(
  "unavailable quest API (%s) leaves names null with a reason and permits retry",
  async (failure) => {
    let recovered = false;
    const app = await fixture("sqlite", async (input) => {
      if (String(input).includes("oauth.battle.net"))
        return failure === "token" && !recovered
          ? new Response(null, { status: 503 })
          : Response.json({ access_token: "fixture", expires_in: 3600 });
      if (recovered) return Response.json({ id: 90002, title: "Recovered title" });
      if (failure === "http") return new Response(null, { status: 503 });
      if (failure === "timeout") throw new DOMException("fixture timeout", "TimeoutError");
      if (failure === "wrong id") return Response.json({ id: 90003, title: "Wrong quest" });
      if (failure === "empty") return Response.json({ id: 90002, title: "   " });
      if (failure === "missing title") return Response.json({ id: 90002, name: "Not a title" });
      if (failure === "object") return Response.json({ id: 90002, title: { en_US: "Unexpected" } });
      if (failure === "invalid json") return new Response("{");
      return Response.json({ id: 90002, title: "x".repeat(501) });
    });
    try {
      app.tables.QuestV2 += "90002,43\n";
      app.tables.QuestLineXQuest += "12,10,90002,1\n";
      await app.load();
      const result = await app.call("get_quest_line", { questLineID: 10 });
      assert.equal(result.quests[1].name, null);
      assert.equal(result.quests[1].nameSource, null);
      assert.ok(
        result.unavailable.includes("quest name: 90002 (Blizzard Game Data API unavailable)"),
      );
      recovered = true;
      const retry = await app.call("get_quest_line", { questLineID: 10 });
      assert.equal(retry.quests[1].name, "Recovered title");
    } finally {
      await app.close();
    }
  },
);
