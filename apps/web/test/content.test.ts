import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { test } from "vite-plus/test";

import { connectPostgres, migrate } from "../../server/src/postgres.ts";
import { readHome, readPublished } from "../server/utils/content.ts";

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

    await assert.rejects(
      sql`
        INSERT INTO content.paths
          (kind, slug, locale, title, description, version, status, body, updated_at, published_at)
        VALUES
          ('collection', 'first-mounts', 'en', 'Again', 'Again.', 2, 'published',
           '{"blocks":[]}'::jsonb, 1762300002, 1762300002)`,
    );
  } finally {
    await sql.end();
    await root.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await root.end();
  }
});
