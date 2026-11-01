import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { test } from "vite-plus/test";
import { serve } from "@hono/node-server";

import { packIds, sectionHash, unpackIds, unpackRows } from "@unbored/contracts";

import { createApp } from "../src/app.ts";
import { sqlitePath } from "../src/config.ts";
import { SNAPSHOT_MAX_COMPRESSED } from "../src/data.ts";
import { database, onPostgres } from "./backend.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
) as {
  account: string;
  character: string;
  realm: string;
  savedAt: number;
  sections: Record<string, { hash: string; body: Record<string, unknown> }>;
};

type App = ReturnType<typeof createApp>["app"];

function build(dataDir = mkdtempSync(path.join(tmpdir(), "unbored-data-"))) {
  return createApp({
    database: database(),
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    log: () => {},
  });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function post(app: App, body: unknown, options: { gzip?: boolean; bearer?: string } = {}) {
  const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.bearer ?? companion}`,
    "content-type": "application/json",
  };
  if (options.gzip !== false) headers["content-encoding"] = "gzip";
  return app.request("/v1/snapshot", {
    method: "POST",
    headers,
    body: options.gzip === false ? raw : gzipSync(raw),
  });
}

async function mcpCall(app: App, name: string, args: Record<string, unknown>) {
  const headers = {
    authorization: `Bearer ${planner}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
      },
    }),
  });
  const response = await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await json(response);
  const result = body.result as { isError?: boolean; content: { text: string }[] };
  let value: Record<string, unknown> = {};
  try {
    value = JSON.parse(result.content[0].text) as Record<string, unknown>;
  } catch {
    value = { text: result.content[0].text };
  }
  return { isError: result.isError === true, value };
}

function withSection(name: string, body: Record<string, unknown>, savedAt: number) {
  const next = structuredClone(fixture);
  next.savedAt = savedAt;
  next.sections[name] = { ...next.sections[name], body, hash: sectionHash(body) };
  return next;
}

test("a gzip snapshot is stored, an unknown Section is kept raw, and a re-post changes nothing", async () => {
  const { app, close } = build();
  try {
    assert.equal((await post(app, fixture, { bearer: "nope" })).status, 401);
    const first = await post(app, fixture);
    assert.equal(first.status, 200, await first.clone().text());
    const stored = await json(first);
    assert.equal(stored.account, "111111");
    assert.ok((stored.stored as string[]).includes("questsDone"));
    assert.deepEqual(stored.unknown, ["futureThing"]);

    const again = await json(await post(app, fixture));
    assert.deepEqual(again.stored, []);
    assert.equal((again.unchanged as string[]).length, Object.keys(fixture.sections).length);

    const plain = await post(app, fixture, { gzip: false });
    assert.equal(plain.status, 200, "plain JSON is accepted too");

    const data = await mcpCall(app, "get_game_data", { character: "Mira" });
    assert.equal(data.isError, false, JSON.stringify(data.value));
    const sections = data.value.sections as Record<string, { unknown: boolean; body: unknown }>;
    assert.equal(sections.futureThing?.unknown, true);
    assert.deepEqual(sections.futureThing?.body, { anything: "kept raw" });
    const quests = sections.questsDone?.body as { count: number; ids: unknown };
    assert.equal(quests.count, 387);
    assert.equal(typeof quests.ids, "object", "packed sets come back as counts unless expanded");
  } finally {
    close();
  }
});

test("an unchanged Section body still advances its schema version", async () => {
  const { app, store, close } = build();
  try {
    assert.equal((await post(app, fixture)).status, 200);
    const next = {
      ...fixture,
      savedAt: fixture.savedAt + 100,
      sections: { mounts: { ...fixture.sections.mounts, v: 2 } },
    };
    const result = await json(await post(app, next));
    assert.deepEqual(result.stored, ["mounts"]);
    const section = (await store.data.section("account", "111111", "mounts"))!;
    assert.equal(section.v, 2);
    assert.equal(section.unknown, true, "a newer unknown schema must not masquerade as v1");
    assert.equal(section.hash, fixture.sections.mounts.hash);
    const last = (await store.data.lastChange("account", "111111", "mounts"))!;
    assert.equal(last.kind, "full", "schema changes never become collection diffs");
    const retry = await json(await post(app, next));
    assert.deepEqual(retry.stored, []);
    assert.equal((await store.data.lastChange("account", "111111", "mounts"))!.id, last.id);
  } finally {
    close();
  }
});

