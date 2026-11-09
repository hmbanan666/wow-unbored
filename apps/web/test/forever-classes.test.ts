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
const migration = () => sqlFile("0028_forever_classes.sql");
const levelingSlug = "best-leveling-class-wow-forever";
const additions = ["wow-forever-warlock-leveling-guide", "wow-forever-hunter-pet-guide"];
const soloSlug = "best-solo-class-wow-forever";
async function fixture() {
  const db = await testDatabase();
  const dir = mkdtempSync(fileURLToPath(new URL(".classes-", import.meta.url)));
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
    sqlFile("0027_forever_raids_comparison_addons.sql"),
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
  "class batch publishes two grouped pages and two revisions, preserving other work",
  async () => {
    const db = await fixture();
    try {
      const old = (await db.content.read("guide", levelingSlug))!;
      const oldSolo = (await db.content.read("guide", soloSlug))!;
      const other = (await db.content.read("guide", "wow-forever-camping-guide"))!.document;
      await db.content.saveDraft({ ...other, title: "An unfinished camping revision" });
      await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at)
      VALUES ('retail','guide','owner-draft','en','Owner draft','Unfinished',1,'draft','{}',1),
             ('forever','guide',${levelingSlug},'ru','Owner draft','Unfinished',1,'draft','{}',1)`;
      const before =
        await db.sql`SELECT * FROM content.paths WHERE NOT (slug IN (${levelingSlug}, ${soloSlug}) AND locale = 'en' AND status = 'published') ORDER BY id`;
      const stamp = Math.floor(Date.now() / 1000);
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const published = await listPublished(db.sql, "guide", "forever");
      expect(published).toHaveLength(17);
      expect(foreverHub(published).start.map((page) => page.slug)).toEqual([
        "wow-forever-beginners-guide",
        "wow-forever-enhanced-vs-classic-preset",
        "wow-forever-faq",
      ]);
      for (const slug of additions) {
        const page = (await readPublished(db.sql, "guide", slug))!;
        expect(page.version).toBe(1);
        expect(page.group).toBe("classes");
        expect(
          foreverHub(published)
            .groups.find((g) => g.group === page.group)
            ?.pages.some((p) => p.slug === slug),
        ).toBe(true);
        expect(page.updatedAt).toBeGreaterThanOrEqual(stamp);
        const document = (await db.content.read("guide", slug))!.document;
        expect((await db.content.saveDraft(document)).unchanged).toBe(true);
      }
      const revised = (await db.content.read("guide", levelingSlug))!;
      expect(revised.version).toBe(3);
      const solo = (await db.content.read("guide", soloSlug))!;
      expect(solo.version).toBe(3);
      expect(solo.document.group).toBe(oldSolo.document.group);
      expect((await db.content.read("guide", soloSlug, "en", 2))?.document).toEqual(
        oldSolo.document,
      );
      expect(revised.document.group).toBe(old.document.group);
      expect((await db.content.saveDraft(revised.document)).unchanged).toBe(true);
      expect((await db.content.read("guide", levelingSlug, "en", 2))?.document).toEqual(
        old.document,
      );
      expect(
        await db.sql`SELECT * FROM content.paths WHERE id IN ${db.sql(before.map((row) => row.id))} ORDER BY id`,
      ).toEqual(before);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "class batch migration replays after later publications and drafts without changing any row",
  async () => {
    const db = await fixture();
    try {
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const original = await db.sql`SELECT * FROM content.paths ORDER BY id`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(original);
      for (const slug of [...additions, levelingSlug, soloSlug]) {
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
  "class batch migration leaves a fresh database empty without recording a content revision",
  async () => {
    const db = await testDatabase();
    try {
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths`).toHaveLength(0);
      expect(
        await db.sql`SELECT * FROM content.editorial_migrations WHERE name = 'forever-classes-2026-11-09'`,
      ).toHaveLength(0);
    } finally {
      await db.drop();
    }
  },
);

