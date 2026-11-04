import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { test } from "vite-plus/test";
import { serveMedia } from "../server/utils/media-file.ts";

test("media streams valid files with immutable caching and all misses have short caching", async () => {
  const root = await mkdtemp(`${import.meta.dirname}/.web-media-`);
  const directory = `${root}/media`;
  await mkdir(directory);
  try {
    const file = "0123456789abcdef-56.webp";
    await writeFile(`${directory}/${file}`, "image bytes");
    await writeFile(`${root}/${file}`, "outside media");
    await writeFile(`${directory}/bad.jpg`, "not a variant");
    await writeFile(`${directory}/${file}\n`, "not a variant");
    const good = await serveMedia(file, directory);
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("content-type"), "image/webp");
    assert.equal(good.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(await good.text(), "image bytes");
    for (const bad of [
      "bad.jpg",
      file + "\n",
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
    await rm(root, { recursive: true, force: true });
  }
});
