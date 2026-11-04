import { expect, test } from "vite-plus/test";
import { gunzipSync } from "node:zlib";
import { compressPublicHtml } from "../server/utils/html-compression";

const html = "<!doctype html><h1>Companions for the road</h1>" + "<p>Golden yak</p>".repeat(100);
const response = () => ({
  body: html as string | Buffer,
  headers: {
    "content-type": "text/html; charset=utf-8",
    vary: "Accept-Language",
    "content-length": String(Buffer.byteLength(html)),
  } as Record<string, string>,
});

test("public SSR compresses negotiated HTML, preserves its text and varies caches", async () => {
  const page = response();
  await compressPublicHtml(page, "/collections/first-mounts", "GET", "br, gzip");
  expect(page.headers["content-encoding"]).toBe("gzip");
  expect(page.headers.vary).toBe("Accept-Language, Accept-Encoding");
  expect(page.headers["content-length"]).toBeUndefined();
  expect(gunzipSync(page.body).toString()).toBe(html);
  expect(page.body.length).toBeLessThan(html.length / 2);
});

test("identity clients share the Vary policy; excluded encodings and private routes stay untouched", async () => {
  for (const accept of ["", "br", "gzip;q=0", "gzip;q=0.000"]) {
    const page = response();
    await compressPublicHtml(page, "/guides/yak", "GET", accept);
    expect(page.body).toBe(html);
    expect(page.headers["content-encoding"]).toBeUndefined();
    expect(page.headers.vary).toContain("Accept-Encoding");
  }
  for (const path of ["/my", "/enter/one-time", "/api/catalog", "/media/file.webp"]) {
    const page = response();
    await compressPublicHtml(page, path, "GET", "gzip");
    expect(page).toEqual(response());
  }
  const encoded = response();
  encoded.headers["content-encoding"] = "br";
  await compressPublicHtml(encoded, "/paths/yak", "GET", "gzip");
  expect(encoded.body).toBe(html);
  expect(encoded.headers["content-encoding"]).toBe("br");
});
