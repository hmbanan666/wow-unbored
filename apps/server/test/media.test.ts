import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { MediaResolver, mediaUrl } from "../src/media.ts";

const cdn = "https://render.worldofwarcraft.com/eu";
const documents: Record<string, unknown> = {
  "mount/460": { name: "Yak", creature_displays: [{ id: 42703 }] },
  "pet/1890": { name: "Cat", icon: `${cdn}/icons/56/1339013.jpg`, creature: { id: 42 } },
  "creature/42": { creature_displays: [{ id: 42703 }] },
  "media/creature-display/42703": {
    assets: [{ key: "zoom", value: `${cdn}/npcs/zoom/creature-display-42703.jpg` }],
  },
  "media/item/84101": {
    assets: [{ key: "icon", value: `${cdn}/icons/56/616692.jpg`, file_data_id: 616692 }],
  },
  "media/achievement/6": { assets: [{ key: "icon", value: `${cdn}/icons/56/616692.jpg` }] },
  "toy/1131": { item: { id: 84101 }, media: { id: 999 } },
  "media/journal-instance/100": { assets: [{ key: "tile", value: `${cdn}/zones/test-small.jpg` }] },
};

test("resolver follows the documented media endpoints and authored overrides", async () => {
  const calls: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("namespace"), "static-eu");
    assert.equal(url.searchParams.get("locale"), "en_US");
    assert.equal(init?.redirect, "error");
    const key = url.pathname.replace("/data/wow/", "");
    calls.push(key);
    assert.ok(key in documents, key);
    return Response.json(documents[key]);
  };
  const resolver = new MediaResolver("eu", { accessToken: async () => "test" }, fake);
  assert.deepEqual(
    (await resolver.resolve({ kind: "mount", id: 460, media: { icon: 123 } })).map((a) => [
      a.role,
      a.url,
    ]),
    [
      ["icon", `${cdn}/icons/56/123.jpg`],
      ["render", `${cdn}/npcs/zoom/creature-display-42703.jpg`],
    ],
  );
  assert.equal((await resolver.resolve({ kind: "pet", id: 1890 })).length, 2);
  for (const [kind, id] of [
    ["achievement", 6],
    ["item", 84101],
    ["toy", 1131],
  ] as const) {
    assert.equal((await resolver.resolve({ kind, id }))[0].url, `${cdn}/icons/56/616692.jpg`);
  }
  assert.equal((await resolver.resolve({ kind: "instance", id: 100 }))[0].role, "tile");
  const before = calls.length;
  assert.deepEqual(await resolver.resolve({ kind: "currency", id: 3008 }), []);
  assert.equal(
    (await resolver.resolve({ kind: "currency", id: 3008, media: { icon: 321 } }))[0].url,
    `${cdn}/icons/56/321.jpg`,
  );
  assert.equal(calls.length, before);
  calls.length = 0;
  await resolver.resolve({ kind: "mount", id: 460, media: { display: 42703 } });
  assert.deepEqual(calls, ["media/creature-display/42703"]);
});

test("media URL allowlist rejects lookalikes, credentials, non-HTTPS and ports", () => {
  for (const url of [
    "http://render.worldofwarcraft.com/a",
    "https://render.worldofwarcraft.com.evil.test/a",
    "https://example.com/a",
    "https://user@eu.api.blizzard.com/a",
    "https://eu.api.blizzard.com:444/a",
    "file:///tmp/a",
  ])
    assert.throws(() => mediaUrl(url));
  for (const url of [`${cdn}/a`, "https://eu.api.blizzard.com/a", "https://oauth.battle.net/token"])
    assert.equal(mediaUrl(url), url);
});

test("conversion writes hashed AVIF/WebP variants atomically without enlarging icons", async () => {
  const { default: sharp } = await import("sharp");
  const { mkdtemp, readdir, rm, readFile } = await import("node:fs/promises");
  const { convertMedia } = await import("../src/media-files.ts");
  const dir = await mkdtemp(`${import.meta.dirname}/.media-test-`);
  try {
    const bytes = await sharp({ create: { width: 56, height: 56, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const asset = await convertMedia(bytes, "icon", dir);
    assert.equal(asset.hash, "8d691f026b512e44");
    assert.deepEqual(
      asset.variants.map((v) => [v.width, v.height, v.format]),
      [
        [56, 56, "avif"],
        [56, 56, "webp"],
      ],
    );
    for (const v of asset.variants) {
      assert.equal(v.file, `${asset.hash}-56.${v.format}`);
      assert.equal((await sharp(await readFile(`${dir}/${v.file}`)).metadata()).width, 56);
    }
    assert.deepEqual(await convertMedia(bytes, "icon", dir), asset);
    assert.equal((await readdir(dir)).length, 2);
    const render = await convertMedia(bytes, "render", dir);
    assert.deepEqual(
      render.variants.map((v) => v.width),
      [320, 320, 640, 640],
    );
    const tile = await convertMedia(bytes, "tile", dir);
    assert.deepEqual(
      tile.variants.map((v) => v.width),
      [300, 300, 600, 600],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("downloads reject disallowed sources, oversized streams and redirects", async () => {
  const { downloadMedia, MediaMissing } = await import("../src/media.ts");
  let calls = 0;
  const fake: typeof fetch = async () => {
    calls++;
    return new Response("12345");
  };
  await assert.rejects(downloadMedia("https://example.com/image.jpg", fake));
  assert.equal(calls, 0);
  await assert.rejects(downloadMedia(`${cdn}/a`, fake, {}, 4), /size limit/);
  await assert.rejects(
    downloadMedia(`${cdn}/a`, async () => new Response(null, { status: 404 })),
    MediaMissing,
  );
  await assert.rejects(
    downloadMedia(
      `${cdn}/a`,
      async () =>
        new Response(null, { status: 302, headers: { location: "https://example.com/a" } }),
    ),
  );
});

test("renders trim the flat border before resizing and content hashes identify source bytes", async () => {
  const { default: sharp } = await import("sharp");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { convertMedia } = await import("../src/media-files.ts");
  const dir = await mkdtemp(`${import.meta.dirname}/.media-trim-`);
  try {
    const subject = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "black" },
    })
      .composite([{ input: subject, left: 10, top: 10 }])
      .png()
      .toBuffer();
    const render = await convertMedia(bytes, "render", dir);
    assert.deepEqual(
      render.variants.map((v) => [v.width, v.height]),
      [
        [320, 160],
        [320, 160],
        [640, 320],
        [640, 320],
      ],
    );
    const icon = await convertMedia(bytes, "icon", dir);
    assert.equal(icon.width, 40);
    assert.equal(icon.hash, render.hash);
    const changed = await convertMedia(subject, "icon", dir);
    assert.notEqual(changed.hash, render.hash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing render document does not discard a pet's surviving icon", async () => {
  const resolver = new MediaResolver("eu", { accessToken: async () => "test" }, async (input) => {
    const url = String(input);
    if (url.includes("/pet/")) return Response.json(documents["pet/1890"]);
    if (url.includes("/creature/")) return Response.json(documents["creature/42"]);
    return new Response(null, { status: 404 });
  });
  assert.deepEqual(
    (await resolver.resolve({ kind: "pet", id: 1890 })).map((asset) => asset.role),
    ["icon"],
  );
});
