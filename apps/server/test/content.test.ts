import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { ContentError, ContentStore, contentItemOutcome, parseContent } from "../src/content.ts";
import { Store } from "../src/store.ts";
import { coreResponse } from "./game-content-fixture.ts";
import { hasPostgres, postgresPerFile } from "./postgres-db.ts";

const pg = postgresPerFile();

const collection = {
  kind: "collection",
  slug: "top-mounts-to-get-first",
  title: "Top mounts to get first",
  description: "Mounts worth getting early, each with a guaranteed way to get it.",
  blocks: [{ type: "paragraph", text: "Start here." }],
  items: [
    {
      kind: "mount",
      id: 6,
      name: "Brown Horse",
      source: {
        type: "vendor",
        text: "Vendor in Stormwind City",
        zone: 84,
        cost: [
          { amount: 1, gold: true },
          { amount: 5, currency: 2000 },
        ],
      },
      chance: false,
      note: "Cheap and quick.",
    },
    {
      kind: "achievement",
      id: 964,
      name: "Going Down?",
      source: { type: "achievement", text: "Fall a long way" },
      chance: false,
      note: "Jump.",
    },
  ],
};

function problems(error: unknown): string[] {
  assert.ok(error instanceof ContentError);
  return error.problems;
}

test("content documents need a slug, items with sources and a note", () => {
  assert.throws(
    () => parseContent({ ...collection, slug: "Top Mounts", items: [{ kind: "npc", id: 1 }] }),
    (error) => {
      const list = problems(error);
      assert.ok(list.some((line) => line.startsWith("slug")));
      assert.ok(list.some((line) => line.includes("items[0].kind")));
      assert.ok(list.some((line) => line.includes("items[0].note")));
      return true;
    },
  );
  assert.throws(() => parseContent({ ...collection, tier: "basic" }), ContentError);
  assert.throws(
    () => parseContent({ ...collection, items: [collection.items[0], collection.items[0]] }),
    (error) => problems(error).some((line) => line.includes("repeats mount:6")),
  );
  assert.equal(parseContent(collection).items[0].source.cost?.length, 2);
});

test("a guide is an article of headings and paragraphs with optional items", () => {
  const guide = parseContent({
    kind: "guide",
    slug: "first-steps",
    title: "First steps",
    description: "Where to start.",
    blocks: [
      { type: "heading", text: "Start here" },
      { type: "paragraph", text: "One step at a time." },
      { type: "link", label: "Mounts", href: "/collections/top-mounts-to-get-first" },
      { type: "link", label: "All guides", href: "/guides" },
    ],
  });
  assert.equal(guide.kind, "guide");
  assert.deepEqual(guide.blocks[0], { type: "heading", text: "Start here" });
  assert.equal(guide.items.length, 0);
  assert.throws(
    () => parseContent({ ...collection, kind: "guide", tier: "basic" }),
    (error) => problems(error).includes("a guide has no tier"),
  );
});

