import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, readdir, utimes } from "node:fs/promises";
import sharp from "sharp";
import { test } from "vite-plus/test";
import { hasPostgres, testDatabase } from "./postgres-db.ts";
import { PostgresDb } from "../src/db.ts";
import { MediaResolver } from "../src/media.ts";
import { MediaStore } from "../src/media-store.ts";
import { MEDIA_PIPELINE } from "../src/media-files.ts";

test.skipIf(!hasPostgres)(
  "media sync deduplicates sources, refresh deletes missing art, own images survive and gc observes grace",
  async () => {
    const database = await testDatabase();
    const dir = await mkdtemp(`${import.meta.dirname}/.media-store-`);
    const bytes = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    let downloads = 0;
    let missing = false;
    const fake: typeof fetch = async (url) => {
      if (missing) return new Response(null, { status: 404 });
      if (String(url).includes("api.blizzard.com"))
        return Response.json({
          assets: [{ key: "icon", value: "https://render.worldofwarcraft.com/eu/icons/56/1.jpg" }],
        });
      downloads++;
      return new Response(bytes);
    };
    let now = 2_000_000_000;
    const store = new MediaStore(
      new PostgresDb(database.sql),
      new MediaResolver("eu", { accessToken: async () => "test" }, fake),
      dir,
      fake,
      () => now,
    );
    try {
      const body = {
        items: [
          { kind: "item", id: 1, name: "First" },
          { kind: "item", id: 2, name: "Second" },
        ],
      };
      await store.syncPage(body);
      assert.equal(downloads, 1);
      await store.syncPage(body);
      assert.equal(downloads, 1);
      const rows = await database.sql`SELECT * FROM content.media ORDER BY ref_id`;
      assert.equal(rows.length, 2);
      assert.equal(rows[0].alt, "First, a World of Warcraft item");
      const own = await store.addImage(bytes, "screenshot", "Our screenshot");
      assert.match(own, /^[0-9a-f]{16}$/);
      const [ownRow] =
        await database.sql`SELECT pipeline_version FROM content.media WHERE source = 'own'`;
      assert.equal(ownRow.pipeline_version, MEDIA_PIPELINE);
      now += 26 * 86400;
      missing = true;
      await store.refresh();
      assert.equal(
        (await database.sql`SELECT * FROM content.media WHERE source = 'blizzard'`).length,
        0,
      );
      assert.equal(
        (await database.sql`SELECT * FROM content.media WHERE source = 'own'`).length,
        1,
      );
      assert.equal(await store.gc(), 0);
      for (const file of await readdir(dir)) await utimes(`${dir}/${file}`, 1, 1);
      assert.equal(await store.gc(), 2);
      assert.equal((await readdir(dir)).length, 2);
    } finally {
      await store.stop();
      await database.drop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(!hasPostgres)(
  "publication returns while media download is pending, for HTTP and MCP",
  async () => {
    const { createApp } = await import("../src/app.ts");
    const database = await testDatabase();
    const dir = await mkdtemp(`${import.meta.dirname}/.media-publish-`);
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredDownload = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const server = createApp({
      dataDir: dir,
      database: database.sql,
      companionToken: "c",
      plannerToken: "p",
      log: () => {},
      mediaDir: `${dir}/media`,
      blizzard: { clientId: "fixture", clientSecret: "fixture", region: "eu" },
      blizzardFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "fixture", expires_in: 3600 }),
      }),
      mediaFetch: async () => {
        calls++;
        entered!();
        await blocked;
        return new Response(null, { status: 503 });
      },
    });
    try {
      const body = JSON.stringify({
        blocks: [{ type: "paragraph", text: "[[item:1]]" }],
        items: [],
        build: "12.0.1.66337",
      });
      await database.sql`INSERT INTO content.paths (kind, slug, locale, title, description, version, status, body, updated_at, published_at)
      VALUES ('guide', 'media-test', 'en', 'Media test', 'A test.', 1, 'published', ${body}::jsonb, 1, 1)`;
      const response = await server.app.request("/owner/content/guide/media-test/publish", {
        method: "POST",
        headers: { authorization: "Bearer p" },
      });
      assert.equal(response.status, 200);
      await enteredDownload;
      const rpc = await server.app.request("/mcp", {
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
          params: { name: "publish_content", arguments: { kind: "guide", slug: "media-test" } },
        }),
      });
      assert.equal(rpc.status, 200);
      assert.equal((await rpc.json()).result.isError, false);
      assert.equal(calls, 1, "one bounded worker is still waiting while both publishes return");
    } finally {
      release!();
      await server.close();
      await database.drop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(!hasPostgres)(
  "refresh renews stale bytes and retains transient failures only within 30 days",
  async () => {
    const database = await testDatabase();
    const dir = await mkdtemp(`${import.meta.dirname}/.media-refresh-`);
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    let now = 2_000_000_000;
    let unavailable = false;
    let downloads = 0;
    const fake: typeof fetch = async () => {
      downloads++;
      return unavailable ? new Response(null, { status: 503 }) : new Response(bytes);
    };
    const store = new MediaStore(
      new PostgresDb(database.sql),
      new MediaResolver("eu", { accessToken: async () => "test" }, fake),
      dir,
      fake,
      () => now,
    );
    try {
      await store.syncPage({
        items: [{ kind: "currency", id: 1, name: "Coin", media: { icon: 99 } }],
      });
      now += 24 * 86400;
      await store.syncPage({
        items: [{ kind: "currency", id: 2, name: "Other coin", media: { icon: 99 } }],
      });
      assert.equal(downloads, 1, "a new reference reuses still-fresh source bytes");
      now += 2 * 86400;
      await store.refresh();
      assert.equal(downloads, 2);
      const [renewed] = await database.sql`SELECT fetched_at, checked_at FROM content.media`;
      assert.equal(renewed.fetched_at, now);
      assert.equal(renewed.checked_at, now);
      assert.ok(
        (await database.sql`SELECT fetched_at FROM content.media`).every(
          (row) => row.fetched_at === now,
        ),
      );
      unavailable = true;
      now += 26 * 86400;
      await store.refresh();
      assert.equal((await database.sql`SELECT * FROM content.media`).length, 2);
      now += 5 * 86400;
      await store.refresh();
      assert.equal((await database.sql`SELECT * FROM content.media`).length, 0);
    } finally {
      await store.stop();
      await database.drop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(!hasPostgres)(
  "sync replaces fresh legacy conversions, reuses only current files and leaves old files for gc",
  async () => {
    const database = await testDatabase();
    const dir = await mkdtemp(`${import.meta.dirname}/.media-pipeline-`);
    const bytes = await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#181818" },
    })
      .png()
      .toBuffer();
    let downloads = 0;
    const fake: typeof fetch = async (url) => {
      if (String(url).includes("api.blizzard.com"))
        return Response.json({
          assets: [{ key: "zoom", value: "https://render.worldofwarcraft.com/eu/npcs/test.jpg" }],
        });
      downloads++;
      return new Response(bytes);
    };
    const store = new MediaStore(
      new PostgresDb(database.sql),
      new MediaResolver("eu", { accessToken: async () => "test" }, fake),
      dir,
      fake,
      () => 2_000_000_000,
    );
    try {
      const items = [
        { kind: "mount", id: 1, name: "First", media: { display: 99 } },
        { kind: "mount", id: 2, name: "Second", media: { display: 99 } },
      ];
      await store.syncPage({ items });
      assert.equal(downloads, 1);
      const [current] = await database.sql`SELECT * FROM content.media LIMIT 1`;
      const legacyFiles = [];
      for (const variant of current.variants) {
        const file = variant.file.replace(current.hash, "1111111111111111");
        await copyFile(`${dir}/${variant.file}`, `${dir}/${file}`);
        await utimes(`${dir}/${file}`, 1, 1);
        legacyFiles.push({ ...variant, file });
      }
      await database.sql`UPDATE content.media SET pipeline_version = CASE WHEN ref_id = 1 THEN NULL ELSE 1 END,
        hash = '1111111111111111', variants = ${database.sql.json(legacyFiles)}`;
      await store.syncPage({ items: [items[0]] });
      assert.equal(downloads, 2, "fresh legacy rows cannot supply cached conversions");
      let rows = await database.sql`SELECT * FROM content.media ORDER BY ref_id`;
      assert.equal(rows[0].pipeline_version, MEDIA_PIPELINE);
      assert.equal(rows[1].pipeline_version, 1);
      // The unscoped command also upgrades stored art no published page currently references.
      await store.syncPublished();
      assert.equal(downloads, 2, "the second reference reuses the new conversion");
      rows = await database.sql`SELECT * FROM content.media ORDER BY ref_id`;
      for (const row of rows) {
        assert.equal(row.pipeline_version, MEDIA_PIPELINE);
        assert.equal(row.hash, current.hash);
        assert.equal(row.width, 600);
        assert.equal(row.height, 600);
        assert.deepEqual(row.variants, current.variants);
      }
      await store.syncPage({ items });
      assert.equal(downloads, 2, "current fresh rows need no download");
      for (const { file } of legacyFiles) assert.ok((await readdir(dir)).includes(file));
      assert.equal(await store.gc(), legacyFiles.length);
      for (const { file } of legacyFiles) assert.ok(!(await readdir(dir)).includes(file));
    } finally {
      await store.stop();
      await database.drop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
