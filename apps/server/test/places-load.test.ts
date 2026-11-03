import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "vite-plus/test";
import { getPlace } from "../src/places.ts";

function dataset(scale = 1) {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".places-load-"));
  mkdirSync(path.join(dir, "wago"));
  const write = (table: string, header: string, size: number, row: (id: number) => string) => {
    let csv = header + "\n";
    let id = 1;
    while (csv.length < size * scale) csv += row(id++) + "\n";
    writeFileSync(path.join(dir, "wago", `${table}.csv`), csv);
  };
  write("UiMap", "ID,Name_lang,ParentUiMapID,Type", 100_000, (i) => `${i},Place ${i},0,2`);
  write(
    "UiMapAssignment",
    "ID,UiMapID,MapID,Region_0,Region_1,Region_3,Region_4,UiMin_0,UiMin_1,UiMax_0,UiMax_1",
    2_300_000,
    (i) => `${i},${i},${i},0,0,1000,1000,0,0,1,1`,
  );
  write(
    "QuestPOIBlob",
    "ID,QuestID,UiMapID,MapID,NumPoints",
    2_600_000,
    (i) => `${i},${i},${i},${i},1`,
  );
  write("QuestPOIPoint", "ID,QuestPOIBlobID,X,Y", 4_800_000, (i) => `${i},${i},600,800`);
  write(
    "TaxiNodes",
    "ID,Name_lang,ContinentID,Pos_0,Pos_1,Flags",
    200_000,
    (i) => `${i},Flight ${i},${i},600,790,3`,
  );
  return dir;
}

test("place loading yields to the event loop", async () => {
  const dir = dataset(0.1);
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
  }, 10);
  try {
    const start = performance.now();
    await getPlace(dir, { mapID: 1, questID: 1 });
    const elapsed = performance.now() - start;
    assert.ok(fired || elapsed < 100, `event loop blocked for ${elapsed.toFixed(1)} ms`);
  } finally {
    clearTimeout(timer);
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "production-size places serve 50 concurrent lookups without delaying normal requests",
  { timeout: 20_000 },
  async () => {
    const dir = dataset();
    const { createApp } = await import("../src/app.ts");
    const { app, close } = createApp({
      dataDir: dir,
      companionToken: "companion-test-token",
      plannerToken: "planner-test-token",
      log: () => {},
    });
    const call = async (name: string, args: object) => {
      const response = await app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer planner-test-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        result: { isError?: boolean; content: { text: string }[] };
      };
      assert.notEqual(body.result.isError, true, JSON.stringify(body));
      return JSON.parse(body.result.content[0].text);
    };
    const delays: number[] = [];
    let last = performance.now(),
      healthCount = 0;
    const baseline = process.memoryUsage();
    let peakRss = baseline.rss,
      peakHeap = baseline.heapUsed;
    const health: Promise<void>[] = [];
    const timer = setInterval(() => {
      const now = performance.now();
      delays.push(Math.max(0, now - last - 5));
      last = now;
      const memory = process.memoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      peakHeap = Math.max(peakHeap, memory.heapUsed);
      health.push(
        Promise.resolve(app.request("/health")).then((response) => {
          assert.equal(response.status, 200);
          healthCount++;
        }),
      );
    }, 5);
    try {
      const start = performance.now();
      const places = await Promise.all(
        Array.from({ length: 50 }, (_, i) => call("get_place", { mapID: i + 1, questID: i + 1 })),
      );
      const cold = performance.now() - start;
      for (const place of places) {
        assert.ok(place.questPoints.length <= 256 && place.flightPoints.length <= 256);
        assert.ok(place.name || place.unavailable.length);
      }
      assert.equal(places[0].questPoints[0]?.x, 0.2, "cold build finishes with usable geometry");
      const warmStart = performance.now();
      await call("get_place", { mapID: 1, questID: 1 });
      const warm = performance.now() - warmStart;
      const putStart = performance.now();
      const result = await call("put_plan", {
        plan: {
          title: "Earn a level",
          outcome: { kind: "level", level: 80 },
          tasks: [{ id: "quest", title: "Finish {quest:1}", mapID: 1, x: 0.8, y: 0.8 }],
        },
      });
      const put = performance.now() - putStart;
      assert.equal(result.stored.tasks[0].x, 0.2);
      await new Promise((resolve) => setTimeout(resolve, 30));
      await Promise.all(health);
      const p99 = [...delays].sort((a, b) => a - b)[Math.ceil(delays.length * 0.99) - 1];
      console.log(
        JSON.stringify({
          coldMs: cold,
          warmGetMs: warm,
          warmPutMs: put,
          p99LagMs: p99,
          maxLagMs: Math.max(...delays),
          healthCount,
          extraRssMB: (peakRss - baseline.rss) / 1e6,
          extraHeapMB: (peakHeap - baseline.heapUsed) / 1e6,
        }),
      );
      assert.ok(healthCount >= 2, "normal requests complete during loading");
      assert.ok(cold < 5_000, `cold build took ${cold} ms`);
      assert.ok(warm < 100, `warm get_place took ${warm} ms`);
      assert.ok(put < 100, `warm put_plan took ${put} ms`);
      assert.ok(Math.max(...delays) < 100, `maximum event-loop lag ${Math.max(...delays)} ms`);
      assert.ok(p99 < 100, `p99 event-loop lag ${p99} ms`);
      assert.ok(peakRss - baseline.rss < 200_000_000, "place data uses less than 200 MB extra RSS");
    } finally {
      clearInterval(timer);
      await close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
