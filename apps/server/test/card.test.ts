import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vite-plus/test";

import { planSchema } from "@unbored/contracts";

import { cleanPlan, cleanTitle, encodeUnb1, planMarkupIds, PlanError } from "../src/plan.ts";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`../../../packages/contracts/fixtures/${name}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

function titleOf(raw: unknown, wish?: string) {
  const warnings: string[] = [];
  const title = cleanTitle(raw, { warnings, wish });
  return { title, warnings };
}

test("the D94 good titles pass without a warning", () => {
  for (const good of ["Badges for a Timereaver", "Hallow's End in one evening"]) {
    assert.deepEqual(titleOf(good), { title: good, warnings: [] }, good);
  }
});

test("the D94 bad titles get warnings and stay usable", () => {
  const facts = titleOf("Warlords Timewalking: you have 3200 currency");
  const title = facts.title ?? "";
  assert.ok(title.length > 0 && [...title].length <= 40, title);
  assert.ok(facts.warnings.some((line) => line.includes("state facts go in details")));
  assert.ok(facts.warnings.some((line) => line.includes("cut at a word")));
  assert.ok(!title.endsWith("…") && !title.endsWith("..."), "no ellipsis");

  const technical = titleOf("Plan for request mode surprise");
  assert.equal(technical.title, "Plan for request mode surprise");
  assert.ok(technical.warnings.some((line) => line.includes('starts with "plan"')));
});

test("a title is cut at a word, made plain, and checked against the wish", () => {
  const long = titleOf("A very long title about collecting every single mount in the world");
  assert.equal(long.title, "A very long title about collecting every");
  const tokens = titleOf("Get {mount:183|Ashes of Al'ar}");
  assert.equal(tokens.title, "Get Ashes of Al'ar");
  assert.ok(tokens.warnings[0].includes("no link tokens"));
  assert.ok(titleOf("Badges 10 and 20").warnings.some((line) => line.includes("one number")));
  assert.ok(titleOf("Go fishing", "go  fishing").warnings[0].includes("repeats the wish"));
  assert.equal(titleOf("ab").title, undefined);
  const missing = titleOf(undefined);
  assert.equal(missing.title, undefined);
  assert.ok(missing.warnings[0].includes("add a short human title"));
  assert.throws(() => cleanTitle(5), PlanError);
});

test("the 0.8 plan fixture keeps every card field, and survives UNB1", () => {
  const raw = fixture("plan-card.json");
  assert.equal(planSchema.safeParse(raw).success, true);
  const warnings: string[] = [];
  const plan = cleanPlan(raw, 1, { warnings });
  assert.deepEqual(warnings, []);
  assert.equal(plan.title, "Ashes in one evening");
  assert.deepEqual(plan.rewards, ["{mount:183|Ashes of Al'ar}", "{ach:964|Going Down?}"]);
  assert.ok(plan.goal?.includes("{zone:109|Netherstorm}"));
  assert.equal(plan.tasks[0].why, "It is a quick {ach:964} on the way");
  assert.deepEqual(plan.tasks[0].rewards, ["{ach:964}"]);
  assert.deepEqual(plan.tasks[1].condition, {
    text: "If you are level 70 or higher",
    check: { kind: "level", id: 70 },
  });
  const decoded = JSON.parse(
    Buffer.from(encodeUnb1(plan).slice(5), "base64").toString("utf8"),
  ) as Record<string, unknown>;
  assert.equal(decoded.title, plan.title);
  assert.deepEqual(decoded.rewards, plan.rewards);
  assert.ok(planMarkupIds(raw).includes("mount:183") && planMarkupIds(raw).includes("zone:109"));
});

test("a 0.7 plan has no card fields and only the title warning", () => {
  const warnings: string[] = [];
  const plan = cleanPlan(fixture("plan.json"), 1, { warnings });
  assert.equal(plan.title, undefined);
  assert.equal(plan.rewards, undefined);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].startsWith("Plan title:"));
});

test("card texts are kept short, rewards are single tokens, conditions are checked", () => {
  const warnings: string[] = [];
  const plan = cleanPlan(
    {
      title: "Short and sweet",
      goal: "word ".repeat(60),
      rewards: ["{mount:183}", "two {ach:1}", "{npc:5}", "{mount:183}", "{zone:1}"],
      tasks: [
        {
          id: "a",
          title: "Do it",
          why: "because ".repeat(30),
          rewards: ["{item:1}", "{item:2}", "{item:3}", "{item:4}"],
          condition: {
            text: "If you have 5,000 {currency:1166}",
            check: { kind: "currency", id: 1166, atLeast: 5000 },
          },
        },
      ],
    },
    1,
    { warnings },
  );
  assert.ok(Buffer.byteLength(plan.goal ?? "") <= 160);
  assert.ok(Buffer.byteLength(plan.tasks[0].why ?? "") <= 120);
  assert.deepEqual(
    plan.rewards,
    ["{mount:183}"],
    "one whole token each, no npc or zone, no repeats",
  );
  assert.equal(plan.tasks[0].rewards?.length, 3);
  assert.equal(plan.tasks[0].condition?.check?.atLeast, 5000);
  assert.ok(warnings.some((line) => line.startsWith("Plan goal: longer than 160 bytes")));
  assert.ok(warnings.some((line) => line.startsWith("Task 1 why: longer than 120 bytes")));
  assert.throws(
    () =>
      cleanPlan(
        {
          tasks: [
            { id: "a", title: "A", condition: { text: "If", check: { kind: "gold", id: 1 } } },
          ],
        },
        1,
      ),
    /check needs kind currency, item, level, quest or ach/,
  );
  assert.throws(
    () =>
      cleanPlan(
        { tasks: [{ id: "a", title: "A", condition: { check: { kind: "level", id: 70 } } }] },
        1,
      ),
    /condition needs text/,
  );
});
