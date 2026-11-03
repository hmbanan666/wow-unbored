import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { planSchema } from "@unbored/contracts";
import { storage } from "./backend.ts";
import { cleanPlan, encodeUnb1 } from "../src/plan.ts";

const base = {
  title: "Sporeggar to Honored",
  tasks: [{ id: "turn-in", title: "Turn in the quest" }],
};

test("outcomes carry game targets through validation and encoding without progress numbers", () => {
  for (const outcome of [
    { kind: "rep", factionID: 970, standing: 6 },
    { kind: "renown", factionID: 2507, level: 10 },
    { kind: "level", level: 80 },
    { kind: "achievement", achievementID: 964 },
    ...["mount", "pet", "toy", "item"].map((kind) => ({ kind, id: 183 })),
  ]) {
    const warnings: string[] = [];
    const plan = cleanPlan({ ...base, outcome: { ...outcome, current: 5885 } }, 1, { warnings });
    assert.deepEqual(plan.outcome, outcome);
    assert.deepEqual(warnings, []);
    assert.equal(planSchema.safeParse(plan).success, true);
    assert.deepEqual(
      JSON.parse(Buffer.from(encodeUnb1(plan).slice(5), "base64").toString()).outcome,
      outcome,
    );
  }
});

test("invalid outcomes are dropped with a warning and keep every Step", () => {
  for (const outcome of [
    null,
    [],
    "Honored",
    {},
    { kind: "rep", factionID: 970, standing: 9 },
    { kind: "rep", factionID: 970, standing: "Honored" },
    { kind: "level", level: 1.5 },
    { kind: "mount", id: -1 },
    { kind: "pet", id: 0 },
    { kind: "renown", factionID: 1 },
    { kind: "achievement", achievementID: "964" },
    { kind: "unknown", id: 1 },
  ]) {
    const warnings: string[] = [];
    const plan = cleanPlan({ ...base, outcome }, 1, { warnings });
    assert.equal(plan.outcome, undefined);
    assert.equal(plan.tasks.length, 1);
    assert.ok(
      warnings.some((w) => w.includes("outcome")),
      JSON.stringify(outcome),
    );
  }
});

test("long text is shortened with warnings without splitting Unicode or link tokens", () => {
  const warnings: string[] = [];
  const plan = cleanPlan(
    {
      ...base,
      details: "я ".repeat(100),
      tasks: [
        {
          id: "long",
          title: "Go ".repeat(40),
          why: "я ".repeat(50),
          note: "я ".repeat(200),
        },
        { id: "unicode", title: "😀".repeat(80), note: "я".repeat(201) },
        {
          id: "token",
          title: "Go " + "{quest:9726|" + "я".repeat(100) + "}",
        },
      ],
    },
    1,
    { warnings },
  );
  assert.ok([...plan.tasks[0].title].length <= 70);
  assert.ok(Buffer.byteLength(plan.tasks[0].why!) <= 80);
  assert.ok(Buffer.byteLength(plan.tasks[0].note!) <= 400);
  assert.ok(Buffer.byteLength(plan.details!) <= 200);
  assert.ok(Buffer.byteLength(plan.tasks[1].title) <= 240);
  assert.ok(!/[\uD800-\uDBFF]$/.test(plan.tasks[1].title));
  assert.equal(plan.tasks[1].note, "я".repeat(200));
  assert.equal(plan.tasks[2].title, "Go");
  assert.ok(warnings.length >= 7);
});

test("a new outcome survives storage, MCP and delivery to the 0.11 addon", async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const path = await import("node:path");
  const { createApp } = await import("../src/app.ts");
  const dataDir = mkdtempSync(path.join(import.meta.dirname, ".outcome-"));
  const { app, store, close } = createApp({
    ...storage(),
    companionToken: "companion-test-token",
    plannerToken: "planner-test-token",
    dataDir,
    log: () => {},
  });
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../../packages/contracts/fixtures/plan-outcome.json", import.meta.url),
      "utf8",
    ),
  );
  const call = async (plan: unknown) => {
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
        params: { name: "put_plan", arguments: { plan } },
      }),
    });
    const body = (await response.json()) as {
      result: { isError?: boolean; content: { text: string }[] };
    };
    assert.notEqual(body.result.isError, true, JSON.stringify(body));
    return JSON.parse(body.result.content[0].text);
  };
  try {
    const result = await call(fixture);
    assert.deepEqual(result.stored.outcome, { kind: "rep", factionID: 970, standing: 6 });
    assert.deepEqual(result.warnings, []);
    assert.deepEqual((await store.latestPlan())!.plan.outcome, fixture.outcome);
    const response = await app.request("/v1/plan", {
      headers: {
        authorization: "Bearer companion-test-token",
        "X-Unbored-Addon-Version": "0.11.0",
      },
    });
    const body = (await response.json()) as { plan: string };
    assert.deepEqual(
      JSON.parse(Buffer.from(body.plan.slice(5), "base64").toString()).outcome,
      fixture.outcome,
    );
    const decoded = execFileSync(
      "lua5.1",
      [
        path.join(import.meta.dirname, "decode.lua"),
        body.plan,
        path.resolve(import.meta.dirname, "../../../addon"),
      ],
      { encoding: "utf8" },
    );
    assert.ok(decoded.startsWith("sporeggar:travel\nReach Sporeggar"));
    const invalid = await call({
      ...fixture,
      outcome: { kind: "rep", factionID: -1, standing: 9 },
    });
    assert.equal(invalid.stored.outcome, undefined);
    assert.ok(invalid.warnings.some((warning: string) => warning.includes("outcome")));
    assert.equal(invalid.stored.tasks.length, 4);
  } finally {
    await close();
    const { rmSync } = await import("node:fs");
    rmSync(dataDir, { recursive: true, force: true });
  }
});
