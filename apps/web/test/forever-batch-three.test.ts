import { expect, test } from "vite-plus/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../../server/src/content.ts";
import { Store } from "../../server/src/store.ts";
import { guidesFromMigration, validateGuideBundle } from "../../server/src/guide-editorial.ts";
import { hasPostgres, testDatabase } from "../../server/test/postgres-db.ts";
import { listPublished, readPublished } from "../server/utils/content.ts";

import { foreverHub } from "../shared/forever-hub.ts";

const sqlFile = (name: string) =>
  readFileSync(new URL(`../../server/migrations/${name}`, import.meta.url), "utf8");
const editorial = sqlFile("0023_forever_editorial.sql");
const migration = () => sqlFile("0027_forever_raids_comparison_addons.sql");
const faqSlug = "wow-forever-faq";
const additions = ["wow-forever-raids", "wow-forever-vs-classic", "best-wow-forever-addons"];
async function fixture() {
  const db = await testDatabase();
  const dir = mkdtempSync(fileURLToPath(new URL(".batch-three-", import.meta.url)));
  const store = new Store(dir, { postgres: db.sql });
  const content = new ContentStore(store.db, store.game);
  for (const doc of guidesFromMigration(editorial) as Record<string, unknown>[]) {
    await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at,published_at)
      VALUES ('forever','guide',${String(doc.slug)},'en',${String(doc.previousTitle)},'Original description',1,'published',
      ${JSON.stringify({ blocks: [{ type: "paragraph", text: "Original publication" }], items: [], ...(doc.hero ? { hero: doc.hero } : {}) })}::jsonb,1,1)`;
  }
  for (const sql of [
    editorial,
    sqlFile("0024_forever_systems.sql"),
    sqlFile("0025_forever_groups.sql"),
    sqlFile("0026_forever_money.sql"),
  ])
    await db.sql.begin((tx) => tx.unsafe(sql));
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
  "batch three publishes three grouped pages and a new FAQ version, preserving other work",
  async () => {
    const db = await fixture();
    try {
      const old = (await db.content.read("guide", faqSlug))!;
      const other = (await db.content.read("guide", "wow-forever-camping-guide"))!.document;
      await db.content.saveDraft({ ...other, title: "An unfinished camping revision" });
      await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at)
      VALUES ('retail','guide','owner-draft','en','Owner draft','Unfinished',1,'draft','{}',1),
             ('forever','guide',${faqSlug},'ru','Owner draft','Unfinished',1,'draft','{}',1)`;
      const before =
        await db.sql`SELECT * FROM content.paths WHERE NOT (slug = ${faqSlug} AND locale = 'en' AND status = 'published') ORDER BY id`;
      const stamp = Math.floor(Date.now() / 1000);
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const published = await listPublished(db.sql, "guide", "forever");
      expect(published).toHaveLength(15);
      expect(foreverHub(published).start.map((page) => page.slug)).toEqual([
        "wow-forever-beginners-guide",
        "wow-forever-enhanced-vs-classic-preset",
        "wow-forever-faq",
      ]);
      for (const slug of additions) {
        const page = (await readPublished(db.sql, "guide", slug))!;
        expect(page.version).toBe(1);
        expect(page.group).toBe(
          ["dungeons-raids", "comparisons", "addons"][additions.indexOf(slug)],
        );
        expect(
          foreverHub(published)
            .groups.find((g) => g.group === page.group)
            ?.pages.some((p) => p.slug === slug),
        ).toBe(true);
        expect(page.updatedAt).toBeGreaterThanOrEqual(stamp);
        const document = (await db.content.read("guide", slug))!.document;
        expect((await db.content.saveDraft(document)).unchanged).toBe(true);
      }
      const revised = (await db.content.read("guide", faqSlug))!;
      expect(revised.version).toBe(2);
      expect(revised.document.group).toBe(old.document.group);
      expect((await db.content.saveDraft(revised.document)).unchanged).toBe(true);
      expect((await db.content.read("guide", faqSlug, "en", 1))?.document).toEqual(old.document);
      expect(
        await db.sql`SELECT * FROM content.paths WHERE id IN ${db.sql(before.map((row) => row.id))} ORDER BY id`,
      ).toEqual(before);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "batch three migration replays after later publications and drafts without changing any row",
  async () => {
    const db = await fixture();
    try {
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const original = await db.sql`SELECT * FROM content.paths ORDER BY id`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(original);
      for (const slug of [...additions, faqSlug]) {
        const doc = (await db.content.read("guide", slug))!.document;
        await db.content.saveDraft({
          ...doc,
          title: "Later owner publication",
          group: "first-steps",
        });
        await db.content.publish("guide", slug);
        await db.content.saveDraft({ ...doc, title: "Unfinished owner draft" });
      }
      const later = await db.sql`SELECT * FROM content.paths ORDER BY id`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(later);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "batch three migration leaves a fresh database empty without recording a content revision",
  async () => {
    const db = await testDatabase();
    try {
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths`).toHaveLength(0);
      expect(
        await db.sql`SELECT * FROM content.editorial_migrations WHERE name = 'forever-batch-three-2026-11-09'`,
      ).toHaveLength(0);
    } finally {
      await db.drop();
    }
  },
);

test.skipIf(!hasPostgres)(
  "FAQ revision keeps the publication's group even if it differs from the batch default",
  async () => {
    const db = await fixture();
    try {
      await db.sql`UPDATE content.paths SET guide_group = 'comparisons' WHERE slug = ${faqSlug} AND status = 'published'`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const doc = (await db.content.read("guide", faqSlug))!.document;
      expect(doc.group).toBe("comparisons");
      expect((await db.content.saveDraft(doc)).unchanged).toBe(true);
    } finally {
      await db.close();
    }
  },
);

for (const conflict of [
  "new draft",
  "new publication",
  "retired slug",
  "Retail slug",
  "missing FAQ",
  "FAQ draft",
  "FAQ body",
  "FAQ title",
  "FAQ description",
  "FAQ version",
  "FAQ game",
  "missing group",
] as const) {
  test.skipIf(!hasPostgres)(
    `batch three migration rolls back the whole batch on ${conflict}`,
    async () => {
      const db = await fixture();
      try {
        if (["new draft", "new publication", "retired slug", "Retail slug"].includes(conflict)) {
          // Use the last addition so a collision must roll back earlier inserts as well.
          const slug = additions.at(-1)!;
          const game = conflict === "Retail slug" ? "retail" : "forever";
          const status =
            conflict === "new publication"
              ? "published"
              : conflict === "retired slug"
                ? "retired"
                : "draft";
          await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at,published_at)
          VALUES (${game},'guide',${slug},'en','Owner page','Owner content',1,${status},'{}',1,${status === "draft" ? null : 1})`;
        } else if (conflict === "missing FAQ")
          await db.sql`DELETE FROM content.paths WHERE slug = ${faqSlug}`;
        else if (conflict === "FAQ draft") {
          const doc = (await db.content.read("guide", faqSlug))!.document;
          await db.content.saveDraft({ ...doc, title: "Unfinished FAQ revision" });
        } else if (conflict === "FAQ body")
          await db.sql`UPDATE content.paths SET body = body || '{"owner":"correction"}'::jsonb WHERE slug = ${faqSlug} AND status = 'published'`;
        else if (conflict === "FAQ title")
          await db.sql`UPDATE content.paths SET title = 'Owner correction' WHERE slug = ${faqSlug} AND status = 'published'`;
        else if (conflict === "FAQ description")
          await db.sql`UPDATE content.paths SET description = 'Owner correction' WHERE slug = ${faqSlug} AND status = 'published'`;
        else if (conflict === "FAQ version")
          await db.sql`UPDATE content.paths SET version = 4 WHERE slug = ${faqSlug} AND status = 'published'`;
        else if (conflict === "FAQ game")
          await db.sql`UPDATE content.paths SET game = 'retail', guide_group = NULL WHERE slug = ${faqSlug} AND status = 'published'`;
        else
          await db.sql`UPDATE content.paths SET guide_group = NULL WHERE slug = ${faqSlug} AND status = 'published'`;
        const before = await db.sql`SELECT * FROM content.paths ORDER BY id`;
        await expect(db.sql.begin((tx) => tx.unsafe(migration()))).rejects.toThrow(
          "Batch three migration needs review",
        );
        expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(before);
        expect(
          await db.sql`SELECT * FROM content.editorial_migrations WHERE name = 'forever-batch-three-2026-11-09'`,
        ).toHaveLength(0);
      } finally {
        await db.close();
      }
    },
  );
}

