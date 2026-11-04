import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { test } from "vite-plus/test";
import { serveMedia } from "../server/utils/media-file.ts";

test("media streams valid files with immutable caching and all misses have short caching", async () => {
  const directory = await mkdtemp(".scratch/web-media-");
  try {
    const file = "0123456789abcdef-56.webp";
    await writeFile(`${directory}/${file}`, "image bytes");
    const good = await serveMedia(file, directory);
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("content-type"), "image/webp");
    assert.equal(good.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(await good.text(), "image bytes");
    for (const bad of [
      "bad.jpg",
      "../" + file,
      "%2e%2e%2f" + file,
      file + "/..",
      "0123456789abcdef-56.avif",
      "/" + file,
      "0123456789abcdef-1.webp",
    ]) {
      const response = await serveMedia(bad, directory);
      assert.equal(response.status, 404, bad);
      assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
