import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test, vi } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { GAME_WATCH_INTERVAL_MS } from "../src/game-watch.ts";
import { BACKENDS, postgresPerFile, type Backend } from "./postgres-db.ts";

const pg = postgresPerFile();
const oldBuild = "12.0.1.66337";
const newBuild = "12.0.1.66338";

function setup(backend: Backend, directory?: string) {
  const dataDir = directory ?? mkdtempSync(path.join(import.meta.dirname, ".game-watch-"));
  const source = {
    build: oldBuild,
    broken: false,
    downloads: 0,
    discovery: undefined as (() => Response) | undefined,
    wait: undefined as Promise<void> | undefined,
  };
  const app = createApp({
    database: pg(backend),
    ingest: "inline",
    dataDir,
    companionToken: "companion",
    plannerToken: "owner",
    blizzard: null,
    webhook: { url: "", key: "", headerName: "" },
    log: () => {},
    gameDbFetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/builds/wow/latest")
        return source.discovery?.() ?? Response.json({ product: "wow", version: source.build });
      assert.equal(url.origin + url.pathname, "https://wago.tools/db2/Achievement/csv");
      source.downloads++;
      await source.wait;
      if (source.broken) return new Response("Unavailable", { status: 503 });
      const version = url.searchParams.get("build");
      const name = url.searchParams.get("locale") === "ruRU" ? "Летим!" : "Going Down?";
      return new Response(`ID,Title_lang\n${version === oldBuild ? 964 : 6},${name}\n`);
    },
  });
  return {
    ...app,
    source,
    dataDir,
    async cleanup() {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

for (const backend of BACKENDS) {
  test(`restarting preserves the pending build and its original lag (${backend})`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T00:00:00Z"));
    const app = setup(backend);
    let restarted: ReturnType<typeof setup> | undefined;
    try {
      await app.gameWatch.run();
      app.source.build = newBuild;
      app.source.broken = true;
      await app.gameWatch.run();
      await app.close();
      vi.setSystemTime(new Date("2026-11-04T07:00:00Z"));
      restarted = setup(backend, app.dataDir);
      restarted.source.broken = true;
      // Even an older discovery response cannot conceal the failed newer build.
      await restarted.gameWatch.run();
      const status = (await (await restarted.app.request("/health")).json()).gameDb;
      assert.equal(status.build, oldBuild);
      assert.equal(status.liveBuild, newBuild);
      assert.equal(status.lagSeconds, 25200);
      assert.equal(status.lagging, true);
    } finally {
      if (restarted) await restarted.cleanup();
      else await app.cleanup();
      vi.useRealTimers();
    }
  });

  test(`discovery failures are visible without losing the last live build (${backend})`, async () => {
    const app = setup(backend);
    try {
      await app.gameWatch.run();
      for (const response of [
        () => new Response("Unavailable", { status: 503 }),
        () => Response.json({ product: "wowt", version: newBuild }),
        () => Response.json({ product: "wow", version: "latest" }),
        () => new Response("not JSON"),
        () =>
          new Response(`{"product":"wow","version":"${newBuild}","extra":"${"x".repeat(65536)}"}`),
      ]) {
        app.source.discovery = response;
        await app.gameWatch.run();
        const status = (await (await app.app.request("/health")).json()).gameDb;
        assert.equal(status.build, oldBuild);
        assert.equal(status.liveBuild, oldBuild);
        assert.equal(status.lastError, "discovery_failed");
      }
      assert.equal(app.source.downloads, 2);
    } finally {
      await app.cleanup();
    }
  });

  test(`startup checks immediately, retries hourly and stops scheduling on close (${backend})`, async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const app = setup(backend);
    try {
      app.gameWatch.start();
      await app.gameWatch.run();
      app.source.build = newBuild;
      app.source.broken = true;
      await vi.advanceTimersByTimeAsync(GAME_WATCH_INTERVAL_MS);
      await app.gameWatch.run();
      assert.equal((await app.store.game.entity("achievement", 964))?.build, oldBuild);
      app.source.broken = false;
      await vi.advanceTimersByTimeAsync(GAME_WATCH_INTERVAL_MS);
      await app.gameWatch.run();
      assert.equal((await app.store.game.entity("achievement", 6))?.build, newBuild);
      await app.gameWatch.stop();
      const downloads = app.source.downloads;
      app.source.build = "12.0.1.66339";
      await vi.advanceTimersByTimeAsync(GAME_WATCH_INTERVAL_MS);
      assert.equal(app.source.downloads, downloads);
    } finally {
      await app.cleanup();
      vi.useRealTimers();
    }
  });

  test(`readers retain the old complete build while an import is in flight (${backend})`, async () => {
    const app = setup(backend);
    let release!: () => void;
    try {
      await app.gameWatch.run();
      app.source.build = newBuild;
      app.source.wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = app.gameWatch.run();
      assert.equal(app.gameWatch.run(), first);
      await vi.waitFor(() => assert.equal(app.source.downloads, 4));
      assert.equal((await app.store.game.entity("achievement", 964))?.build, oldBuild);
      assert.equal(await app.store.game.entity("achievement", 6), undefined);
      let stopped = false;
      const stopping = app.gameWatch.stop().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      assert.equal(stopped, false);
      release();
      await stopping;
      assert.equal((await app.store.game.entity("achievement", 6))?.build, newBuild);
    } finally {
      release?.();
      await app.cleanup();
    }
  });

  test(`failed imports keep the old build and expose persistent lag through health and catalog (${backend})`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T00:00:00Z"));
    const app = setup(backend);
    const health = async () => (await (await app.app.request("/health")).json()).gameDb;
    try {
      assert.equal((await health()).build, null);
      await app.gameWatch.run();
      app.source.build = newBuild;
      app.source.broken = true;
      await app.gameWatch.run();
      assert.equal((await health()).lagging, false);
      vi.setSystemTime(new Date("2026-11-04T06:00:01Z"));
      await app.gameWatch.run();
      assert.equal((await app.store.game.entity("achievement", 964))?.build, oldBuild);
      const status = await health();
      assert.equal(status.build, oldBuild);
      assert.equal(status.liveBuild, newBuild);
      assert.equal(status.lagSeconds, 21601);
      assert.equal(status.lagging, true);
      assert.equal(status.lastError, "import_failed");
      const catalog = await app.app.request("/owner/data", {
        headers: { authorization: "Bearer owner" },
      });
      assert.deepEqual((await catalog.json()).gameDb, status);
      const response = await app.app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer owner",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "data_catalog", arguments: {} },
        }),
      });
      const body = await response.text();
      const rpc = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1].trim() : body);
      assert.deepEqual(JSON.parse(rpc.result.content[0].text).gameDb, status);
      app.source.broken = false;
      await app.gameWatch.run();
      assert.equal((await health()).build, newBuild);
      assert.equal((await health()).lagSeconds, 0);
      assert.equal((await health()).lastError, null);
    } finally {
      await app.cleanup();
      vi.useRealTimers();
    }
  });

  test(`the watcher imports a newer live build and switches all entity reads (${backend})`, async () => {
    const app = setup(backend);
    try {
      await app.gameWatch.run();
      assert.equal((await app.store.game.entity("achievement", 964))?.build, oldBuild);
      app.source.build = newBuild;
      await app.gameWatch.run();
      assert.equal(await app.store.game.entity("achievement", 964), undefined);
      assert.equal((await app.store.game.entity("achievement", 6))?.build, newBuild);
      await app.gameWatch.run();
      app.source.build = oldBuild;
      await app.gameWatch.run();
      assert.equal(app.source.downloads, 4);
      assert.equal((await app.store.game.entity("achievement", 6))?.build, newBuild);
    } finally {
      await app.cleanup();
    }
  });
}
