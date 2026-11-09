import { expect, test } from "vite-plus/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../../server/src/content.ts";
import { Store } from "../../server/src/store.ts";
import { guidesFromMigration } from "../../server/src/guide-editorial.ts";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db.ts";
import { listPublished, readPublished } from "../server/utils/content.ts";

const sqlFile = (name: string) =>
  readFileSync(new URL(`../../server/migrations/${name}`, import.meta.url), "utf8");
const editorial = sqlFile("0023_forever_editorial.sql");
const systems = sqlFile("0024_forever_systems.sql");
const migration = () => sqlFile("0025_forever_groups.sql");
const mapping = {
  "wow-forever-beginners-guide": "first-steps",
  "wow-forever-camping-guide": "systems",
  "wow-forever-cozy-sleeping-bag": "systems",
  "wow-forever-legacy-talents": "systems",
  "wow-forever-enhanced-vs-classic-preset": "systems",
  "best-leveling-class-wow-forever": "classes",
  "best-solo-class-wow-forever": "classes",
  "wow-forever-enchanting-guide": "professions-gold",
  "how-to-make-gold-early-in-wow-forever": "professions-gold",
};
async function fixture() {
  const db = await testDatabase();
  const dir = mkdtempSync(fileURLToPath(new URL(".hub-", import.meta.url)));
  const store = new Store(dir, { postgres: db.sql });
  const content = new ContentStore(store.db, store.game);
  for (const doc of guidesFromMigration(editorial) as Record<string, unknown>[]) {
    await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at,published_at)
      VALUES ('forever','guide',${String(doc.slug)},'en',${String(doc.previousTitle)},'Original description',1,'published',
      ${JSON.stringify({ blocks: [{ type: "paragraph", text: "Original publication" }], items: [], ...(doc.hero ? { hero: doc.hero } : {}) })}::jsonb,1,1)`;
  }
  await db.sql.begin((tx) => tx.unsafe(editorial));
  await db.sql.begin((tx) => tx.unsafe(systems));
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

test.skipIf(!hasPostgres)(
  "group migration preserves every publication and history byte, and replays after owner edits",
  async () => {
    const db = await fixture();
    try {
      // Other games and languages may have unfinished work; leave it untouched.
      await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at)
        VALUES ('retail','guide','owner-draft','en','Owner draft','Unfinished',1,'draft','{}',1),
               ('forever','guide','owner-draft','ru','Owner draft','Unfinished',1,'draft','{}',1)`;
      const before =
        await db.sql`SELECT to_jsonb(p) - 'guide_group' AS value FROM content.paths p ORDER BY id`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const pages = await listPublished(db.sql, "guide", "forever");
      expect(Object.fromEntries(pages.map((p) => [p.slug, p.group]))).toEqual(mapping);
      expect(
        await db.sql`SELECT to_jsonb(p) - 'guide_group' AS value FROM content.paths p ORDER BY id`,
      ).toEqual(before);
      const slug = "wow-forever-camping-guide";
      expect((await readPublished(db.sql, "guide", slug))?.group).toBe("systems");
      const old = (await db.content.read("guide", slug))!;
      expect(old.document.group).toBe("systems");
      expect((await db.content.saveDraft(old.document)).unchanged).toBe(true);
      const changed = { ...old.document, group: "first-steps" };
      await db.content.saveDraft(changed);
      await db.content.publish("guide", slug);
      expect((await readPublished(db.sql, "guide", slug))?.group).toBe("first-steps");
      expect((await db.content.read("guide", slug, "en", 1))?.document.group).toBe("systems");
      await db.content.saveDraft({ ...changed, title: "An unfinished owner revision" });
      const later = await db.sql`SELECT * FROM content.paths ORDER BY id`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(later);
      await expect(
        db.content.saveDraft({ ...changed, slug: "new-guide", group: undefined }),
      ).rejects.toThrow(/group/);
    } finally {
      await db.close();
    }
  },
);

for (const conflict of ["draft", "body", "missing", "game", "new publication"] as const) {
  test.skipIf(!hasPostgres)(`group migration rolls back on unexpected ${conflict}`, async () => {
    const db = await fixture();
    try {
      const slug = "wow-forever-camping-guide";
      if (conflict === "draft") {
        const doc = (await db.content.read("guide", slug))!.document;
        await db.content.saveDraft({ ...doc, group: "systems", title: "Owner draft" });
      } else if (conflict === "body")
        await db.sql`UPDATE content.paths SET body = body || '{"owner":"edit"}'::jsonb WHERE slug = ${slug}`;
      else if (conflict === "missing") await db.sql`DELETE FROM content.paths WHERE slug = ${slug}`;
      else if (conflict === "game")
        await db.sql`UPDATE content.paths SET game = 'retail' WHERE slug = ${slug}`;
      else
        await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at,published_at)
        VALUES ('forever','guide','new-guide','en','New guide','New guide',1,'published','{}',1,1)`;
      const before = await db.sql`SELECT * FROM content.paths ORDER BY id`;
      await expect(db.sql.begin((tx) => tx.unsafe(migration()))).rejects.toThrow(
        "Forever group migration needs review",
      );
      expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(before);
    } finally {
      await db.close();
    }
  });
}

test.skipIf(!hasPostgres)("group migration leaves fresh databases empty", async () => {
  const db = await testDatabase();
  try {
    await db.sql.begin((tx) => tx.unsafe(migration()));
    expect(await listPublished(db.sql, "guide", "forever")).toEqual([]);
  } finally {
    await db.drop();
  }
});