test("an unchanged newer save prevents an older changed Section from replacing it", async () => {
  const { app, store, close } = build();
  try {
    assert.equal((await post(app, fixture)).status, 200);
    const newer = { ...fixture, savedAt: fixture.savedAt + 200 };
    const initial = (await store.data.lastChange("account", "111111", "mounts"))!;
    assert.deepEqual((await json(await post(app, newer))).stored, []);
    const older = withSection("mounts", { ids: packIds([999]), count: 1 }, fixture.savedAt + 100);
    const result = await json(await post(app, older));
    assert.equal(result.stale, true);
    const section = (await store.data.section("account", "111111", "mounts"))!;
    assert.equal(section.savedAt, newer.savedAt);
    assert.deepEqual(section.body, fixture.sections.mounts.body);
    assert.equal((await store.data.lastChange("account", "111111", "mounts"))!.id, initial.id);
  } finally {
    close();
  }
});

test("a stale char Section cannot roll back the Character catalog or upload metadata", async () => {
  const { app, store, close } = build();
  try {
    const fresh = withSection(
      "char",
      { name: "Mira", class: "Mage", level: 80 },
      fixture.savedAt + 200,
    );
    fresh.sections = { char: fresh.sections.char };
    assert.equal((await post(app, fresh)).status, 200);
    const before = (await store.data.character("Mira", fixture.realm))!;
    const stale = {
      ...withSection("char", { name: "Mira", class: "Warrior", level: 70 }, fixture.savedAt + 100),
      account: "old-account",
      dropped: { char: { bags: { at: fixture.savedAt, bytes: 100 } } },
    };
    stale.sections = { char: stale.sections.char };
    assert.equal((await json(await post(app, stale))).stale, true);
    const after = (await store.data.character("Mira", fixture.realm))!;
    assert.equal(after.level, 80);
    assert.equal(after.class, "Mage");
    assert.equal(after.accountId, before.accountId);
    assert.equal(after.savedAt, before.savedAt);
    assert.deepEqual(after.dropped, before.dropped);
    assert.deepEqual(
      (await store.data.section("char", after.id, "char"))!.body,
      fresh.sections.char.body,
    );
  } finally {
    close();
  }
});

test("Character facts follow the accepted char Section, not the latest unrelated Section", async () => {
  const { app, store, close } = build();
  try {
    const first = withSection("char", { name: "Mira", class: "Mage", level: 70 }, fixture.savedAt);
    first.sections = { char: first.sections.char };
    assert.equal((await post(app, first)).status, 200);
    const bags = {
      ...fixture,
      savedAt: fixture.savedAt + 300,
      sections: { bags: fixture.sections.bags },
    };
    assert.equal((await post(app, bags)).status, 200);
    const next = withSection(
      "char",
      { name: "Mira", class: "Mage", level: 80 },
      fixture.savedAt + 200,
    );
    next.sections = { char: next.sections.char };
    assert.deepEqual((await json(await post(app, next))).stored, ["char"]);
    assert.equal((await store.data.character("Mira", fixture.realm))!.level, 80);
    assert.equal((await store.data.character("Mira", fixture.realm))!.savedAt, bags.savedAt);

    const old = withSection(
      "char",
      { name: "Mira", class: "Mage", level: 75 },
      fixture.savedAt + 100,
    );
    old.sections = { char: old.sections.char };
    assert.equal((await json(await post(app, old))).stale, true);
    assert.equal((await store.data.character("Mira", fixture.realm))!.level, 80);
  } finally {
    close();
  }
});

