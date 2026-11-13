import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { findGameEntity } from "../src/game-tools.ts";
import { Store } from "../src/store.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
import { coreResponse } from "./game-content-fixture.ts";

const pg = postgresPerFile();
const sizes: Record<string, number> = {
  ItemSparse: 300_000,
  QuestPOIPoint: 750_000,
  QuestV2: 100_000,
  Achievement: 20_000,
};
const source: typeof fetch = async (input) => {
  const table = new URL(String(input)).pathname.split("/")[2];
  if (!sizes[table]) return coreResponse(input);
  let id = 0;
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      pull(controller) {
        let text =
          id === 0
            ? ({
                ItemSparse:
                  "ID,Display_lang,Ignored,RequiredSkill,RequiredSkillRank,OverallQualityID,Bonding\n",
                QuestPOIPoint: "ID,QuestPOIBlobID,X,Y\n",
                QuestV2: "ID,UniqueBitFlag\n",
                Achievement: "ID,Title_lang,Description_lang,Instance_ID,Criteria_tree\n",
              }[table] ?? "")
            : "";
        for (let n = 0; n < 200 && id < sizes[table]; n++) {
          id++;
          text +=
            table === "Achievement"
              ? `${id},Achievement ${id},Description,0,100\n`
              : table === "ItemSparse"
                ? `${id},Item ${id},${"x".repeat(200)},0,0,1,0\n`
                : table === "QuestPOIPoint"
                  ? `${id},200,25,75\n`
                  : `${id},42\n`;
        }
        controller.enqueue(encoder.encode(text));
        if (id === sizes[table]) controller.close();
      },
    }),
  );
};

for (const backend of BACKENDS) {
  test(
    `production-size core import keeps memory and event-loop lag bounded (${backend})`,
    { timeout: 120_000 },
    async () => {
      const dir = mkdtempSync(path.join(import.meta.dirname, ".game-content-load-"));
      const store = new Store(dir, { postgres: pg(backend) });
      const baseline = process.memoryUsage().rss;
      let peak = baseline,
        last = performance.now();
      const delays: number[] = [];
      const timer = setInterval(() => {
        const now = performance.now();
        delays.push(Math.max(0, now - last - 10));
        last = now;
        peak = Math.max(peak, process.memoryUsage().rss);
      }, 10);
      try {
        const start = performance.now();
        const result = await store.game.importBuild("12.0.1.66337", source);
        const duration = performance.now() - start;
        assert.equal(result.tables.ItemSparse, 300_000);
        assert.equal(result.tables.QuestPOIPoint, 750_000);
        assert.equal(
          (await store.game.row("ItemSparse", 300_000, "ruRU"))?.fields.Display_lang,
          "Item 300000",
        );
        assert.equal((await store.game.row("QuestPOIPoint", 750_000))?.fields.X, 25);
        // The SQL lookup is also a public boundary for future tools/checks.
        if (backend === "postgres") {
          for (const table of ["ItemSparse", "QuestPOIPoint"]) {
            const plan = await pg(backend)!.unsafe(`EXPLAIN (FORMAT JSON)
              SELECT build, body FROM game.rows WHERE game = 'retail' AND build = '12.0.1.66337'
              AND table_name = '${table}' AND locale = 'enUS' AND id = 300000`);
            assert.match(
              JSON.stringify(plan),
              /rows_pkey/,
              `${table} id lookup uses the composite primary index immediately after import`,
            );
          }
        }
        const lookupStart = performance.now();
        for (let id = 1; id <= 100; id++) await store.game.row("QuestPOIPoint", id * 7000);
        const lookups = performance.now() - lookupStart;
        const nameStart = performance.now();
        for (let id = 299_901; id <= 300_000; id++) {
          const found = await findGameEntity(store.game, {
            kind: "item",
            name: `Item ${id}`,
            locale: "ruRU",
          });
          assert.equal(found.entities[0]?.id, id);
        }
        const nameLookups = performance.now() - nameStart;
        await new Promise((resolve) => setTimeout(resolve, 20));
        delays.sort((a, b) => a - b);
        const p99 = delays[Math.floor(delays.length * 0.99)];
        const max = delays.at(-1)!;
        console.log(
          JSON.stringify({
            backend,
            importMs: duration,
            lookupsMs: lookups,
            nameLookupsMs: nameLookups,
            p99LagMs: p99,
            maxLagMs: max,
            extraRssMB: (peak - baseline) / 1e6,
          }),
        );
        assert.ok(duration < 90_000, `import took ${duration} ms`);
        assert.ok(lookups < 1000, `100 id lookups took ${lookups} ms`);
        assert.ok(nameLookups < 1000, `100 localized name lookups took ${nameLookups} ms`);
        assert.ok(delays.length >= 10, "timers continue during import");
        assert.ok(p99 < 100, `p99 lag ${p99} ms`);
        assert.ok(max < 500, `maximum lag ${max} ms`);
        assert.ok(peak - baseline < 350_000_000, "import uses less than 350 MB extra RSS");
      } finally {
        clearInterval(timer);
        store.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
