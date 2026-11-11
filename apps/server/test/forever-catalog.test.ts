import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
import { coreResponse } from "./game-content-fixture.ts";

const pg = postgresPerFile();
const build = "1.60.1.70888";
export const foreverResponse: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const table = url.pathname.split("/")[2];
  assert.equal(url.searchParams.get("locale"), "enUS");
  return new Response(readFileSync(new URL(`./fixtures/forever/${table}.csv`, import.meta.url)));
};

for (const backend of BACKENDS) {
  test(`Forever catalog imports client links and thresholds independently of Retail (${backend})`, async () => {
    const dataDir = mkdtempSync(path.join(import.meta.dirname, ".forever-"));
    const app = createApp({
      database: pg(backend),
      dataDir,
      ingest: "inline",
      blizzard: null,
      companionToken: "companion",
      plannerToken: "owner",
      webhook: { url: "", key: "", headerName: "" },
      log: () => {},
    });
    try {
      await app.store.game.importBuild("12.0.1.66337", coreResponse);
      const healthBefore = await (await app.app.request("/health")).json();
      assert.equal(healthBefore.gameDb.forever.build, null);
      const game = app.store.game.forGame("forever");
      await game.importBuild(build, foreverResponse);
      const catalog = await game.professionCatalog(171);
      assert.equal(catalog.build, build);
      const health = await (await app.app.request("/health")).json();
      assert.equal(health.gameDb.build, "12.0.1.66337");
      assert.equal(health.gameDb.forever.build, build);
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
          params: {
            name: "get_profession_catalog",
            arguments: { game: "forever", skillLine: 171 },
          },
        }),
      });
      const body = await response.text();
      const rpc = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1].trim() : body);
      assert.deepEqual(JSON.parse(rpc.result.content[0].text), catalog);
      assert.equal(catalog.recipes.length, 4);
      assert.deepEqual(
        (await game.professionCatalog(185)).recipes.find((r) => r.spellId === 1225762)
          ?.teachingItems,
        [239021],
      );
      assert.deepEqual(
        (await game.professionCatalog(164)).recipes.find((r) => r.spellId === 2665)?.thresholds,
        { orange: 75, yellow: 40, green: 48, grey: 55 },
      );
      assert.deepEqual(
        catalog.recipes.find((r) => r.spellId === 2334),
        {
          spellId: 2334,
          skillLine: 171,
          name: "Elixir of Minor Fortitude",
          category: { id: 2450, name: "Elixirs", order: 30 },
          minSkill: 50,
          thresholds: { orange: 50, yellow: 80, green: 100, grey: 120 },
          skillUps: 1,
          acquireMethod: 0,
          reagents: [
            { itemId: 2449, count: 2 },
            { itemId: 2447, count: 1 },
            { itemId: 3371, count: 1 },
          ],
          craftedItems: [2458],
          teachingItems: [2554],
        },
      );
      await game.importBuild("1.60.1.70890", async (input) => {
        const response = await foreverResponse(input);
        if (String(input).includes("/SpellName/"))
          return new Response(
            (await response.text())
              .split("\n")
              .filter((line) => !line.startsWith("2334,"))
              .join("\n"),
          );
        return response;
      });
      assert.equal(
        (await game.professionCatalog(171)).recipes.find((r) => r.spellId === 2334)?.name,
        null,
      );
      assert.equal((await app.store.game.professionCatalog(171)).recipes.length, 0);
      assert.equal(await app.store.game.currentBuild(), "12.0.1.66337");
      assert.equal(await app.store.game.row("SpellName", 2334), undefined);
      assert.equal((await game.professionCatalog(6)).recipes.length, 0);
      await assert.rejects(
        game.importBuild("1.60.1.70889", async () => {
          throw new Error("offline");
        }),
      );
      assert.equal(await game.currentBuild(), "1.60.1.70890");
      assert.equal((await app.store.game.entity("achievement", 964))?.names.enUS, "Going Down?");
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
}

for (const backend of BACKENDS) {
  test(`watch and health keep independent live builds and lag when Forever fails (${backend})`, async () => {
    const dataDir = mkdtempSync(path.join(import.meta.dirname, ".forever-watch-"));
    let broken = false;
    let retail = "12.0.1.66337";
    let forever = build;
    const app = createApp({
      database: pg(backend),
      dataDir,
      ingest: "inline",
      blizzard: null,
      companionToken: "companion",
      plannerToken: "owner",
      webhook: { url: "", key: "", headerName: "" },
      log: () => {},
      gameDbFetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.includes("/api/builds/")) {
          const product = url.pathname.split("/")[3];
          return Response.json({ product, version: product === "wow" ? retail : forever });
        }
        if (url.searchParams.get("build")?.startsWith("1.")) {
          if (broken) throw new Error("Forever unavailable");
          return foreverResponse(input);
        }
        return coreResponse(input);
      },
    });
    try {
      await app.gameWatch.run();
      assert.equal(await app.store.game.forGame("forever").currentBuild(), build);
      broken = true;
      retail = "12.0.1.66338";
      forever = "1.60.1.70889";
      await app.gameWatch.run();
      const status = (await (await app.app.request("/health")).json()).gameDb;
      assert.equal(status.build, retail);
      assert.equal(status.lastError, null);
      assert.equal(status.forever.build, build);
      assert.equal(status.forever.liveBuild, forever);
      assert.equal(status.forever.lastError, "import_failed");
      assert.ok(status.forever.pendingSince > 0);
      broken = false;
      await app.gameWatch.run();
      assert.equal((await app.store.game.forGame("forever").status()).lastError, null);
      assert.equal(await app.store.game.forGame("forever").currentBuild(), forever);
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