test("legacy profiles cannot replace Character facts supplied by a char Section", async () => {
  const { app, store, close } = build();
  try {
    const current = withSection(
      "char",
      { name: "Mira", class: "Mage", level: 80 },
      fixture.savedAt,
    );
    current.sections = { char: current.sections.char };
    assert.equal((await post(app, current)).status, 200);
    const profile = await app.request("/v1/profile", {
      method: "POST",
      headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
      body: JSON.stringify({
        character: fixture.character,
        realm: fixture.realm,
        account: fixture.account,
        savedAt: fixture.savedAt + 100,
        profile: { v: 1, context: { level: 70, class: "Warrior" } },
      }),
    });
    assert.equal(profile.status, 200);
    assert.equal((await store.data.character("Mira", fixture.realm))!.level, 80);
    assert.equal((await store.data.character("Mira", fixture.realm))!.class, "Mage");
  } finally {
    close();
  }
});

test("an unchanged char upload repairs catalog facts and an empty field preserves a good value", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-catalog-repair-"));
  const { app, store, close } = build(dataDir);
  try {
    const current = withSection(
      "char",
      { name: "Mira", class: "Mage", level: 80 },
      fixture.savedAt,
    );
    current.sections = { char: current.sections.char };
    assert.equal((await post(app, current)).status, 200);
    await store.db.run(
      `UPDATE characters SET class = 'Warrior', level = 70 WHERE name = ?`,
      "Mira",
    );
    assert.deepEqual((await json(await post(app, current))).stored, []);
    assert.equal((await store.data.character("Mira", fixture.realm))!.level, 80);
    assert.equal((await store.data.character("Mira", fixture.realm))!.class, "Mage");
    const partial = withSection("char", { name: "Mira", class: "" }, fixture.savedAt + 100);
    partial.sections = { char: partial.sections.char };
    assert.equal((await post(app, partial)).status, 200);
    assert.equal((await store.data.character("Mira", fixture.realm))!.level, 80);
    assert.equal((await store.data.character("Mira", fixture.realm))!.class, "Mage");
  } finally {
    close();
  }
});

test("bad bodies are refused with a reason, and an oversized one with 413", async () => {
  const { app, close } = build();
  try {
    const badGzip = await app.request("/v1/snapshot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${companion}`,
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      body: Buffer.from("not gzip at all"),
    });
    assert.equal(badGzip.status, 400);
    assert.equal((await post(app, "{ not json")).status, 400);
    const badSchema = await post(app, { schema: 2, character: "", sections: {} });
    assert.equal(badSchema.status, 400);
    assert.equal(typeof (await json(badSchema)).error, "string");

    const huge = await app.request("/v1/snapshot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${companion}`,
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      body: Buffer.alloc(4 * 1024 * 1024 + 1),
    });
    assert.equal(huge.status, 413);
  } finally {
    close();
  }
});

for (const declared of [undefined, "1"]) {
  for (const cleanup of ["done", "failed", "pending"]) {
    test(`snapshot stops consuming an oversized stream (content-length ${declared ?? "absent"}, cleanup ${cleanup})`, async () => {
      const { app, store, close } = build();
      let pulled = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulled++;
            // The first two chunks cross the cap. The remaining chunks must never be read.
            controller.enqueue(Buffer.alloc(SNAPSHOT_MAX_COMPRESSED / 2 + 1));
            if (pulled === 4) controller.close();
          },
          cancel() {
            cancelled = true;
            if (cleanup === "failed") return Promise.reject(new Error("cleanup failed"));
            if (cleanup === "pending") return new Promise<void>(() => {});
          },
        },
        { highWaterMark: 0 },
      );
      const headers: Record<string, string> = { authorization: `Bearer ${companion}` };
      if (declared) headers["content-length"] = declared;
      const init: RequestInit & { duplex: "half" } = {
        method: "POST",
        headers,
        body: stream,
        duplex: "half",
      };
      try {
        const response = await app.request(new Request("http://localhost/v1/snapshot", init));
        assert.equal(response.status, 413);
        assert.equal(pulled, 2);
        assert.equal(cancelled, true);
        assert.deepEqual((await store.data.catalog()).accounts, []);
      } finally {
        close();
      }
    });
  }
}

