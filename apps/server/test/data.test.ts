import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { test } from "vite-plus/test";

import { packIds, sectionHash, unpackIds, unpackRows } from "@unbored/contracts";

import { createApp } from "../src/app.ts";
import { sqlitePath } from "../src/config.ts";

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
  return createApp({ companionToken: companion, plannerToken: planner, dataDir, log: () => {} });
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

    assert.equal((await app.request("/owner/data")).status, 401);
    const denied = await app.request("/owner/data", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(denied.status, 401);
    const owner = await app.request("/owner/data", {
      headers: { authorization: `Bearer ${planner}` },
    });
    assert.equal(owner.status, 200);
    assert.deepEqual(await json(owner), catalog.value);
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

test("0.6 profiles are moved into Sections once", () => {
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

  const count = (store: ReturnType<typeof build>["store"]) =>
    store.data.history({ owners: [{ kind: "char", id: "Area 52/Old" }], limit: 50 }).length;
  const first = build(dataDir);
  try {
    const row = first.store.data.character("Old", "Area 52");
    assert.equal(row?.accountId, "222");
    const context = first.store.data.section("char", "Area 52/Old", "profile")?.body.context as {
      level: number;
    };
    assert.equal(context.level, 80);
    assert.equal(count(first.store), 2, "both 0.6 rows became history");
  } finally {
    first.close();
  }
  const second = build(dataDir);
  try {
    assert.equal(count(second.store), 2, "a second start does not backfill again");
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