test("batch three meets metadata, link, table and FAQ requirements", () => {
  const prior = [
    editorial,
    sqlFile("0024_forever_systems.sql"),
    sqlFile("0026_forever_money.sql"),
  ].flatMap(guidesFromMigration) as Record<string, unknown>[];
  const raw = guidesFromMigration(migration()) as Record<string, unknown>[];
  const docs = validateGuideBundle([
    ...new Map([...prior, ...raw].map((doc) => [doc.slug, doc])).values(),
  ]);
  expect(raw.map((doc) => doc.slug)).toEqual([...additions, faqSlug]);
  expect(docs).toHaveLength(15);
  for (const slug of additions) {
    const doc = docs.find((d) => d.slug === slug)!;
    expect(doc.title.length + " | Unbored".length).toBeLessThanOrEqual(60);
    expect(doc.description.length).toBeGreaterThanOrEqual(120);
    expect(doc.description.length).toBeLessThanOrEqual(155);
    expect(doc.game).toBe("forever");
    expect(doc.hero).toBeUndefined();
    expect(doc.asOf?.date).toBe("2026-11-09");
    expect(JSON.stringify(doc.blocks)).not.toContain("—");
    expect(doc.blocks.some((b) => b.type === "table")).toBe(true);
    const faq = doc.blocks.filter((b) => b.type === "faq");
    expect(faq).toHaveLength(1);
    expect(faq[0]!.entries.length).toBeGreaterThanOrEqual(3);
    expect(faq[0]!.entries.length).toBeLessThanOrEqual(6);
    for (const href of [
      "/forever",
      "/guides/wow-forever-beginners-guide",
      "/guides/wow-forever-faq",
    ])
      expect(doc.blocks.some((b) => b.type === "link" && b.href === href)).toBe(true);
  }
  const old = prior.find((d) => d.slug === faqSlug)!;
  const updated = docs.find((d) => d.slug === faqSlug)!;
  expect(
    updated.blocks.filter((b) => !(b.type === "link" && b.href === "/guides/wow-forever-raids")),
  ).toEqual(old.blocks);
  expect(updated.sources).toEqual(old.sources);
  expect(updated.asOf).toEqual(old.asOf);
  expect(docs.some((d) => /mount.*cost|riding.*cost/.test(d.slug))).toBe(false);
});