test("snapshot rejects unauthorized and declared oversized bodies before reading", async () => {
  const { app, close } = build();
  try {
    for (const [bearer, length, expected] of [
      ["wrong", "1", 401],
      [companion, String(SNAPSHOT_MAX_COMPRESSED + 1), 413],
    ] as const) {
      let pulled = false;
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulled = true;
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      const init: RequestInit & { duplex: "half" } = {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-length": length },
        body,
        duplex: "half",
      };
      assert.equal(
        (await app.request(new Request("http://localhost/v1/snapshot", init))).status,
        expected,
      );
      assert.equal(pulled, false);
      await body.cancel();
    }
  } finally {
    close();
  }
});

test("snapshot accepts exactly the byte cap and fragmented gzip", async () => {
  const { app, close } = build();
  try {
    const raw = JSON.stringify(fixture);
    const exact = raw + " ".repeat(SNAPSHOT_MAX_COMPRESSED - Buffer.byteLength(raw));
    assert.equal((await post(app, exact, { gzip: false })).status, 200);
    const gzip = gzipSync(raw);
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === gzip.length) return controller.close();
        const end = Math.min(offset + 7, gzip.length);
        controller.enqueue(gzip.subarray(offset, end));
        offset = end;
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { authorization: `Bearer ${companion}`, "content-encoding": "gzip" },
      body,
      duplex: "half",
    };
    assert.equal(
      (await app.request(new Request("http://localhost/v1/snapshot", init))).status,
      200,
    );
  } finally {
    close();
  }
});

test("the HTTP adapter returns 413 before a chunked snapshot upload ends", async () => {
  const { app, store, close } = build();
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = httpRequest({
    hostname: "127.0.0.1",
    port: address.port,
    path: "/v1/snapshot",
    method: "POST",
    headers: { authorization: `Bearer ${companion}` },
  });
  try {
    const status = await new Promise<number>((resolve, reject) => {
      request.once("error", reject);
      request.once("response", (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.setTimeout(3000, () =>
        request.destroy(new Error("snapshot waited for end of upload")),
      );
      request.write(Buffer.alloc(SNAPSHOT_MAX_COMPRESSED + 1));
      // Deliberately no request.end(): the handler must reject without EOF.
    });
    assert.equal(status, 413);
    assert.equal(request.writableEnded, false);
    assert.deepEqual((await store.data.catalog()).accounts, []);
  } finally {
    request.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    close();
  }
});

test("an interrupted snapshot stream returns a clean error without storing data", async () => {
  const { app, store, close } = build();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from('{"account":'));
      controller.error(new Error("private transport details"));
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { authorization: `Bearer ${companion}` },
    body,
    duplex: "half",
  };
  try {
    const response = await app.request(new Request("http://localhost/v1/snapshot", init));
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error, "The game data must be JSON, optionally gzip.");
    assert.deepEqual((await store.data.catalog()).accounts, []);
  } finally {
    close();
  }
});

