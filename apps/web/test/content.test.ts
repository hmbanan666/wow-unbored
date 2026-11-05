import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { test, vi } from "vite-plus/test";

import { connectPostgres, migrate } from "../../server/src/postgres.ts";
import { closeDb } from "../server/utils/db.ts";
import { readHome, readPublished, listPublished } from "../server/utils/content.ts";

const adminUrl = process.env.UNBORED_WEB_TEST_DATABASE_URL?.trim();
const dbTest = test.skipIf(!adminUrl);

dbTest("home, paths and collections are published rows, drafts stay hidden", async () => {
  const root = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  const name = `unbored_web_${randomBytes(4).toString("hex")}`;
  await root.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const sql = connectPostgres(url.toString(), { max: 2 });
  try {
    await migrate(sql);
    const home = await readHome(sql);
    assert.equal(home?.headline, "Bored? Bory's got a plan.");
    assert.equal(home?.kind, "page");
    assert.equal(home?.blocks.at(-1)?.type, "link");

    const published = JSON.stringify({ blocks: [{ type: "paragraph", text: "Start here." }] });
    const draft = JSON.stringify({ blocks: [{ type: "paragraph", text: "Not yet." }] });
    await sql`
      INSERT INTO content.paths
        (kind, slug, locale, title, description, tier, version, status, body, updated_at, published_at)
      VALUES
        ('path', 'midnight-basic', 'en', 'Midnight: Basic', 'The first goals.', 'basic', 1,
         'published', ${published}::jsonb, 1762300000, 1762300000),
        ('collection', 'first-mounts', 'en', 'Mounts to get first', 'A short list.', NULL, 1,
         'draft', ${draft}::jsonb, 1762300000, NULL)`;

    const path = await readPublished(sql, "path", "midnight-basic");
    assert.equal(path?.headline, "Midnight: Basic");
    assert.equal(path?.tier, "basic");
    assert.equal(path?.blocks[0]?.type === "paragraph" && path.blocks[0].text, "Start here.");
    assert.equal(await readPublished(sql, "collection", "first-mounts"), undefined);

    await sql`
      UPDATE content.paths SET status = 'published', published_at = 1762300001
      WHERE kind = 'collection' AND slug = 'first-mounts'`;
    const collection = await readPublished(sql, "collection", "first-mounts");
    assert.equal(collection?.kind, "collection");
    assert.equal(collection?.tier, null);

    const body = {
      hero: { kind: "mount", id: 460 },
      blocks: [
        { type: "paragraph", text: "Try [[pet:1890]]." },
        { type: "figure", image: "fedcba9876543210", alt: "Our screenshot" },
      ],
      items: Array.from({ length: 8 }, (_, index) => ({
        kind: "item",
        id: index + 1,
        name: `Item ${index + 1}`,
        source: { type: "vendor", text: "A vendor" },
        note: "Visit.",
        chance: false,
        media: { icon: 123 },
      })),
    };
    const variants = [{ file: "0123456789abcdef-56.webp", width: 56, height: 56, format: "webp" }];
    for (const [kind, id, role] of [
      ["mount", 460, "render"],
      ["pet", 1890, "icon"],
      ...body.items.map((item) => [item.kind, item.id, "icon"]),
    ] as [string, number, string][]) {
      await sql`INSERT INTO content.media (ref_kind, ref_id, role, source, source_url, hash, width, height, variants, name, alt, fetched_at, checked_at)
        VALUES (${kind}, ${id}, ${role}, 'blizzard', 'https://render.worldofwarcraft.com/eu/icon.jpg', '0123456789abcdef', 56, 56, ${JSON.stringify(variants)}::jsonb, 'Game name', 'Game art', 1, 1)`;
    }
    await sql`INSERT INTO content.media (ref_kind, role, source, hash, width, height, variants, alt, fetched_at, checked_at)
      VALUES ('screenshot', 'image', 'own', 'fedcba9876543210', 56, 56, ${JSON.stringify(variants)}::jsonb, 'Our screenshot', 1, 1)`;
    await sql`UPDATE content.paths SET body = ${JSON.stringify(body)}::jsonb WHERE slug = 'first-mounts'`;
    const page = await readPublished(sql, "collection", "first-mounts");
    assert.deepEqual(page?.hero, body.hero);
    assert.equal(page?.media["mount:460"].render?.width, 56);
    assert.equal(page?.media["pet:1890"].icon?.name, "Game name");
    assert.equal(page?.media["image:fedcba9876543210"].image?.alt, "Our screenshot");
    assert.deepEqual(page?.items[0].media, { icon: 123 });
    const sources = [
      { label: "Launch notes", url: "https://example.com/launch", accessed: "2026-11-05" },
    ];
    const asOf = { date: "2026-11-05", build: "1.60.1.x", note: "Launch build." };
    const forever = {
      blocks: [{ type: "callout", tone: "forecast", text: "Early forecasts." }],
      sources,
      asOf,
    };
    await sql`INSERT INTO content.paths (game, kind, slug, locale, title, description, version, status, body, updated_at)
      VALUES ('forever', 'guide', 'forever-start', 'en', 'Forever start', 'Where to start.', 1, 'published', ${JSON.stringify(forever)}::jsonb, 1),
        ('retail', 'guide', 'retail-start', 'en', 'Retail start', 'Where to start.', 1, 'published', '{}'::jsonb, 1),
        ('forever', 'guide', 'forever-draft', 'en', 'Draft', 'Not ready.', 1, 'draft', '{}'::jsonb, 1)`;
    const guide = await readPublished(sql, "guide", "forever-start");
    assert.equal(guide?.game, "forever");
    assert.deepEqual(guide?.sources, sources);
    assert.deepEqual(guide?.asOf, asOf);
    assert.deepEqual(guide?.blocks, forever.blocks);
    assert.deepEqual(guide?.media, {});
    assert.equal(guide?.build, null);
    assert.equal((await readPublished(sql, "guide", "retail-start"))?.game, "retail");
    assert.deepEqual(
      (await listPublished(sql, "guide", "forever")).map((p) => p.href),
      ["/guides/forever-start"],
    );
    assert.deepEqual(
      (await listPublished(sql, "guide", "retail")).map((p) => p.href),
      ["/guides/retail-start"],
    );
    assert.equal((await listPublished(sql, "guide")).length, 2);
    assert.equal((await listPublished(sql, "guide", "forever"))[0].game, "forever");
    vi.stubEnv("DATABASE_URL", url.toString());
    vi.stubGlobal("defineSitemapEventHandler", (handler: unknown) => handler);
    const { default: sitemap } = await import("../server/api/__sitemap__/urls.ts");
    const locations = (await (sitemap as unknown as () => Promise<{ loc: string }[]>)()).map(
      (entry) => entry.loc,
    );
    assert.ok(locations.includes("/forever"));
    assert.ok(locations.includes("/guides/forever-start"));
    assert.ok(locations.includes("/guides/retail-start"));
    assert.ok(!locations.includes("/guides/forever-draft"));
    const cards = await listPublished(sql, "collection");
    assert.deepEqual(
      cards[0].icons.map((icon) => icon.id),
      [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(cards[0].icons[0].icon.variants, variants);

    await assert.rejects(
      sql`
        INSERT INTO content.paths
          (kind, slug, locale, title, description, version, status, body, updated_at, published_at)
        VALUES
          ('collection', 'first-mounts', 'en', 'Again', 'Again.', 2, 'published',
           '{"blocks":[]}'::jsonb, 1762300002, 1762300002)`,
    );
  } finally {
    await closeDb();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await sql.end();
    await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await root.end();
  }
});
