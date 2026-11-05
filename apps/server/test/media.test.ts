import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { mediaHash, MEDIA_PIPELINE } from "../src/media-files.ts";
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
  "media/journal-instance/100": { assets: [{ key: "tile", value: `${cdn}/zones/test-small.jpg` }] },
};

// Content stores toys by item id, so a toy reads /media/item/{itemId} like an item.
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
    ["toy", 84101],
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
    assert.equal(asset.hash, mediaHash(bytes));
    assert.notEqual(asset.hash, "8d691f026b512e44", "legacy immutable filenames are never reused");
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
      [56, 56],
    );
    const tile = await convertMedia(bytes, "tile", dir);
    assert.deepEqual(
      tile.variants.map((v) => v.width),
      [56, 56],
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

test("renders retain their full frame, aspect ratio and border without upscaling", async () => {
  const { default: sharp } = await import("sharp");
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { convertMedia } = await import("../src/media-files.ts");
  const dir = await mkdtemp(`${import.meta.dirname}/.media-frame-`);
  try {
    const subject = await sharp({
      create: { width: 180, height: 120, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    for (const height of [600, 450]) {
      const bytes = await sharp({
        create: { width: 600, height, channels: 3, background: "#181818" },
      })
        .composite([{ input: subject, left: 180, top: 120 }])
        .png()
        .toBuffer();
      const render = await convertMedia(bytes, "render", dir);
      assert.deepEqual(
        render.variants.map((v) => [v.width, v.height]),
        [
          [320, (height * 320) / 600],
          [320, (height * 320) / 600],
          [600, height],
          [600, height],
        ],
      );
      for (const variant of render.variants) {
        const { data, info } = await sharp(await readFile(`${dir}/${variant.file}`))
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        assert.equal(info.width, variant.width);
        assert.equal(info.height, variant.height);
        const pixel = (x: number, y: number) =>
          Array.from(
            data.subarray(
              (y * info.width + x) * info.channels,
              (y * info.width + x) * info.channels + 3,
            ),
          );
        const scale = info.width / 600;
        for (const [x, y] of [
          [30, 30],
          [570, 30],
          [30, height - 30],
          [570, height - 30],
        ])
          assert.ok(
            pixel(Math.round(x * scale), Math.round(y * scale)).every((v) => Math.abs(v - 24) < 8),
            "full dark border survives encoding",
          );
        const center = pixel(Math.round(270 * scale), Math.round(180 * scale));
        assert.ok(
          center[0] > 230 && center[1] < 20 && center[2] < 20,
          "subject keeps its original position and color",
        );
      }
    }
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

test("content hashes change with pipeline version as well as source bytes", () => {
  const bytes = Buffer.from("source bytes");
  assert.notEqual(mediaHash(bytes, 1), mediaHash(bytes, 2));
  assert.equal(mediaHash(bytes), mediaHash(bytes, MEDIA_PIPELINE));
  assert.equal(mediaHash(Buffer.from("source bytes")), mediaHash(bytes));
  assert.notEqual(mediaHash(Buffer.from("different bytes")), mediaHash(bytes));
});

test("ADR 0077 keeps fitting out of the media pipeline", async () => {
  const { readFile } = await import("node:fs/promises");
  const adr = await readFile(
    new URL("../../../docs/adr/0077-game-media.md", import.meta.url),
    "utf8",
  );
  assert.ok(
    adr.includes(
      "The pipeline only compresses, converts and resizes; it never crops, trims, keys, recolors or otherwise edits an image. Fitting an image into a frame is the site's job (CSS object-fit).",
    ),
  );
  assert.ok(!adr.includes("background trimmed"));
});

test("large sources resize to role widths without applying orientation or flattening transparency", async () => {
  const { default: sharp } = await import("sharp");
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { convertMedia } = await import("../src/media-files.ts");
  const dir = await mkdtemp(`${import.meta.dirname}/.media-orientation-`);
  try {
    const bytes = await sharp({
      create: {
        width: 800,
        height: 400,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();
    for (const role of ["icon", "render", "tile", "image"] as const) {
      const asset = await convertMedia(bytes, role, dir);
      const widths =
        role === "icon" ? [56, 56] : role === "tile" ? [300, 300, 600, 600] : [320, 320, 640, 640];
      assert.deepEqual(
        asset.variants.map((v) => v.width),
        widths,
      );
      for (const variant of asset.variants) {
        assert.equal(variant.height, variant.width / 2);
        const { data, info } = await sharp(await readFile(`${dir}/${variant.file}`))
          .raw()
          .toBuffer({ resolveWithObject: true });
        assert.equal(info.width, variant.width);
        assert.equal(info.height, variant.height);
        assert.equal(info.channels, 4);
        assert.ok(Math.abs(data[3] - 128) < 3, "encoding preserves alpha");
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