test("history keeps id and count diffs, and get_data_changes shows the last upload", async () => {
  const { app, close } = build();
  try {
    await post(app, fixture);
    const quests = unpackIds(fixture.sections.questsDone.body.ids);
    const more = withSection(
      "questsDone",
      { count: quests.length + 2, ids: packIds([...quests, 90001, 90002]) },
      fixture.savedAt + 600,
    );
    const bags = withSection(
      "bags",
      { ...fixture.sections.bags.body, items: ["idv1", "5d0:3,4dag:16"] },
      more.savedAt,
    );
    bags.sections.questsDone = more.sections.questsDone;
    const second = await json(await post(app, bags));
    assert.deepEqual([...(second.stored as string[])].sort(), ["bags", "questsDone"]);

    const changes = await mcpCall(app, "get_data_changes", { character: "Mira" });
    assert.equal(changes.isError, false, JSON.stringify(changes.value));
    const list = changes.value.changes as {
      section: string;
      savedAt: number;
      change: { ids: Record<string, { added?: number[]; changed?: unknown[] }> };
    }[];
    assert.deepEqual(list.map((entry) => entry.section).sort(), ["bags", "questsDone"]);
    assert.ok(
      list.every((entry) => entry.savedAt === more.savedAt),
      "only the last upload",
    );
    const questDiff = list.find((entry) => entry.section === "questsDone")!.change.ids.ids;
    assert.deepEqual(questDiff?.added, [90001, 90002]);
    const bagDiff = list.find((entry) => entry.section === "bags")!.change.ids.items;
    assert.deepEqual(bagDiff?.changed, [[6948, [1], [3]]]);

    const all = await mcpCall(app, "get_data_changes", { character: "Mira", since: 0 });
    const first = (all.value.changes as { section: string; change: { initial?: boolean } }[]).find(
      (entry) => entry.section === "questsDone" && entry.change.initial,
    );
    assert.ok(first, "the first upload of a packed Section is stored as initial counts");
  } finally {
    close();
  }
});