test("the owner content route needs the planner bearer and Postgres", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-content-"));
  const { app, close } = createApp({
    companionToken: "c",
    plannerToken: "p",
    dataDir,
    log: () => {},
  });
  try {
    const open = await app.request("/owner/content", { method: "PUT", body: "{}" });
    assert.equal(open.status, 401);
    const sqlite = await app.request("/owner/content", {
      method: "PUT",
      headers: { authorization: "Bearer p" },
      body: JSON.stringify(collection),
    });
    assert.equal(sqlite.status, 503);
  } finally {
    close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test.skipIf(!hasPostgres)(
  "drafts are checked against the Game DB, published once, versioned",
  async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "unbored-content-"));
    const sql = pg("postgres")!;
    await sql`DELETE FROM content.paths`;
    const store = new Store(dir, { postgres: sql });
    let clock = 1_800_000_000;
    const content = new ContentStore(store.db, store.game, () => clock++);
    try {
      await store.game.importBuild("12.0.1.66337", coreResponse);

      const fake = structuredClone(collection);
      fake.items[0].id = 999999;
      await assert.rejects(content.saveDraft(fake), (error) =>
        problems(error).some((line) => line.includes("mount:999999 is not in build")),
      );
      const renamed = structuredClone(collection);
      renamed.items[0].name = "Grey Horse";
      await assert.rejects(content.saveDraft(renamed), (error) =>
        problems(error).some((line) => line.includes('calls mount:6 "Brown Horse"')),
      );
      const badCost = structuredClone(collection);
      badCost.items[0].source.cost = [{ amount: 5, currency: 4444 }];
      await assert.rejects(content.saveDraft(badCost), (error) =>
        problems(error).some((line) => line.includes("currency:4444")),
      );

      const first = await content.saveDraft(collection);
      assert.deepEqual(
        [first.version, first.status, first.unchanged, first.items],
        [1, "draft", false, 2],
      );
      assert.equal((await content.saveDraft(collection)).unchanged, true);

      const published = await content.publish("collection", collection.slug);
      assert.deepEqual([published.version, published.status], [1, "published"]);
      assert.equal((await content.publish("collection", collection.slug)).unchanged, true);
      assert.equal((await content.saveDraft(collection)).unchanged, true);

      const edited = { ...collection, title: "Top mounts to get first in 2026" };
      const second = await content.saveDraft(edited);
      assert.deepEqual([second.version, second.status], [2, "draft"]);
      const again = await content.saveDraft({ ...edited, description: "Changed again." });
      assert.equal(again.version, 2);
      await content.publish("collection", collection.slug);

      const rows = await sql<{ version: number; status: string; title: string }[]>`
      SELECT version, status, title FROM content.paths
      WHERE slug = ${collection.slug} ORDER BY version`;
      assert.deepEqual(
        rows.map((row) => [row.version, row.status]),
        [
          [1, "retired"],
          [2, "published"],
        ],
      );
      const [live] = await sql<{ body: { items: unknown[]; build: string } }[]>`
      SELECT body FROM content.paths WHERE slug = ${collection.slug} AND status = 'published'`;
      assert.equal(live.body.items.length, 2);
      assert.equal(live.body.build, "12.0.1.66337");
    } finally {
      store.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("Path Topics and required goals survive parsing in authored order", () => {
  const doc = parseContent({
    ...collection,
    kind: "path",
    tier: "basic",
    topics: [{ slug: "adventure", title: "Adventure" }],
    items: [
      {
        ...collection.items[0],
        kind: "quest",
        id: 90001,
        name: "A small adventure",
        topic: "adventure",
        required: false,
      },
      {
        ...collection.items[1],
        kind: "questLine",
        id: 10,
        name: "A new beginning",
        topic: "adventure",
      },
    ],
  });
  assert.deepEqual(doc.topics, [{ slug: "adventure", title: "Adventure" }]);
  assert.deepEqual(
    doc.items.map((item) => [item.kind, item.id, item.topic, item.required]),
    [
      ["quest", 90001, "adventure", false],
      ["questLine", 10, "adventure", true],
    ],
  );
});

test.skipIf(!hasPostgres)(
  "owner reads retain Path versions and recheck quest ids before publishing",
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".content-path-"));
    const sql = pg("postgres")!;
    await sql`DELETE FROM content.paths`;
    const store = new Store(dir, { postgres: sql });
    const content = new ContentStore(store.db, store.game);
    const doc = {
      ...collection,
      kind: "path",
      slug: "first-adventure",
      tier: "basic",
      topics: [{ slug: "quests", title: "Quests" }],
      items: [
        {
          ...collection.items[0],
          kind: "questLine",
          id: 10,
          name: "A new beginning",
          topic: "quests",
          required: false,
        },
      ],
    };
    try {
      await store.game.importBuild("12.0.1.66337", coreResponse);
      await content.saveDraft(doc);
      const draft = await content.read("path", doc.slug);
      assert.equal(draft?.status, "draft");
      assert.deepEqual(draft?.document.topics, [{ slug: "quests", title: "Quests" }]);
      assert.equal(draft?.document.items[0].required, false);
      await content.publish("path", doc.slug);
      const original = await content.read("path", doc.slug, "en", 1);
      await content.saveDraft({
        ...doc,
        title: "More adventures",
        topics: [],
        items: collection.items,
      });
      assert.deepEqual(await content.read("path", doc.slug, "en", 1), original);
      await content.publish("path", doc.slug);
      const retired = await content.read("path", doc.slug, "en", 1);
      assert.equal(retired?.status, "retired");
      assert.deepEqual(retired?.document, original?.document);
      assert.equal((await content.read("path", doc.slug))?.document.title, "More adventures");
      assert.equal(await content.read("path", doc.slug, "en", 99), null);

      await assert.rejects(
        content.saveDraft({ ...doc, items: [{ ...doc.items[0], id: 999999 }] }),
        (error) => problems(error).some((p) => p.includes("questLine:999999")),
      );
      await content.saveDraft(doc);
      await store.game.importBuild("12.0.1.66338", async (input) => {
        const response = await coreResponse(input);
        const csv = await response.text();
        return new Response(
          new URL(String(input)).pathname.includes("/QuestLine/")
            ? "ID,Name_lang\n20,Another adventure\n"
            : csv,
        );
      });
      await assert.rejects(content.publish("path", doc.slug), (error) =>
        problems(error).some((p) => p.includes("questLine:10")),
      );
      assert.equal((await content.read("path", doc.slug))?.status, "draft");
      assert.equal((await content.read("path", doc.slug, "en", 2))?.status, "published");
    } finally {
      store.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("Path goals carry outcome thresholds and chance goals can never supply a Plan outcome", () => {
  const doc = parseContent({
    ...collection,
    kind: "path",
    tier: "basic",
    items: [
      { ...collection.items[0], kind: "rep", id: 72, name: "Stormwind", standing: 8 },
      { ...collection.items[0], kind: "renown", id: 72, name: "Stormwind", level: 10 },
      { ...collection.items[0], kind: "level", id: undefined, name: "Level 80", level: 80 },
      { ...collection.items[0], kind: "currency", id: 2000, name: "Test currency", amount: 50 },
      { ...collection.items[0], chance: true },
      collection.items[1],
    ],
  });
  assert.deepEqual(doc.items.map(contentItemOutcome), [
    { kind: "rep", factionID: 72, standing: 8 },
    { kind: "renown", factionID: 72, level: 10 },
    { kind: "level", level: 80 },
    { kind: "currency", currencyID: 2000, amount: 50 },
    undefined,
    { kind: "achievement", achievementID: 964 },
  ]);
  for (const item of doc.items) {
    assert.equal(contentItemOutcome({ ...item, chance: true }), undefined);
  }
  assert.throws(() => parseContent({ ...collection, items: [doc.items[0]] }), ContentError);
  for (const item of [
    { ...doc.items[0], standing: 9 },
    { ...doc.items[1], level: 0 },
    { ...doc.items[2], id: 80 },
    { ...doc.items[3], amount: undefined, chance: true },
  ])
    assert.throws(
      () => parseContent({ ...collection, kind: "path", tier: "basic", items: [item] }),
      ContentError,
    );
});

test.skipIf(!hasPostgres)(
  "owner MCP tools save, edit, read and publish through the content checks",
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".content-mcp-"));
    const sql = pg("postgres")!;
    await sql`DELETE FROM content.paths`;
    const server = createApp({
      dataDir: dir,
      database: sql,
      companionToken: "c",
      plannerToken: "p",
      log: () => {},
    });
    const rpc = async (method: string, params: unknown, token = "p") =>
      server.app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    const call = async (name: string, args: unknown, error = false) => {
      const response = await rpc("tools/call", { name, arguments: args });
      const body = await response.json();
      assert.ok(!body.error, JSON.stringify(body));
      assert.equal(body.result.isError, error, JSON.stringify(body));
      return JSON.parse(body.result.content[0].text);
    };
    try {
      await server.store.game.importBuild("12.0.1.66337", coreResponse);
      const listed = await (await rpc("tools/list", {})).json();
      for (const name of ["save_content_draft", "publish_content", "get_content"])
        assert.ok(listed.result.tools.some((tool: { name: string }) => tool.name === name));
      assert.equal((await rpc("tools/list", {}, "c")).status, 401);
      const fake = await call(
        "save_content_draft",
        { document: { ...collection, items: [{ ...collection.items[0], id: 999999 }] } },
        true,
      );
      assert.ok(fake.problems.some((p: string) => p.includes("mount:999999")));
      const key = { kind: "collection", slug: collection.slug };
      assert.equal(await call("get_content", key), null);
      assert.equal((await call("save_content_draft", { document: collection })).version, 1);
      assert.equal((await call("get_content", key)).status, "draft");
      assert.equal(
        (await call("save_content_draft", { document: { ...collection, title: "First mounts" } }))
          .version,
        1,
      );
      assert.equal((await call("publish_content", key)).status, "published");
      const original = await call("get_content", { ...key, version: 1 });
      assert.equal(original.document.title, "First mounts");
      assert.equal((await call("save_content_draft", { document: collection })).version, 2);
      assert.deepEqual(await call("get_content", { ...key, version: 1 }), original);
    } finally {
      await server.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("Paths require a tier, goals and valid Topic references", () => {
  const basic = { ...collection, kind: "path", tier: "basic" };
  for (const invalid of [
    { ...basic, tier: undefined },
    { ...basic, items: [] },
    { ...basic, items: {} },
    { ...basic, tier: "deeper" },
    { ...basic, tier: "complete" },
    { ...basic, prerequisite: "earlier" },
    { ...basic, tier: "deeper", prerequisite: basic.slug },
    {
      ...basic,
      topics: [
        { slug: "mounts", title: "Mounts" },
        { slug: "mounts", title: "Again" },
      ],
    },
    { ...basic, items: [{ ...basic.items[0], topic: "missing" }] },
    { ...basic, items: [{ ...basic.items[0], required: "yes" }] },
  ])
    assert.throws(() => parseContent(invalid), ContentError);
});

test.skipIf(!hasPostgres)(
  "a deeper Path requires a published preceding tier in the same locale",
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".content-tiers-"));
    const sql = pg("postgres")!;
    await sql`DELETE FROM content.paths`;
    const store = new Store(dir, { postgres: sql });
    const content = new ContentStore(store.db, store.game);
    const basic = { ...collection, kind: "path", tier: "basic", slug: "adventure-basic" };
    const deeper = { ...basic, tier: "deeper", slug: "adventure-deeper", prerequisite: basic.slug };
    try {
      await store.game.importBuild("12.0.1.66337", coreResponse);
      await assert.rejects(content.saveDraft(deeper), ContentError);
      await content.saveDraft(basic);
      await assert.rejects(content.saveDraft(deeper), ContentError);
      await content.publish("path", basic.slug);
      await content.saveDraft(deeper);
      await assert.rejects(content.saveDraft({ ...deeper, locale: "ru" }), ContentError);
      await assert.rejects(content.saveDraft({ ...deeper, tier: "complete" }), ContentError);
      await content.publish("path", deeper.slug);
      await content.saveDraft({
        ...deeper,
        tier: "complete",
        slug: "adventure-complete",
        prerequisite: deeper.slug,
      });
      assert.equal(
        (await content.read("path", "adventure-complete"))?.document.prerequisite,
        deeper.slug,
      );
    } finally {
      store.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(!hasPostgres)(
  "every new Path goal kind checks its target and sources against the current build",
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".content-ids-"));
    const sql = pg("postgres")!;
    await sql`DELETE FROM content.paths`;
    const store = new Store(dir, { postgres: sql });
    const content = new ContentStore(store.db, store.game);
    const goals = [
      { kind: "rep", id: 72, name: "Stormwind", standing: 8 },
      { kind: "renown", id: 72, name: "Stormwind", level: 10 },
      { kind: "currency", id: 2000, name: "Test currency", amount: 50 },
      { kind: "quest", id: 90001, name: "A small adventure" },
      { kind: "questLine", id: 10, name: "A new beginning" },
      { kind: "level", id: undefined, name: "Level 80", level: 80 },
    ];
    const document = (goal: object) => ({
      ...collection,
      kind: "path",
      tier: "basic",
      items: [{ ...collection.items[0], ...goal }],
    });
    try {
      await store.game.importBuild("12.0.1.66337", coreResponse);
      for (const goal of goals) {
        await content.saveDraft(document(goal));
        await content.publish("path", collection.slug);
        if (goal.kind !== "level") {
          await assert.rejects(content.saveDraft(document({ ...goal, id: 999999 })), (error) =>
            problems(error).some((p) => p.includes(":999999 is not in build")),
          );
          await assert.rejects(
            content.saveDraft(document({ ...goal, name: "Invented name" })),
            (error) => problems(error).some((p) => p.includes("the game calls")),
          );
        }
        await assert.rejects(
          content.saveDraft(
            document({ ...goal, source: { type: "quest", text: "Quest", zone: 999999 } }),
          ),
          (error) => problems(error).some((p) => p.includes("zone:999999")),
        );
      }
    } finally {
      store.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
