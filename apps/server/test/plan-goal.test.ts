import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { packIds } from "@unbored/contracts";
import { snapshot } from "./helpers.ts";
import { createApp } from "../src/app.ts";
import { storage } from "./backend.ts";

const plan = {
  title: "Get The Underbog achievement",
  tasks: [{ id: "finish", title: "Defeat the last boss" }],
};

async function setup() {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".goal-"));
  const app = createApp({
    ...storage(),
    dataDir: dir,
    plannerToken: "planner",
    companionToken: "companion",
    log: () => {},
  });
  const call = async (value: unknown, requestId?: string, tool = "put_plan") => {
    const res = await app.app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer planner",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: tool,
          arguments: {
            plan: value,
            requestId,
            ...(tool === "answer_request" ? { message: "Your next adventure awaits." } : {}),
          },
        },
      }),
    });
    const { result } = (await res.json()) as {
      result: { isError?: boolean; content: { text: string }[] };
    };
    return { isError: result.isError, text: result.content[0].text };
  };
  return {
    ...app,
    call,
    close: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("put_plan rejects a missing outcome with an actionable tool error", async () => {
  const app = await setup();
  try {
    const result = await app.call(plan);
    assert.equal(result.isError, true);
    assert.match(result.text, /outcome is required/);
    assert.match(result.text, /rep, renown, level, achievement, mount, pet, toy, item, currency/);
    assert.equal(await app.store.latestPlan(), undefined);
  } finally {
    await app.close();
  }
});

test("put_plan rejects invalid outcomes and accepts a corrected currency target", async () => {
  const app = await setup();
  try {
    for (const outcome of [
      null,
      {},
      [],
      { kind: "chance", id: 1 },
      { kind: "achievement" },
      { kind: "rep", factionID: 970, standing: 9 },
      { kind: "currency", currencyID: 1166, amount: 0 },
    ]) {
      const result = await app.call({ ...plan, outcome });
      assert.equal(result.isError, true, JSON.stringify(outcome));
      assert.match(result.text, /outcome is invalid/);
      assert.match(result.text, /Allowed kinds/);
    }
    assert.equal(await app.store.latestPlan(), undefined);
    const result = await app.call({
      ...plan,
      title: "Save Timewarped Badges",
      outcome: { kind: "currency", currencyID: 1166, amount: 5000 },
    });
    assert.equal(result.isError, false, result.text);
    assert.deepEqual(JSON.parse(result.text).stored.outcome, {
      kind: "currency",
      currencyID: 1166,
      amount: 5000,
    });
  } finally {
    await app.close();
  }
});

test("put_plan rejects targets already owned in the Request's snapshot and accepts unknown data", async () => {
  const app = await setup();
  try {
    await app.store.putSnapshot(
      snapshot({
        char: { body: { level: 80 } },
        gear: { body: { slots: [{ itemID: 6948 }] } },
        achievements: { body: { ids: packIds([546]) } },
        mounts: { body: { ids: packIds([183]) } },
        pets: { body: { species: packIds([39]) } },
        toys: { body: { ids: packIds([54438]) } },
        reputation: {
          body: {
            factions: [{ factionID: 970, reaction: 6, standing: 9000 }],
            renown: [{ factionID: 2507, level: 10 }],
          },
        },
        currencies: { body: { list: [{ id: 1166, quantity: 5000 }] } },
      }),
      "pc",
    );
    await app.store.addRequest({
      deviceId: "pc",
      budget: null,
      wish: null,
      nowSeconds: 1790000000,
      id: "goal-request",
      type: "plan",
      mode: "fun",
      topic: "surprise",
      account: "111111#1",
      character: "Mira",
      realm: "Realm",
    });
    for (const [outcome, error] of [
      [{ kind: "item", id: 6948 }, "item 6948 is already held"],
      [{ kind: "achievement", achievementID: 546 }, "achievement 546 is already earned"],
      [{ kind: "mount", id: 183 }, "mount 183 is already collected"],
      [{ kind: "pet", id: 39 }, "pet 39 is already collected"],
      [{ kind: "toy", id: 54438 }, "toy 54438 is already collected"],
      [
        { kind: "rep", factionID: 970, standing: 6 },
        "faction 970 is already at standing 6 (target 6)",
      ],
      [
        { kind: "renown", factionID: 2507, level: 9 },
        "faction 2507 is already at renown 10 (target 9)",
      ],
      [{ kind: "level", level: 80 }, "level 80 is already reached (target 80)"],
      [
        { kind: "currency", currencyID: 1166, amount: 4000 },
        "currency 1166 is already at 5000 (target 4000)",
      ],
    ] as const) {
      const result = await app.call({ ...plan, outcome }, "goal-request");
      assert.equal(result.isError, true, result.text);
      assert.ok(JSON.parse(result.text).error.includes(error), result.text);
      assert.equal((await app.store.requestById("goal-request"))?.status, "pending");
    }
    assert.equal(await app.store.latestPlan(), undefined);
    const accepted = await app.call(
      { ...plan, outcome: { kind: "rep", factionID: 999, standing: 6 } },
      "goal-request",
    );
    assert.equal(accepted.isError, false, accepted.text);
    assert.match(JSON.parse(accepted.text).notes.join(" "), /No snapshot data.*rep/);
    assert.deepEqual(JSON.parse(accepted.text).warnings, []);
    assert.equal((await app.store.requestById("goal-request"))?.status, "fulfilled");
  } finally {
    await app.close();
  }
});

test("bonus rewards stay separate from a currency goal through storage and encoding", async () => {
  const app = await setup();
  try {
    const result = await app.call({
      ...plan,
      title: "Save Timewarped Badges",
      outcome: { kind: "currency", currencyID: 1166, amount: 5000 },
      bonus: ["{mount:183}"],
    });
    assert.equal(result.isError, false, result.text);
    const value = JSON.parse(result.text);
    assert.deepEqual(value.stored.bonus, ["{mount:183}"]);
    assert.equal(value.stored.rewards, undefined);
    assert.deepEqual(JSON.parse(Buffer.from(value.plan.slice(5), "base64").toString()).bonus, [
      "{mount:183}",
    ]);
  } finally {
    await app.close();
  }
});

test("absent snapshot kinds are accepted with notes, including when another Account owns the target", async () => {
  const app = await setup();
  try {
    await app.store.putSnapshot(
      snapshot(
        { mounts: { body: { ids: packIds([183]) } } },
        { account: "other", character: "Other" },
      ),
      "other-pc",
    );
    await app.store.addRequest({
      id: "missing-data",
      deviceId: "pc",
      account: "111111#1",
      character: "Mira",
      realm: "Realm",
      mode: "fun",
      budget: null,
      wish: null,
      nowSeconds: 1790000000,
    });
    for (const outcome of [
      { kind: "achievement", achievementID: 546 },
      { kind: "mount", id: 183 },
      { kind: "pet", id: 39 },
      { kind: "toy", id: 54438 },
      { kind: "rep", factionID: 970, standing: 6 },
      { kind: "renown", factionID: 2507, level: 10 },
      { kind: "level", level: 80 },
      { kind: "currency", currencyID: 1166, amount: 5000 },
      { kind: "item", id: 6948 },
    ]) {
      const result = await app.call({ ...plan, outcome }, "missing-data");
      assert.equal(result.isError, false, result.text);
      assert.match(JSON.parse(result.text).notes.join(" "), /No snapshot data/);
      assert.deepEqual(JSON.parse(result.text).warnings, []);
    }
  } finally {
    await app.close();
  }
});

test("the Request's level is usable snapshot evidence when no char Section exists", async () => {
  const app = await setup();
  try {
    await app.store.addRequest({
      id: "level-context",
      deviceId: "pc",
      account: "111111#1",
      character: "Mira",
      realm: "Realm",
      mode: "fun",
      budget: null,
      wish: null,
      context: { level: 80 },
      nowSeconds: 1790000000,
    });
    const rejected = await app.call(
      { ...plan, outcome: { kind: "level", level: 80 } },
      "level-context",
    );
    assert.equal(rejected.isError, true);
    assert.match(rejected.text, /level 80 is already reached/);
    const accepted = await app.call(
      { ...plan, outcome: { kind: "level", level: 81 } },
      "level-context",
    );
    assert.equal(accepted.isError, false, accepted.text);
    assert.deepEqual(JSON.parse(accepted.text).notes, []);
    await app.store.putSnapshot(snapshot({ char: { body: { level: 79 } } }), "pc");
    const newerRequest = await app.call(
      { ...plan, outcome: { kind: "level", level: 80 } },
      "level-context",
    );
    assert.equal(newerRequest.isError, true, newerRequest.text);
    assert.match(newerRequest.text, /level 80 is already reached/);
  } finally {
    await app.close();
  }
});

test("HTTP planner submissions enforce the same required and unowned outcome rule", async () => {
  const app = await setup();
  const put = (value: unknown) =>
    app.app.request("/v1/plan", {
      method: "PUT",
      headers: { authorization: "Bearer planner", "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  try {
    await app.store.putSnapshot(snapshot({ mounts: { body: { ids: packIds([183]) } } }), "pc");
    for (const outcome of [
      undefined,
      { kind: "currency", currencyID: 1166, amount: -1 },
      { kind: "mount", id: 183 },
    ]) {
      const result = await put({ ...plan, outcome });
      assert.equal(result.status, 400);
      assert.match(((await result.json()) as { error: string }).error, /Plan outcome/);
      assert.equal(await app.store.latestPlan(), undefined);
    }
    const accepted = await put({
      ...plan,
      outcome: { kind: "currency", currencyID: 1166, amount: 5000 },
    });
    assert.equal(accepted.status, 200);
    assert.match(
      ((await accepted.json()) as { notes: string[] }).notes.join(" "),
      /No snapshot data/,
    );
  } finally {
    await app.close();
  }
});

test("put_plan bounds work when shortening long unbroken text", async () => {
  const app = await setup();
  try {
    await app.call({ ...plan, outcome: { kind: "level", level: 80 } });
    const start = performance.now();
    const result = await app.call({
      title: "Reach the next level",
      outcome: { kind: "level", level: 80 },
      tasks: [{ id: "finish", title: "я".repeat(10_000), note: "z".repeat(10_000) }],
    });
    const elapsed = performance.now() - start;
    assert.equal(result.isError, false, result.text);
    const stored = JSON.parse(result.text).stored;
    assert.equal(stored.tasks[0].title, "я".repeat(70));
    assert.equal(stored.tasks[0].note, "z".repeat(400));
    assert.ok(elapsed < 100, `long text blocked submission for ${elapsed} ms`);
  } finally {
    await app.close();
  }
});

for (const tool of ["put_plan", "answer_request"]) {
  test(`${tool} warns about planner wording in every player-facing Plan field`, async () => {
    const app = await setup();
    try {
      await app.store.addRequest({
        id: "player-text",
        deviceId: "pc",
        character: "Mira",
        realm: "Realm",
        mode: "fun",
        budget: null,
        wish: null,
        nowSeconds: 1790000000,
      });
      for (const phrase of [
        "UNAVAILABLE",
        "Not Available",
        "no data",
        "According To",
        "the data shows",
        "SNAPSHOT",
        "get_place",
        "GET_INSTANCE_GUIDE",
        "check_ids",
        "get_ready_now",
        "get_game_data",
        "resolve_criteria",
        "недоступно",
        "НЕДОСТУПНЫ",
        "нет данных",
        "ПО ДАННЫМ",
      ]) {
        const result = await app.call(
          {
            title: phrase,
            goal: phrase,
            details: phrase,
            note: phrase,
            outcome: { kind: "achievement", achievementID: 1658 },
            tasks: [
              {
                id: "finish",
                title: phrase,
                note: phrase,
                why: phrase,
                condition: { text: phrase },
              },
            ],
          },
          "player-text",
          tool,
        );
        assert.equal(result.isError, false, result.text);
        const warnings: string[] = JSON.parse(result.text).warnings;
        for (const field of [
          "Plan title",
          "Plan goal",
          "Plan details",
          "Plan note",
          "Task 1 title",
          "Task 1 note",
          "Task 1 why",
          "Task 1 condition",
        ]) {
          assert.ok(
            warnings.some((warning) => warning.startsWith(`${field}:`) && /rewrite/i.test(warning)),
            `${phrase}: missing rewrite warning for ${field}`,
          );
        }
      }
      const result = await app.call(
        {
          ...plan,
          outcome: { kind: "achievement", achievementID: 1658 },
          goal: "Head to the arena and defeat Malygos.",
          details: "Возьми инструментальный ящик.",
          tasks: [
            {
              id: "tool_snapshot",
              title: "Loot the toolbox by the stool",
              note: "Use {item:40768}.",
              condition: { text: "If you have a Gnomish Army Knife" },
            },
          ],
        },
        "player-text",
        tool,
      );
      assert.equal(result.isError, false, result.text);
      assert.deepEqual(JSON.parse(result.text).warnings, []);
    } finally {
      await app.close();
    }
  });
}