test("check_ids, the overview, the Data explorer and /owner/data read the stored Sections", async () => {
  const { app, close } = build();
  try {
    await post(app, fixture);
    const quests = unpackIds(fixture.sections.questsDone.body.ids);
    const mounts = unpackIds(fixture.sections.mounts.body.ids);

    const questCheck = await mcpCall(app, "check_ids", {
      kind: "quest",
      ids: [quests[0], 999999],
      character: "Mira",
    });
    const rows = questCheck.value.characters as { character: string; have: number[] }[];
    assert.deepEqual(rows[0]?.have, [quests[0]]);

    const mountCheck = await mcpCall(app, "check_ids", {
      kind: "mount",
      ids: [mounts[0], 999999],
      account: "111111",
    });
    const account = mountCheck.value.account as { have: number[]; missing: number[] };
    assert.deepEqual(account.have, [mounts[0]]);
    assert.deepEqual(account.missing, [999999]);

    const species = unpackRows(fixture.sections.pets.body.species).map((row) => row.id);
    const petCheck = await mcpCall(app, "check_ids", {
      kind: "pet",
      ids: [species[0], 999999],
      account: "111111",
    });
    const pets = petCheck.value.account as { have: number[]; missing: number[] };
    assert.deepEqual(pets.have, [species[0]], "pet ids are species ids");
    assert.deepEqual(pets.missing, [999999]);

    const withToys = withSection(
      "toys",
      { count: 2, ids: packIds([1001, 1002]) },
      fixture.savedAt + 60,
    );
    withToys.sections.toys = { ...fixture.sections.pets, ...withToys.sections.toys };
    await post(app, withToys);
    const toyCheck = await mcpCall(app, "check_ids", {
      kind: "toy",
      ids: [1002, 999999],
      account: "111111",
    });
    const toys = toyCheck.value.account as { have: number[]; missing: number[] };
    assert.deepEqual(toys.have, [1002]);
    assert.deepEqual(toys.missing, [999999]);

    const overview = await mcpCall(app, "get_account_overview", {});
    const accounts = overview.value.accounts as {
      account: string;
      characters: { character: string; class: string; gold: number }[];
    }[];
    assert.equal(accounts[0]?.account, "111111");
    assert.equal(accounts[0]?.characters[0]?.character, "Mira");
    assert.equal(accounts[0]?.characters[0]?.gold, 18342);

    const catalog = await mcpCall(app, "data_catalog", {});
    const explorer = catalog.value.accounts as {
      sections: { name: string; unknown: boolean; bytes: number }[];
      dropped: unknown;
      characters: { sections: { name: string; counts?: Record<string, number> }[] }[];
    }[];
    const futureThing = explorer[0]?.sections.find((s) => s.name === "futureThing");
    assert.equal(futureThing?.unknown, true);
    assert.ok(explorer[0]?.dropped, "dropped Sections are listed");
    const questsDone = explorer[0]?.characters[0]?.sections.find((s) => s.name === "questsDone");
    assert.equal(questsDone?.counts?.ids, quests.length);

    const unresolved = withSection(
      "unresolvedIds",
      {
        list: [
          { kind: "advice", id: 1, at: 1 },
          { kind: "advice", id: 2, at: 1 },
          { kind: "quest", id: 3, at: 1 },
        ],
      },
      fixture.savedAt + 120,
    );
    unresolved.sections.unresolvedIds = {
      ...fixture.sections.questsDone,
      body: unresolved.sections.unresolvedIds.body,
      hash: unresolved.sections.unresolvedIds.hash,
    };
    await post(app, unresolved);
    const byKind = (await mcpCall(app, "data_catalog", {})).value.accounts as typeof explorer;
    const ids = byKind[0]?.characters[0]?.sections.find((s) => s.name === "unresolvedIds") as
      | { byKind?: Record<string, number> }
      | undefined;
    assert.deepEqual(ids?.byKind, { advice: 2, quest: 1 }, "unresolved ids are counted per kind");
    const catalogNow = await mcpCall(app, "data_catalog", {});

    assert.equal((await app.request("/owner/data")).status, 401);
    const denied = await app.request("/owner/data", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(denied.status, 401);
    const owner = await app.request("/owner/data", {
      headers: { authorization: `Bearer ${planner}` },
    });
    assert.equal(owner.status, 200);
    assert.deepEqual(await json(owner), catalogNow.value);
  } finally {
    close();
  }
});

test("GET /v1/advice carries the Account holdings index", async () => {
  const { app, close } = build();
  try {
    await post(app, fixture);
    const alt = withSection(
      "bags",
      { slots: 20, count: 1, items: ["idv1", "5d0:14"] },
      fixture.savedAt,
    );
    alt.character = "Grubbyman";
    await post(app, alt);
    const response = await app.request("/v1/advice", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(response.status, 200);
    const holdings = (await json(response)).holdings as {
      places: string[];
      items: Record<string, string>;
    };
    assert.deepEqual(
      holdings.places,
      ["Grubbyman-Silvermoon", "Mira-Silvermoon"],
      "the fixture's Warband bank was read over 60 days ago, so it is left out",
    );
    assert.equal(holdings.items["6948"], "1:40,2:1", "both bags, largest first");
  } finally {
    close();
  }
});

test("the 0.6 profile view is built from Sections", async () => {
  const { app, close } = build();
  try {
    await post(app, fixture);
    const profile = await mcpCall(app, "get_player_profile", { character: "Mira" });
    assert.equal(profile.isError, false, JSON.stringify(profile.value));
    const body = (
      profile.value.profile as { profile: { bags: { itemID: number; count: number }[] } }
    ).profile;
    assert.ok(body.bags.some((bag) => bag.itemID === 6948 && bag.count === 1));
  } finally {
    close();
  }
});

test("delete_account_data erases one Account and needs confirm", async () => {
  const { app, close } = build();
  try {
    await post(app, fixture);
    const refused = await mcpCall(app, "delete_account_data", { account: "111111" });
    assert.equal(refused.isError, true);
    const deleted = await mcpCall(app, "delete_account_data", {
      account: "111111#1",
      confirm: true,
    });
    assert.equal(deleted.isError, false, JSON.stringify(deleted.value));
    const catalog = await mcpCall(app, "data_catalog", {});
    assert.deepEqual(catalog.value.accounts, []);
    assert.equal((await mcpCall(app, "get_game_data", { character: "Mira" })).isError, true);
  } finally {
    close();
  }
});

// SQLite file migrations; Postgres starts from migrations/0001.
test.skipIf(onPostgres)("0.6 profiles are moved into Sections once", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-backfill-"));
  const legacy = new DatabaseSync(sqlitePath(dataDir));
  legacy.exec(`
    CREATE TABLE profiles (
      character_name TEXT NOT NULL, realm TEXT NOT NULL, device_id TEXT NOT NULL,
      saved_at INTEGER, updated_at INTEGER NOT NULL, body_json TEXT NOT NULL,
      account TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (character_name, realm)
    );
    CREATE TABLE profile_snapshots (
      id INTEGER PRIMARY KEY, at INTEGER NOT NULL, account TEXT NOT NULL DEFAULT '',
      character_name TEXT NOT NULL, realm TEXT NOT NULL, saved_at INTEGER, body_json TEXT NOT NULL
    );
  `);
  const older = { v: 1, context: { level: 79, gold: 10 } };
  const newer = { v: 1, context: { level: 80, gold: 20 } };
  legacy
    .prepare(
      `INSERT INTO profile_snapshots (at, account, character_name, realm, saved_at, body_json) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(100, "222#1", "Old", "Area 52", 100, JSON.stringify(older));
  legacy
    .prepare(`INSERT INTO profiles VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("Old", "Area 52", "legacy", 200, 200, JSON.stringify(newer), "222#1");
  legacy.close();

  const count = async (store: ReturnType<typeof build>["store"]) =>
    (await store.data.history({ owners: [{ kind: "char", id: "Area 52/Old" }], limit: 50 })).length;
  const first = build(dataDir);
  try {
    const row = await first.store.data.character("Old", "Area 52");
    assert.equal(row?.accountId, "222");
    const context = (await first.store.data.section("char", "Area 52/Old", "profile"))?.body
      .context as {
      level: number;
    };
    assert.equal(context.level, 80);
    assert.equal(await count(first.store), 2, "both 0.6 rows became history");
  } finally {
    first.close();
  }
  const second = build(dataDir);
  try {
    assert.equal(await count(second.store), 2, "a second start does not backfill again");
  } finally {
    second.close();
  }
});

test("advice carries the Account digest: each character's Alts with faction and professions", async () => {
  const { app, close } = build();
  try {
    assert.equal((await post(app, fixture)).status, 200);
    const alt = structuredClone(fixture);
    alt.character = "Brew";
    alt.savedAt = fixture.savedAt + 10;
    const professions = {
      list: [{ skillLine: 171, name: "Alchemy", skill: 75, max: 100 }],
    };
    alt.sections = {
      char: {
        ...fixture.sections.char,
        body: { ...fixture.sections.char.body, name: "Brew", faction: "Horde" },
      },
      professions: { ...fixture.sections.char, body: professions, hash: sectionHash(professions) },
    };
    alt.sections.char.hash = sectionHash(alt.sections.char.body);
    assert.equal((await post(app, alt)).status, 200);
    const response = await app.request("/v1/advice", {
      headers: { authorization: `Bearer ${companion}` },
    });
    const body = (await json(response)) as {
      characters: { character: string; items: unknown[]; alts: Record<string, unknown>[] }[];
    };
    const mira = body.characters.find((row) => row.character === "Mira");
    assert.ok(mira, JSON.stringify(body));
    assert.deepEqual(mira.items, []);
    assert.equal(mira.alts.length, 1);
    assert.equal(mira.alts[0].name, "Brew");
    assert.equal(mira.alts[0].faction, "Horde");
    assert.deepEqual(mira.alts[0].professions, [{ skillLine: 171, name: "Alchemy", skill: 75 }]);
    const brew = body.characters.find((row) => row.character === "Brew");
    assert.deepEqual(
      brew?.alts.map((row) => row.name),
      ["Mira"],
    );
  } finally {
    close();
  }
});
