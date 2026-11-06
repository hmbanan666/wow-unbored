import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
    let queued = 0;
    const content = new ContentStore(
      store.db,
      store.game,
      () => clock++,
      undefined,
      () => {
        assert.equal(store.db.inTx, false);
        queued++;
        throw new Error("Media queue unavailable");
      },
    );
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
      assert.equal(queued, 1, "publication survives a failed media queue after commit");
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

test.skipIf(!hasPostgres)(
  "saving an unchanged publication from before Path fields is still a no-op",
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".content-legacy-"));
    const sql = pg("postgres")!;
    const store = new Store(dir, { postgres: sql });
    const content = new ContentStore(store.db, store.game);
    // A pre-existing publication in the format written before Topics and required flags.
    const fields = {
      title: collection.title,
      description: collection.description,
      tier: null,
      prerequisite: null,
      blocks: collection.blocks,
      items: collection.items,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(["collection", collection.slug, "en", fields]))
      .digest("hex");
    try {
      await sql`DELETE FROM content.paths`;
      await sql`INSERT INTO content.paths (kind, slug, locale, title, description, version, status, body, updated_at)
      VALUES ('collection', ${collection.slug}, 'en', ${collection.title}, ${collection.description}, 1, 'published',
        ${sql.json({ blocks: collection.blocks, items: collection.items, hash, build: "12.0.1.66337" })}, 1)`;
      await store.game.importBuild("12.0.1.66337", coreResponse);
      const original = await content.read("collection", collection.slug);
      assert.equal((await content.saveDraft(collection)).unchanged, true);
      assert.deepEqual(await content.read("collection", collection.slug), original);
    } finally {
      store.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("content preserves optional media, hero, figures and bounded inline references", () => {
  const hero = { image: "0123456789abcdef", alt: "Our screenshot" };
  const figure = { type: "figure", ref: { kind: "mount", id: 6 }, alt: "Brown Horse" };
  const doc = parseContent({
    ...collection,
    hero,
    blocks: [figure, { type: "paragraph", text: "Try [[mount:6]]." }],
    items: [{ ...collection.items[0], media: { icon: 123, display: 456 } }],
  });
  assert.deepEqual(doc.hero, hero);
  assert.deepEqual(doc.blocks[0], figure);
  assert.deepEqual(doc.items[0].media, { icon: 123, display: 456 });
  for (const hero of [
    { kind: "item", id: 1 },
    { image: "../bad", alt: "x" },
    { image: "0123456789abcdef" },
    { kind: "mount", id: 0 },
    { kind: "mount", id: 1, image: "0123456789abcdef", alt: "x" },
  ]) {
    assert.throws(() => parseContent({ ...collection, hero }), ContentError);
  }
  for (const media of [{ icon: 0 }, { display: 1.5 }, null, "bad"]) {
    assert.throws(
      () => parseContent({ ...collection, items: [{ ...collection.items[0], media }] }),
      ContentError,
    );
  }
  for (const block of [
    { ...figure, image: "0123456789abcdef" },
    { type: "figure", alt: "x" },
    { ...figure, alt: "" },
  ]) {
    assert.throws(() => parseContent({ ...collection, blocks: [block] }), ContentError);
  }
  for (const text of [
    "[[npc:1]]",
    "[[[mount:1]]]",
    "[[mount:1]]]",
    "[[mount:0]]",
    "[[mount:1]",
    "mount:1]]",
    "[[mount:1]]".repeat(21),
  ]) {
    assert.throws(
      () => parseContent({ ...collection, blocks: [{ type: "paragraph", text }] }),
      ContentError,
    );
  }
  assert.equal(parseContent(collection).hero, undefined);
});

const forever = {
  kind: "guide",
  game: "forever",
  slug: "forever-first-steps",
  title: "First steps in WoW Forever",
  description: "Where to start.",
  blocks: [
    { type: "callout", tone: "forecast", text: "Rankings are early forecasts." },
    { type: "link", label: "WoW Forever", href: "/forever" },
  ],
  sources: [{ label: "Launch notes", url: "https://example.com/launch", accessed: "2026-11-05" }],
  asOf: { date: "2026-11-05", build: "1.60.1.x", note: "Launch build." },
};

test("Forever guides preserve sources, build checks and callouts", () => {
  const doc = parseContent(forever);
  assert.equal(doc.game, "forever");
  assert.deepEqual(doc.sources, forever.sources);
  assert.deepEqual(doc.asOf, forever.asOf);
  assert.deepEqual(doc.blocks, forever.blocks);
  assert.equal(parseContent(collection).game, "retail");
});

test("Forever accepts own-image heroes and figures", () => {
  const hero = { image: "0123456789abcdef", alt: "Our Forever screenshot" };
  const blocks = [{ type: "figure", image: "fedcba9876543210", alt: "Our view" }];
  const doc = parseContent({ ...forever, hero, blocks });
  assert.deepEqual(doc.hero, hero);
  assert.deepEqual(doc.blocks, blocks);
});

test("Forever rejects retail items, inline references and Blizzard images", () => {
  for (const fields of [
    { kind: "collection" },
    { kind: "path", tier: "basic" },
    { game: "classic" },
    { game: null },
    { items: collection.items },
    { items: {} },
    { hero: { kind: "mount", id: 6 } },
    { hero: { kind: "pet", id: 1 } },
    { hero: { kind: "instance", id: 1 } },
    { hero: { image: "invalid", alt: "Screenshot" } },
    { hero: { image: "0123456789abcdef" } },
    { blocks: [{ type: "figure", ref: { kind: "mount", id: 6 }, alt: "Horse" }] },
    { blocks: [{ type: "figure", image: "invalid", alt: "Screenshot" }] },
    ...["paragraph", "heading", "callout"].map((type) => ({
      blocks: [{ type, tone: "note", text: "Try [[mount:6]]." }],
    })),
    { blocks: [{ type: "list", items: ["Try [[item:1]]."] }] },
    { blocks: [{ type: "link", label: "[[pet:1]]", href: "/forever" }] },
  ])
    assert.throws(
      () => parseContent({ ...forever, ...fields }),
      ContentError,
      JSON.stringify(fields),
    );
});

test.skipIf(!hasPostgres)(
  "Forever publishes own images without queuing Blizzard media",
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".forever-images-"));
    const sql = pg("postgres")!;
    const store = new Store(dir, { postgres: sql });
    let queued = 0;
    const content = new ContentStore(store.db, store.game, undefined, undefined, () => queued++);
    const hero = { image: "0123456789abcdef", alt: "Our Forever screenshot" };
    const blocks = [{ type: "figure", image: "fedcba9876543210", alt: "Our view" }];
    try {
      await content.saveDraft({ ...forever, hero, blocks });
      const published = await content.publish("guide", forever.slug);
      assert.equal(published.status, "published");
      assert.equal(published.build, null);
      assert.equal(queued, 0);
      const saved = await content.read("guide", forever.slug);
      assert.deepEqual(saved?.document.hero, hero);
      assert.deepEqual(saved?.document.blocks, blocks);
    } finally {
      store.close();
      await sql`DELETE FROM content.paths WHERE slug = ${forever.slug}`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("guide evidence and callouts have bounded fields and real calendar dates for both games", () => {
  for (const game of ["retail", "forever"]) {
    assert.deepEqual(parseContent({ ...forever, game }).sources, forever.sources);
    for (const fields of [
      { sources: Array(21).fill(forever.sources[0]) },
      ...[
        { label: "x".repeat(121) },
        { url: "http://example.com" },
        { url: "/relative" },
        { url: "https:relative" },
        { accessed: "2026-02-30" },
      ].map((source) => ({ sources: [{ ...forever.sources[0], ...source }] })),
      ...[{ date: "2026-13-01" }, { build: "x".repeat(61) }, { note: "x".repeat(201) }].map(
        (asOf) => ({ asOf: { ...forever.asOf, ...asOf } }),
      ),
      { blocks: [{ type: "callout", tone: "warning", text: "Note" }] },
      { blocks: [{ type: "callout", tone: "note", text: "x".repeat(601) }] },
    ])
      assert.throws(() => parseContent({ ...forever, game, ...fields }), ContentError);
  }
});

test.skipIf(!hasPostgres)(
  "Forever saves and publishes through owner HTTP and MCP without a Game DB",
  async () => {
    const authored = {
      ...forever,
      terms: [
        {
          key: "camp",
          name: "Camp",
          text: "A place to rest.",
          source: forever.sources[0].url,
          kind: "spell",
          id: 123,
        },
      ],
      blocks: [...forever.blocks, { type: "paragraph", text: "Use the {{term:camp|camp}}." }],
    };
    const dir = mkdtempSync(path.join(import.meta.dirname, ".forever-"));
    const sql = pg("postgres")!;
    const server = createApp({
      dataDir: dir,
      database: sql,
      companionToken: "c",
      plannerToken: "p",
      log: () => {},
    });
    const call = async (name: string, args: unknown) => {
      const response = await server.app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer p",
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
      const body = await response.json();
      assert.equal(body.result.isError, false, JSON.stringify(body));
      return JSON.parse(body.result.content[0].text);
    };
    try {
      const response = await server.app.request("/owner/content", {
        method: "PUT",
        headers: { authorization: "Bearer p" },
        body: JSON.stringify(authored),
      });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await response.json()).build, null);
      const key = { kind: "guide", slug: forever.slug };
      assert.equal((await call("publish_content", key)).status, "published");
      const original = await call("get_content", key);
      assert.equal(original.document.game, "forever");
      assert.deepEqual(original.document.sources, forever.sources);
      assert.deepEqual(original.document.terms, authored.terms);
      assert.deepEqual(original.document.asOf, forever.asOf);
      assert.equal((await call("save_content_draft", { document: authored })).unchanged, true);
      const changed = { ...authored, asOf: { ...forever.asOf, build: "1.60.1.2" } };
      assert.equal((await call("save_content_draft", { document: changed })).version, 2);
      assert.equal((await call("publish_content", key)).build, null);
      assert.deepEqual(
        (await call("get_content", { ...key, version: 1 })).document,
        original.document,
      );
      assert.equal((await call("get_content", key)).document.asOf.build, "1.60.1.2");
      const retail = await server.app.request("/owner/content", {
        method: "PUT",
        headers: { authorization: "Bearer p" },
        body: JSON.stringify({ ...authored, game: "retail" }),
      });
      assert.equal(retail.status, 400);
    } finally {
      await server.close();
      await sql`DELETE FROM content.paths`;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
