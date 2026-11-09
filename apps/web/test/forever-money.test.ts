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
const migration = () => sqlFile("0026_forever_money.sql");
const gold = "how-to-make-gold-early-in-wow-forever";
const additions = [
  "wow-forever-merchants-favor-waylaid-crates",
  "wow-forever-best-professions-for-each-class",
  "wow-forever-faq",
];
async function fixture() {
  const db = await testDatabase();
  const dir = mkdtempSync(fileURLToPath(new URL(".money-", import.meta.url)));
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
  "money batch publishes three grouped pages and a new gold version, preserving other work",
  async () => {
    const db = await fixture();
    try {
      const old = (await db.content.read("guide", gold))!;
      const other = (await db.content.read("guide", "wow-forever-camping-guide"))!.document;
      await db.content.saveDraft({ ...other, title: "An unfinished camping revision" });
      await db.sql`INSERT INTO content.paths (game,kind,slug,locale,title,description,version,status,body,updated_at)
      VALUES ('retail','guide','owner-draft','en','Owner draft','Unfinished',1,'draft','{}',1),
             ('forever','guide',${gold},'ru','Owner draft','Unfinished',1,'draft','{}',1)`;
      const before =
        await db.sql`SELECT * FROM content.paths WHERE NOT (slug = ${gold} AND locale = 'en' AND status = 'published') ORDER BY id`;
      const stamp = Math.floor(Date.now() / 1000);
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const published = await listPublished(db.sql, "guide", "forever");
      expect(published).toHaveLength(12);
      expect(foreverHub(published).start.map((page) => page.slug)).toEqual([
        "wow-forever-beginners-guide",
        "wow-forever-enhanced-vs-classic-preset",
        "wow-forever-faq",
      ]);
      for (const slug of additions) {
        const page = (await readPublished(db.sql, "guide", slug))!;
        expect(page.version).toBe(1);
        expect(page.group).toBe(slug === "wow-forever-faq" ? "first-steps" : "professions-gold");
        expect(page.updatedAt).toBeGreaterThanOrEqual(stamp);
        const document = (await db.content.read("guide", slug))!.document;
        expect((await db.content.saveDraft(document)).unchanged).toBe(true);
      }
      const revised = (await db.content.read("guide", gold))!;
      expect(revised.version).toBe(3);
      expect(revised.document.group).toBe(old.document.group);
      expect((await db.content.saveDraft(revised.document)).unchanged).toBe(true);
      expect((await db.content.read("guide", gold, "en", 2))?.document).toEqual(old.document);
      expect(
        await db.sql`SELECT * FROM content.paths WHERE id IN ${db.sql(before.map((row) => row.id))} ORDER BY id`,
      ).toEqual(before);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "money migration replays after later publications and drafts without changing any row",
  async () => {
    const db = await fixture();
    try {
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const original = await db.sql`SELECT * FROM content.paths ORDER BY id`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(original);
      for (const slug of [...additions, gold]) {
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
  "money migration leaves a fresh database empty without recording a content revision",
  async () => {
    const db = await testDatabase();
    try {
      await db.sql.begin((tx) => tx.unsafe(migration()));
      expect(await db.sql`SELECT * FROM content.paths`).toHaveLength(0);
      expect(
        await db.sql`SELECT * FROM content.editorial_migrations WHERE name = 'forever-money-2026-11-09'`,
      ).toHaveLength(0);
    } finally {
      await db.drop();
    }
  },
);

test.skipIf(!hasPostgres)(
  "gold revision keeps the publication's group even if it differs from the batch default",
  async () => {
    const db = await fixture();
    try {
      await db.sql`UPDATE content.paths SET guide_group = 'first-steps' WHERE slug = ${gold} AND status = 'published'`;
      await db.sql.begin((tx) => tx.unsafe(migration()));
      const doc = (await db.content.read("guide", gold))!.document;
      expect(doc.group).toBe("first-steps");
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
  "missing gold",
  "gold draft",
  "gold body",
  "gold title",
  "gold description",
  "gold version",
  "gold game",
  "missing group",
] as const) {
  test.skipIf(!hasPostgres)(
    `money migration rolls back the whole batch on ${conflict}`,
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
        } else if (conflict === "missing gold")
          await db.sql`DELETE FROM content.paths WHERE slug = ${gold}`;
        else if (conflict === "gold draft") {
          const doc = (await db.content.read("guide", gold))!.document;
          await db.content.saveDraft({ ...doc, title: "Unfinished gold revision" });
        } else if (conflict === "gold body")
          await db.sql`UPDATE content.paths SET body = body || '{"owner":"correction"}'::jsonb WHERE slug = ${gold} AND status = 'published'`;
        else if (conflict === "gold title")
          await db.sql`UPDATE content.paths SET title = 'Owner correction' WHERE slug = ${gold} AND status = 'published'`;
        else if (conflict === "gold description")
          await db.sql`UPDATE content.paths SET description = 'Owner correction' WHERE slug = ${gold} AND status = 'published'`;
        else if (conflict === "gold version")
          await db.sql`UPDATE content.paths SET version = 4 WHERE slug = ${gold} AND status = 'published'`;
        else if (conflict === "gold game")
          await db.sql`UPDATE content.paths SET game = 'retail', guide_group = NULL WHERE slug = ${gold} AND status = 'published'`;
        else
          await db.sql`UPDATE content.paths SET guide_group = NULL WHERE slug = ${gold} AND status = 'published'`;
        const before = await db.sql`SELECT * FROM content.paths ORDER BY id`;
        await expect(db.sql.begin((tx) => tx.unsafe(migration()))).rejects.toThrow(
          "Money migration needs review",
        );
        expect(await db.sql`SELECT * FROM content.paths ORDER BY id`).toEqual(before);
        expect(
          await db.sql`SELECT * FROM content.editorial_migrations WHERE name = 'forever-money-2026-11-09'`,
        ).toHaveLength(0);
      } finally {
        await db.close();
      }
    },
  );
}

test("money pages meet metadata, table, FAQ, class coverage and internal-link requirements", () => {
  const prior = [editorial, sqlFile("0024_forever_systems.sql")].flatMap((sql) =>
    guidesFromMigration(sql),
  ) as Record<string, unknown>[];
  const raw = guidesFromMigration(migration()) as Record<string, unknown>[];
  const bundle = validateGuideBundle([
    ...new Map([...prior, ...raw].map((doc) => [doc.slug, doc])).values(),
  ]);
  expect(raw.map((doc) => doc.slug)).toEqual([...additions, gold]);
  const pages = bundle.filter((doc) => raw.some((r) => r.slug === doc.slug));
  for (const doc of pages) {
    expect(doc.title.length + " | Unbored".length).toBeLessThanOrEqual(60);
    expect(doc.description.length).toBeGreaterThanOrEqual(120);
    expect(doc.description.length).toBeLessThanOrEqual(155);
    expect(doc.asOf?.date).toBe("2026-11-09");
    expect(doc.game).toBe("forever");
    expect(doc.hero).toBeUndefined();
    expect(JSON.stringify(doc.blocks)).not.toContain("—");
    if (doc.slug === gold) continue;
    expect(doc.blocks.some((b) => b.type === "table")).toBe(true);
    const faq = doc.blocks.filter((b) => b.type === "faq");
    expect(faq).toHaveLength(1);
    expect(faq[0]!.entries.length).toBeGreaterThanOrEqual(doc.slug === "wow-forever-faq" ? 6 : 3);
    expect(faq[0]!.entries.length).toBeLessThanOrEqual(doc.slug === "wow-forever-faq" ? 8 : 6);
    for (const href of ["/forever", "/guides/wow-forever-beginners-guide"])
      expect(doc.blocks.some((b) => b.type === "link" && b.href === href)).toBe(true);
  }
  const professions = pages.find((doc) => doc.slug === additions[1])!;
  const table = professions.blocks.find((b) => b.type === "table")!;
  expect(table.rows.map((row) => row[0])).toEqual([
    "Druid",
    "Hunter",
    "Mage",
    "Paladin",
    "Priest",
    "Rogue",
    "Shaman",
    "Warlock",
    "Warrior",
  ]);
  const money = [additions[0]!, additions[1]!, gold];
  for (const slug of money) {
    const doc = pages.find((p) => p.slug === slug)!;
    for (const sibling of money.filter((s) => s !== slug))
      expect(doc.blocks.some((b) => b.type === "link" && b.href === `/guides/${sibling}`)).toBe(
        true,
      );
  }
  const oldGold = prior.find((doc) => doc.slug === gold)!;
  const newGold = pages.find((doc) => doc.slug === gold)!;
  const blocks = oldGold.blocks as { type: string; text?: string }[];
  const retained = blocks.filter(
    (block) =>
      !block.text?.startsWith("A {{term:waylaid-crate|") &&
      !block.text?.startsWith("For a concrete example,") &&
      !block.text?.startsWith("For Horde, deliver"),
  );
  for (const block of retained) expect(newGold.blocks).toContainEqual(block);
});
