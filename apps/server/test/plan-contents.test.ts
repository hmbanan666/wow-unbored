import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vite-plus/test";

import { planSchema } from "@unbored/contracts";

import { cleanPlan, cleanProgress, encodeUnb1, planMarkupIds } from "../src/plan.ts";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`../../../packages/contracts/fixtures/${name}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

function clean(raw: Record<string, unknown>) {
  const warnings: string[] = [];
  const plan = cleanPlan(raw, 1, { warnings });
  return { plan, warnings };
}

const CAGE = "{item:128025|Rattling Iron Cage}";

function cagePlan(extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    kind: "plan",
    title: "Cage Hunt",
    rewards: [CAGE],
    tasks: [{ id: "a", title: "A" }],
    ...extra,
  };
}

test("the cage fixture keeps its contents and its step group, and survives UNB1", async () => {
  const raw = fixture("plan-group.json");
  assert.equal(planSchema.safeParse(raw).success, true);
  const { plan, warnings } = clean(raw);
  assert.deepEqual(warnings, []);
  assert.deepEqual(plan.contains, {
    [CAGE]: ["{mount:900001|Test Boar}", "{mount:900002|Test Wolf}", "{mount:900003|Test Talbuk}"],
  });
  assert.deepEqual(
    plan.tasks.map((task) => task.group ?? null),
    [null, "rares", "rares", "rares", null],
  );
  const decoded = JSON.parse(
    Buffer.from(encodeUnb1(plan).slice("UNB1:".length), "base64").toString("utf8"),
  ) as Record<string, unknown>;
  assert.deepEqual(decoded.contains, plan.contains);
  assert.equal((decoded.tasks as { group?: string }[])[2].group, "rares");
  assert.ok(planMarkupIds(raw).includes("mount:900002"));
});

test("contents need an item reward of the plan or a step as their key", async () => {
  const notOffered = clean(cagePlan({ contains: { "{item:5}": ["{mount:1}"] } }));
  assert.equal(notOffered.plan.contains, undefined);
  assert.ok(notOffered.warnings.some((line) => line.includes("also a plan or step reward")));

  const mountKey = clean(
    cagePlan({ rewards: ["{mount:7}"], contains: { "{mount:7}": ["{mount:1}"] } }),
  );
  assert.equal(mountKey.plan.contains, undefined);

  const stepReward = clean({
    v: 1,
    kind: "plan",
    title: "Step cage",
    tasks: [{ id: "a", title: "A", rewards: ["{item:42}"] }],
    contains: { "{item:42}": ["{toy:9}", "{pet:3}"] },
  });
  assert.deepEqual(stepReward.plan.contains, { "{item:42}": ["{toy:9}", "{pet:3}"] });
});

test("contents keep 1 to 6 mount, toy, pet or item tokens and at most 2 containers", async () => {
  const values = [
    "{mount:1}",
    "{ach:2}",
    "plain text",
    "{mount:1}",
    "{toy:3}",
    "{pet:4}",
    "{item:5}",
    "{mount:6}",
    "{mount:7}",
    "{mount:8}",
  ];
  const { plan, warnings } = clean(cagePlan({ contains: { [CAGE]: values } }));
  assert.deepEqual(plan.contains?.[CAGE], [
    "{mount:1}",
    "{toy:3}",
    "{pet:4}",
    "{item:5}",
    "{mount:6}",
    "{mount:7}",
  ]);
  assert.ok(warnings.some((line) => line.includes("must be one mount, toy, pet or item token")));
  assert.ok(warnings.some((line) => line.includes("more than 6 contents")));

  const three = clean(
    cagePlan({
      rewards: ["{item:1}", "{item:2}", "{item:3}"],
      contains: { "{item:1}": ["{mount:1}"], "{item:2}": ["{mount:2}"], "{item:3}": ["{mount:3}"] },
    }),
  );
  assert.equal(Object.keys(three.plan.contains ?? {}).length, 2);
  assert.ok(three.warnings.some((line) => line.includes("more than 2 containers")));

  const empty = clean(cagePlan({ contains: { [CAGE]: [] } }));
  assert.equal(empty.plan.contains, undefined);
  const notObject = clean(cagePlan({ contains: ["{mount:1}"] }));
  assert.equal(notObject.plan.contains, undefined);
  assert.ok(notObject.warnings.some((line) => line.includes("must be an object")));
});

test("contents count toward the 12 tokens of goal plus details", async () => {
  const goal = Array.from({ length: 5 }, (_, n) => `{ach:${n + 1}}`).join(" ");
  const details = Array.from({ length: 5 }, (_, n) => `{ach:${n + 11}}`).join(" ");
  const { plan, warnings } = clean(
    cagePlan({ goal, details, contains: { [CAGE]: ["{mount:1}", "{mount:2}", "{mount:3}"] } }),
  );
  assert.deepEqual(plan.contains?.[CAGE], ["{mount:1}", "{mount:2}"]);
  assert.ok(warnings.some((line) => line.includes("more than 12 tokens")));
});

test("two mounts next to an item reward without contents is a warning, not a drop", async () => {
  const loose = clean(cagePlan({ rewards: [CAGE, "{mount:1}", "{mount:2}"] }));
  assert.deepEqual(loose.plan.rewards, [CAGE, "{mount:1}", "{mount:2}"]);
  assert.ok(loose.warnings.some((line) => line.includes("2+ mounts and an item without contains")));
  const tidy = clean(
    cagePlan({ rewards: [CAGE, "{mount:1}", "{mount:2}"], contains: { [CAGE]: ["{mount:3}"] } }),
  );
  assert.ok(!tidy.warnings.some((line) => line.includes("2+ mounts")));
});

test("a step group needs 2 steps next to each other; else it is dropped with a warning", async () => {
  const task = (id: string, group?: string) => ({ id, title: id, ...(group ? { group } : {}) });
  const split = clean({
    v: 1,
    kind: "plan",
    title: "Split up",
    tasks: [task("a", "g"), task("b", "g"), task("c"), task("d", "g"), task("e", "solo")],
  });
  assert.deepEqual(
    split.plan.tasks.map((row) => row.group ?? null),
    [null, null, null, null, null],
  );
  assert.ok(split.warnings.some((line) => line.includes("Step group g: its steps must be next")));
  assert.ok(
    split.warnings.some((line) => line.includes("Step group solo: a group needs at least 2")),
  );

  const bad = clean({
    v: 1,
    kind: "plan",
    title: "Bad name",
    tasks: [task("a", "Rares!"), task("b", "Rares!")],
  });
  assert.equal(bad.plan.tasks[0].group, undefined);
  assert.ok(bad.warnings.some((line) => line.includes("Task 1 group")));

  const two = clean({
    v: 1,
    kind: "plan",
    title: "Two groups",
    tasks: [task("a", "x"), task("b", "x"), task("c", "y-2"), task("d", "y-2")],
  });
  assert.deepEqual(
    two.plan.tasks.map((row) => row.group),
    ["x", "x", "y-2", "y-2"],
  );
  assert.deepEqual(two.warnings, []);
});

test("a 0.9 plan and a 0.9 progress post are still accepted as before", async () => {
  const { plan, warnings } = clean(fixture("plan-card.json"));
  assert.deepEqual(warnings, []);
  assert.equal(plan.contains, undefined);
  assert.ok(plan.tasks.every((task) => task.group === undefined));
  const old = cleanProgress({
    account: "a",
    realm: "r",
    character: "c",
    progress: { v: 1, kind: "progress", done: [{ id: "x", at: 5 }], remaining: [] },
  });
  assert.equal(old.progress.generatedAt, undefined);
  const fresh = cleanProgress({
    account: "a",
    realm: "r",
    character: "c",
    progress: { v: 1, kind: "progress", generatedAt: 1790000000 },
  });
  assert.equal(fresh.progress.generatedAt, 1790000000);
  assert.throws(() =>
    cleanProgress({ account: "a", realm: "r", character: "c", progress: { generatedAt: -1 } }),
  );
});
