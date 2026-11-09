import { expect, test } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { parseContent, ContentStore } from "../../server/src/content.ts";
import {
  guidesFromMigration,
  validateGuide,
  validateGuideBundle,
} from "../../server/src/guide-editorial.ts";
import { Store } from "../../server/src/store.ts";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db.ts";
import { readPublished, listPublished } from "../server/utils/content.ts";

const sqlText = readFileSync(
  new URL("../../server/migrations/0023_forever_editorial.sql", import.meta.url),
  "utf8",
);
const raw = guidesFromMigration(sqlText) as Record<string, unknown>[];
const docs = validateGuideBundle(raw);

test("all five replacements have evidence, safe terms and resolvable public next steps", () => {
  expect(docs).toHaveLength(5);
  expect(new Set(docs.map((d) => d.slug))).toEqual(
    new Set([
      "best-solo-class-wow-forever",
      "best-leveling-class-wow-forever",
      "wow-forever-enchanting-guide",
      "how-to-make-gold-early-in-wow-forever",
      "wow-forever-beginners-guide",
    ]),
  );
  for (const doc of docs) {
    expect(doc.game).toBe("forever");
    expect(doc.terms!.length).toBeGreaterThan(0);
    expect(doc.items).toEqual([]);
  }
});

test("editorial validation rejects missing evidence, unsafe links and broken or misplaced terms", () => {
  const doc = docs[0]!;
  const term = doc.terms![0]!;
  for (const patch of [
    { sources: [] },
    { asOf: undefined },
    { sources: [{ ...doc.sources![0], accessed: "2099-01-01" }] },
    { title: "{{term:life-tap|A title}}" },
    { blocks: [{ type: "paragraph", text: "{{term:missing|Missing}}" }] },
    { blocks: [{ type: "heading", text: "{{term:life-tap|Life Tap}}" }] },
    { terms: [{ ...term, source: "javascript:alert(1)" }] },
    { terms: [{ ...term, icon: "https://wowhead.com/icon.jpg" }] },
    { terms: [{ ...term, source: "https://example.com/not-in-sources" }] },
    { terms: [term, term] },
    { blocks: [{ type: "link", label: "Unsafe", href: "//example.com" }] },
    { blocks: [{ type: "paragraph", text: "{{term:life-tap|broken}" }] },
  ])
    expect(() => validateGuide({ ...doc, ...patch })).toThrow();
  expect(() =>
    validateGuideBundle([
      {
        ...doc,
        blocks: [
          ...doc.blocks,
          { type: "link", label: "Missing", href: "/guides/not-in-this-bundle" },
        ],
      },
    ]),
  ).toThrow();
  expect(() =>
    parseContent({ ...doc, blocks: [...doc.blocks, { type: "paragraph", text: "[[item:1]]" }] }),
  ).toThrow();
});

test.skipIf(!hasPostgres)(
  "migration preserves history, publishes valid pages and is safe to replay",
  async () => {
    const db = await testDatabase();
    const dir = mkdtempSync(fileURLToPath(new URL(".editorial-", import.meta.url)));
    const store = new Store(dir, { postgres: db.sql });
    const content = new ContentStore(store.db, store.game);
    try {
      // The ordinary schema migration leaves absent guides alone.
      expect(await listPublished(db.sql, "guide", "forever")).toEqual([]);
      for (const doc of raw) {
        await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at,published_at)
        VALUES ('forever','guide',${String(doc.slug)},'en',${String(doc.previousTitle)},'Original description',1,'published',
          ${JSON.stringify({ blocks: [{ type: "paragraph", text: "Original publication" }], items: [], ...(doc.hero ? { hero: doc.hero } : {}) })}::jsonb,1,1)`;
      }
      const before = Math.floor(Date.now() / 1000);
      await db.sql.begin((tx) => tx.unsafe(sqlText));
      const pages = await listPublished(db.sql, "guide", "forever");
      expect(pages).toHaveLength(5);
      for (const doc of docs) {
        const page = await readPublished(db.sql, "guide", doc.slug);
        expect(page?.version).toBe(2);
        expect(page?.title).toBe(doc.title);
        expect(page?.terms).toEqual(doc.terms);
        expect(page?.blocks).toEqual(doc.blocks);
        expect(page?.updatedAt).toBeGreaterThanOrEqual(before);
        expect(page?.hero).toEqual(doc.hero);
        expect(page?.items).toEqual([]);
        expect((await content.read("guide", doc.slug, "en", 1))?.document.blocks).toEqual([
          { type: "paragraph", text: "Original publication" },
        ]);
        // The same document through the authorized API does not create another version.
        expect((await content.saveDraft(doc)).unchanged).toBe(true);
      }
      await db.sql.begin((tx) => tx.unsafe(sqlText));
      expect(await listPublished(db.sql, "guide", "forever")).toEqual(pages);
      const changed = { ...docs[0]!, title: "A later editorial revision" };
      await content.saveDraft(changed);
      await content.publish("guide", changed.slug);
      await db.sql.begin((tx) => tx.unsafe(sqlText));
      expect((await readPublished(db.sql, "guide", changed.slug))?.title).toBe(changed.title);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      await db.drop();
    }
  },
);

test.skipIf(!hasPostgres)("a conflicting draft aborts the complete content migration", async () => {
  const db = await testDatabase();
  try {
    for (const [i, doc] of raw.entries()) {
      await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at)
        VALUES ('forever','guide',${String(doc.slug)},'en',${String(doc.previousTitle)},'Keep this',1,${i === 2 ? "draft" : "published"},
          ${JSON.stringify(doc.hero ? { hero: doc.hero } : {})}::jsonb,1)`;
    }
    await expect(db.sql.begin((tx) => tx.unsafe(sqlText))).rejects.toThrow(
      "publication changed or draft exists",
    );
    const rows = await db.sql`SELECT version, updated_at FROM content.paths`;
    expect(rows.every((r) => r.version === 1 && r.updated_at === 1)).toBe(true);
  } finally {
    await db.drop();
  }
});
