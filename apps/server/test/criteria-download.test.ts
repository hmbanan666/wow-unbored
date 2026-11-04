import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";

test("download errors and oversized CSV streams fail without caching them", async () => {
  const { existsSync } = await import("node:fs");
  const { cachedCsv } = await import("../src/criteria.ts");
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  try {
    await assert.rejects(
      cachedCsv(
        dir,
        "bad.csv",
        "https://example.test",
        async () => new Response("down", { status: 503 }),
      ),
      /503/,
    );
    let cancelled = false;
    await assert.rejects(
      cachedCsv(
        dir,
        "big.csv",
        "https://example.test",
        async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                controller.enqueue(new Uint8Array(1_000_001));
              },
              cancel() {
                cancelled = true;
              },
            }),
          ),
      ),
      /cache limit/,
    );
    assert.equal(cancelled, true);
    assert.equal(existsSync(path.join(dir, "big.csv")), false);
    assert.equal(existsSync(path.join(dir, "bad.csv")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