for (const revisionSlug of [levelingSlug, soloSlug]) {
  test.skipIf(!hasPostgres)(
    `${revisionSlug} keeps its publication group even if it differs from the batch default`,
    async () => {
      const db = await fixture();
      try {
        await db.sql`UPDATE content.paths SET guide_group = 'comparisons' WHERE slug = ${revisionSlug} AND status = 'published'`;
        await db.sql.begin((tx) => tx.unsafe(migration()));
        const doc = (await db.content.read("guide", revisionSlug))!.document;
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
    "missing tier list",
    "tier list draft",
    "tier list body",
    "tier list title",
    "tier list description",
    "tier list version",
    "tier list game",
    "missing group",
  ] as const) {
    test.skipIf(!hasPostgres)(
      `class batch rolls back on ${revisionSlug}: ${conflict}`,
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
          } else if (conflict === "missing tier list")
            await db.sql`DELETE FROM content.paths WHERE slug = ${revisionSlug}`;
          else if (conflict === "tier list draft") {
            const doc = (await db.content.read("guide", revisionSlug))!.document;
            await db.content.saveDraft({ ...doc, title: "Unfinished tier list revision" });
          } else if (conflict === "tier list body")
            await db.sql`UPDATE content.paths SET body = body || '{"owner":"correction"}'::jsonb WHERE slug = ${revisionSlug} AND status = 'published'`;
          else if (conflict === "tier list title")
            await db.sql`UPDATE content.paths SET title = 'Owner correction' WHERE slug = ${revisionSlug} AND status = 'published'`;
          else if (conflict === "tier list description")
            await db.sql`UPDATE content.paths SET description = 'Owner correction' WHERE slug = ${revisionSlug} AND status = 'published'`;
          else if (conflict === "tier list version")
            await db.sql`UPDATE content.paths SET version = 4 WHERE slug = ${revisionSlug} AND status = 'published'`;
          else if (conflict === "tier list game")
            await db.sql`UPDATE content.paths SET game = 'retail', guide_group = NULL WHERE slug = ${revisionSlug} AND status = 'published'`;
          else
            await db.sql`UPDATE content.paths SET guide_group = NULL WHERE slug = ${revisionSlug} AND status = 'published'`;
          const before = await db.sql`SELECT * FROM content.paths ORDER BY id`;
          await expect(db.sql.begin((tx) => tx.unsafe(migration()))).rejects.toThrow(
            "Class guides migration needs review",
          );
          expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(before);
          expect(
            await db.sql`SELECT * FROM content.editorial_migrations WHERE name = 'forever-classes-2026-11-09'`,
          ).toHaveLength(0);
        } finally {
          await db.close();
        }
      },
    );
  }
}

test("class guides meet metadata, links, table, FAQ and scoped revision requirements", () => {
  const prior = [
    editorial,
    sqlFile("0024_forever_systems.sql"),
    sqlFile("0026_forever_money.sql"),
    sqlFile("0027_forever_raids_comparison_addons.sql"),
  ].flatMap(guidesFromMigration) as Record<string, unknown>[];
  const raw = guidesFromMigration(migration()) as Record<string, unknown>[];
  const docs = validateGuideBundle([
    ...new Map([...prior, ...raw].map((doc) => [doc.slug, doc])).values(),
  ]);
  expect(raw.map((doc) => doc.slug)).toEqual([...additions, levelingSlug, soloSlug]);
  expect(docs).toHaveLength(17);
  for (const slug of additions) {
    const doc = docs.find((d) => d.slug === slug)!;
    expect(doc.title.length + " | Unbored".length).toBeLessThanOrEqual(60);
    expect(doc.description.length).toBeGreaterThanOrEqual(120);
    expect(doc.description.length).toBeLessThanOrEqual(155);
    expect(doc.game).toBe("forever");
    expect(doc.group).toBe("classes");
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
      "/guides/wow-forever-legacy-talents",
      "/guides/wow-forever-best-professions-for-each-class",
      ...[levelingSlug, soloSlug, ...additions.filter((s) => s !== slug)].map(
        (s) => `/guides/${s}`,
      ),
    ])
      expect(doc.blocks.some((b) => b.type === "link" && b.href === href)).toBe(true);
  }
  for (const slug of [levelingSlug, soloSlug]) {
    const old = prior.find((d) => d.slug === slug)!;
    const updated = docs.find((d) => d.slug === slug)!;
    const oldBlocks = old.blocks as { type: string; text?: string }[];
    // Maintenance retains the existing decision sequence and all prior links.
    expect(updated.blocks.filter((b) => b.type === "heading" || b.type === "list")).toEqual(
      oldBlocks.filter((b) => b.type === "heading" || b.type === "list"),
    );
    for (const block of oldBlocks.filter((b) => b.type === "link"))
      expect(updated.blocks).toContainEqual(block);
    expect(updated.title.length + " | Unbored".length).toBeLessThanOrEqual(60);
    expect(updated.description).toBe(old.description);
    expect(JSON.stringify(updated.blocks)).toContain("FORECAST");
  }
  const warlock = docs.find((d) => d.slug === additions[0])!;
  expect(
    warlock.blocks.some(
      (b) =>
        b.type === "paragraph" && b.text.includes("Status:") && b.text.includes("1.60.1.70862"),
    ),
  ).toBe(true);
});
