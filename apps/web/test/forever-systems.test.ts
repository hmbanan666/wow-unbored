import { expect, test } from "vite-plus/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../../server/src/content.ts";
import { Store } from "../../server/src/store.ts";
import { guidesFromMigration, validateGuideBundle } from "../../server/src/guide-editorial.ts";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db.ts";
import { listPublished, readPublished } from "../server/utils/content.ts";

const priorSql = readFileSync(
  new URL("../../server/migrations/0023_forever_editorial.sql", import.meta.url),
  "utf8",
);
const prior = guidesFromMigration(priorSql) as Record<string, unknown>[];
const migration = readFileSync(
  new URL("../../server/migrations/0024_forever_systems.sql", import.meta.url),
  "utf8",
);
const raw = guidesFromMigration(migration) as Record<string, unknown>[];
const docs = validateGuideBundle([
  ...prior.filter((d) => !raw.some((n) => n.slug === d.slug)),
  ...raw,
]);
const additions = docs.filter((d) => !prior.some((p) => p.slug === d.slug));
const beginner = "wow-forever-beginners-guide";

async function fixture() {
  const db = await testDatabase();
  const dir = mkdtempSync(fileURLToPath(new URL(".systems-", import.meta.url)));
  const store = new Store(dir, { postgres: db.sql });
  const content = new ContentStore(store.db, store.game);
  for (const doc of prior) {
    await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at,published_at)
      VALUES ('forever','guide',${String(doc.slug)},'en',${String(doc.previousTitle)},'Original description',1,'published',
      ${JSON.stringify({ blocks: [{ type: "paragraph", text: "Original publication" }], items: [], ...(doc.hero ? { hero: doc.hero } : {}) })}::jsonb,1,1)`;
  }
  await db.sql.begin((tx) => tx.unsafe(priorSql));
  return {
    ...db,
    content,
    async close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      await db.drop();
    },
  };
}

test("four systems guides answer distinct queries with valid tables, FAQ and links", () => {
  expect(additions.map((d) => d.slug).sort()).toEqual([
    "wow-forever-camping-guide",
    "wow-forever-cozy-sleeping-bag",
    "wow-forever-enhanced-vs-classic-preset",
    "wow-forever-legacy-talents",
  ]);
  for (const doc of additions) {
    expect(doc.game).toBe("forever");
    expect(doc.title.length).toBeLessThanOrEqual(60);
    expect(doc.description.length).toBeGreaterThanOrEqual(120);
    expect(doc.description.length).toBeLessThanOrEqual(155);
    expect(doc.blocks.some((b) => b.type === "table")).toBe(true);
    const faqs = doc.blocks.filter((b) => b.type === "faq");
    expect(faqs).toHaveLength(1);
    expect(faqs[0]!.entries.length).toBeGreaterThanOrEqual(3);
    expect(faqs[0]!.entries.length).toBeLessThanOrEqual(6);
    expect(doc.hero).toBeUndefined();
    expect(doc.blocks.some((b) => b.type === "figure")).toBe(false);
    expect(doc.terms?.length).toBeGreaterThan(0);
    expect(doc.blocks.some((b) => b.type === "link" && b.href === `/guides/${beginner}`)).toBe(
      true,
    );
    expect(JSON.stringify(doc)).not.toContain("—");
  }
});

test.skipIf(!hasPostgres)(
  "systems publication preserves history and beginner prose, then replays without changing later edits",
  async () => {
    const db = await fixture();
    try {
      const before = await db.content.read("guide", beginner);
      const stamp = Math.floor(Date.now() / 1000);
      await db.sql.begin((tx) => tx.unsafe(migration));
      expect(await listPublished(db.sql, "guide", "forever")).toHaveLength(9);
      for (const doc of additions) {
        const page = await readPublished(db.sql, "guide", doc.slug);
        expect(page?.version).toBe(1);
        expect(page?.blocks).toEqual(doc.blocks);
        expect(page?.updatedAt).toBeGreaterThanOrEqual(stamp);
        expect((await db.content.saveDraft(doc)).unchanged).toBe(true);
      }
      const after = await db.content.read("guide", beginner);
      expect(after?.version).toBe(3);
      const newHrefs = new Set(additions.map((d) => `/guides/${d.slug}`));
      const added = after!.document.blocks.filter((b) => b.type === "link" && newHrefs.has(b.href));
      expect(added).toHaveLength(4);
      expect({
        ...after!.document,
        blocks: after!.document.blocks.filter((b) => !added.includes(b)),
      }).toEqual(before!.document);
      expect((await db.content.read("guide", beginner, "en", 2))?.document).toEqual(
        before?.document,
      );
      const original = await listPublished(db.sql, "guide", "forever");
      await db.sql.begin((tx) => tx.unsafe(migration));
      expect(await listPublished(db.sql, "guide", "forever")).toEqual(original);
      const changed = { ...additions[0]!, title: "Camping after a later update" };
      await db.content.saveDraft(changed);
      await db.content.publish("guide", changed.slug);
      await db.sql.begin((tx) => tx.unsafe(migration));
      expect((await readPublished(db.sql, "guide", changed.slug))?.title).toBe(changed.title);
      await db.content.saveDraft({ ...changed, title: "Owner's unfinished camping revision" });
      const draft = await db.content.read("guide", changed.slug);
      await db.sql.begin((tx) => tx.unsafe(migration));
      expect(await db.content.read("guide", changed.slug)).toEqual(draft);
      expect((await readPublished(db.sql, "guide", changed.slug))?.title).toBe(changed.title);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!hasPostgres)("systems migration leaves a fresh database empty", async () => {
  const db = await testDatabase();
  try {
    await db.sql.begin((tx) => tx.unsafe(migration));
    expect(await listPublished(db.sql, "guide", "forever")).toEqual([]);
  } finally {
    await db.drop();
  }
});

for (const conflict of [
  "new slug",
  "Retail slug",
  "missing beginner",
  "beginner draft",
  "changed beginner body",
] as const) {
  test.skipIf(!hasPostgres)(
    `systems migration aborts the entire batch on ${conflict}`,
    async () => {
      const db = await fixture();
      try {
        if (conflict === "new slug" || conflict === "Retail slug") {
          await db.content.saveDraft(additions.at(-1)!);
          if (conflict === "Retail slug")
            await db.sql`UPDATE content.paths SET game = 'retail' WHERE slug = ${additions.at(-1)!.slug}`;
        } else if (conflict === "missing beginner")
          await db.sql`DELETE FROM content.paths WHERE slug = ${beginner}`;
        else if (conflict === "beginner draft") {
          const current = (await db.content.read("guide", beginner))!.document;
          await db.content.saveDraft({ ...current, title: "Owner's newer beginner draft" });
        } else
          await db.sql`UPDATE content.paths SET body = jsonb_set(body, '{blocks}', '[{"type":"paragraph","text":"Owner correction"}]'::jsonb) WHERE slug = ${beginner} AND status = 'published'`;
        const before = await listPublished(db.sql, "guide", "forever");
        await expect(db.sql.begin((tx) => tx.unsafe(migration))).rejects.toThrow(
          "Systems migration needs review",
        );
        expect(await listPublished(db.sql, "guide", "forever")).toEqual(before);
      } finally {
        await db.close();
      }
    },
  );
}
