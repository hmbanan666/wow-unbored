import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { ContentError, ContentStore, parseContent } from "../src/content.ts";
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
