import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { BACKENDS, postgresPerFile, type Backend } from "./postgres-db.ts";

const pg = postgresPerFile();
const build = "12.0.1.66337";
const runnerToken = "runner-token-for-tests-with-32-characters";

function setup(backend: Backend) {
  const dataDir = mkdtempSync(path.join(import.meta.dirname, ".game-db-"));
  const downloads: string[] = [];
  const source = {
    enUS: "ID,Title_lang\r\n964,Going Down?\r\n",
    ruRU: "ID,Title_lang\r\n964,Летим!\r\n",
  };
  const app = createApp({
    database: pg(backend),
    ingest: "inline",
    dataDir,
    companionToken: "companion",
    plannerToken: "owner",
    blizzard: null,
    plannerRoute: "runner",
    runnerToken,
    webhook: { url: "", key: "", headerName: "" },
    log: () => {},
    gameDbFetch: async (input) => {
      const url = new URL(String(input));
      downloads.push(url.href);
      assert.equal(url.origin + url.pathname, "https://wago.tools/db2/Achievement/csv");
      assert.match(url.searchParams.get("build")!, /^12\.0\.1\.\d+$/);
      return new Response(source[url.searchParams.get("locale") as keyof typeof source]);
    },
  });
  return {
    ...app,
    downloads,
    source,
    import: (version = build, token = "owner") =>
      app.app.request("/owner/game/import", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ build: version }),
      }),
    async entity(id = 964, token = "owner") {
      const response = await app.app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_game_entity", arguments: { kind: "achievement", id } },
        }),
      });
      const body = await response.text();
      const rpc = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1].trim() : body);
      return JSON.parse(rpc.result.content[0].text);
    },
    async cleanup() {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

for (const backend of BACKENDS) {
  test(`all rows survive import batches, including an unnamed client row (${backend})`, async () => {
    const app = setup(backend);
    try {
      const rows = Array.from({ length: 500 }, (_, index) => `${index + 1},Name,Ignored`).join(
        "\n",
      );
      app.source.enUS = `ID,Title_lang,Description_lang\n${rows}\n964,,Unnamed client row\n965,Last row,Ignored\n`;
      app.source.ruRU = `ID,Title_lang,Description_lang\n${rows}\n964,,Unnamed client row\n965,Последняя строка,Ignored\n`;
      const response = await app.import();
      assert.equal(response.status, 200);
      assert.equal((await response.json()).achievements, 502);
      assert.deepEqual((await app.entity()).names, { enUS: "", ruRU: "" });
      assert.equal((await app.entity(965)).names.ruRU, "Последняя строка");
    } finally {
      await app.cleanup();
    }
  });

  test(`a live lease may look up Game DB entities but cannot import (${backend})`, async () => {
    const app = setup(backend);
    const post = (url: string, body: unknown, token: string) =>
      app.app.request(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      assert.equal((await app.import()).status, 200);
      const request = JSON.parse(
        readFileSync(
          new URL("../../../packages/contracts/fixtures/requests.json", import.meta.url),
          "utf8",
        ),
      ).cases[0].body;
      assert.equal(
        (
          await post(
            "/v1/requests",
            {
              ...request,
              id: "game-lookup",
              account: "game-account",
              createdAt: Math.floor(Date.now() / 1000),
            },
            "companion",
          )
        ).status,
        201,
      );
      const claim = await post("/v1/runner/claim", {}, runnerToken);
      assert.equal(claim.status, 200);
      const lease = await claim.json();
      assert.equal((await app.entity(964, lease.leaseToken)).names.enUS, "Going Down?");
      assert.equal((await app.import(build, lease.leaseToken)).status, 401);
      for (const token of ["companion", runnerToken, "wrong"]) {
        const response = await post("/mcp", {}, token);
        assert.equal(response.status, 401);
      }
    } finally {
      await app.cleanup();
    }
  });

  test(`imports are owner-only and reject invalid builds before downloads (${backend})`, async () => {
    const app = setup(backend);
    try {
      for (const token of ["", "companion", "wrong", "runner-token-for-tests-with-32-characters"])
        assert.equal((await app.import(build, token)).status, 401);
      for (const version of ["", "latest", "12.0.1.66337&locale=enUS", "../66337", "12.0.1.0"])
        assert.equal((await app.import(version)).status, 400);
      assert.equal(app.downloads.length, 0);
      assert.deepEqual(await app.entity(), { entity: null });
    } finally {
      await app.cleanup();
    }
  });

  test(`concurrent imports publish one complete build (${backend})`, async () => {
    const app = setup(backend);
    try {
      const responses = await Promise.all([app.import(), app.import()]);
      assert.deepEqual(
        responses.map((r) => r.status),
        [200, 200],
      );
      const results = await Promise.all(responses.map((r) => r.json()));
      assert.deepEqual(results.map((r) => r.status).sort(), ["imported", "unchanged"]);
      assert.equal((await app.entity()).build, build);
    } finally {
      await app.cleanup();
    }
  });

  test(`a failed newer import keeps the complete build; lookup never revives removed ids (${backend})`, async () => {
    const app = setup(backend);
    try {
      assert.equal((await app.import()).status, 200);
      app.source.enUS = "ID,Title_lang\n6,Level 10\n";
      assert.equal((await app.import("12.0.1.66338")).status, 502);
      assert.equal((await app.entity()).build, build);
      app.source.ruRU = "ID,Title_lang\n6,Уровень 10\n";
      assert.equal((await app.import("12.0.1.66338")).status, 200);
      assert.deepEqual(await app.entity(), { entity: null });
      assert.deepEqual(await app.entity(6), {
        kind: "achievement",
        id: 6,
        build: "12.0.1.66338",
        names: { enUS: "Level 10", ruRU: "Уровень 10" },
      });
      assert.equal((await app.import("12.0.1.66336")).status, 200);
      assert.equal((await app.entity(6)).build, "12.0.1.66338");
    } finally {
      await app.cleanup();
    }
  });

  test(`a truncated locale never publishes a build and can be retried (${backend})`, async () => {
    const app = setup(backend);
    try {
      app.source.ruRU = 'ID,Title_lang\n964,"unfinished';
      assert.equal((await app.import()).status, 502);
      assert.deepEqual(await app.entity(), { entity: null });
      app.source.ruRU = 'ID,Title_lang\n964,"Летим, ""ещё""!"\n';
      assert.equal((await app.import()).status, 200);
      assert.equal((await app.entity()).names.ruRU, 'Летим, "ещё"!');
    } finally {
      await app.cleanup();
    }
  });

  test(`re-importing a completed build needs no download and preserves names (${backend})`, async () => {
    const app = setup(backend);
    try {
      assert.equal((await app.import()).status, 200);
      const repeated = await app.import();
      assert.equal(repeated.status, 200);
      assert.deepEqual(await repeated.json(), { build, status: "unchanged", achievements: 1 });
      assert.equal(app.downloads.length, 2);
      assert.equal((await app.entity()).names.ruRU, "Летим!");
    } finally {
      await app.cleanup();
    }
  });
  test(`owner imports build-tagged names in both locales for MCP (${backend})`, async () => {
    const app = setup(backend);
    try {
      const response = await app.import();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { build, status: "imported", achievements: 1 });
      assert.deepEqual(await app.entity(), {
        kind: "achievement",
        id: 964,
        build,
        names: { enUS: "Going Down?", ruRU: "Летим!" },
      });
      assert.deepEqual(
        app.downloads.map((url) => new URL(url).searchParams.get("build")),
        [build, build],
      );
      assert.deepEqual(app.downloads.map((url) => new URL(url).searchParams.get("locale")).sort(), [
        "enUS",
        "ruRU",
      ]);
    } finally {
      await app.cleanup();
    }
  });
}

test("the documented owner command imports through HTTP and reports a repeat as unchanged", async () => {
  const app = setup("sqlite");
  const server = serve({ fetch: app.app.fetch, hostname: "127.0.0.1", port: 0 });
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const run = () =>
      promisify(execFile)(
        process.execPath,
        [new URL("../scripts/import-game.ts", import.meta.url).pathname, build],
        {
          env: {
            ...process.env,
            UNBORED_SERVER_URL: `http://127.0.0.1:${address.port}`,
            UNBORED_PLANNER_TOKEN: "owner",
          },
        },
      );
    assert.equal(JSON.parse((await run()).stdout).status, "imported");
    assert.equal(JSON.parse((await run()).stdout).status, "unchanged");
    assert.equal((await app.entity()).names.enUS, "Going Down?");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.cleanup();
  }
});
