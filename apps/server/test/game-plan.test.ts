import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { storage } from "./backend.ts";
import { coreResponse } from "./game-content-fixture.ts";

const base = {
  title: "A small adventure",
  outcome: { kind: "achievement", achievementID: 964 },
  tasks: [{ id: "go", title: "Take a look" }],
};

async function setup() {
  const dataDir = mkdtempSync(path.join(import.meta.dirname, ".game-plan-"));
  const built = createApp({
    ...storage(),
    dataDir,
    plannerToken: "planner-test-token",
    companionToken: "companion-test-token",
    log: () => {},
  });
  await built.store.game.importBuild("12.0.0.70000", coreResponse);
  return {
    ...built,
    async call(name: string, args: Record<string, unknown>) {
      const response = await built.app.request("/mcp", {
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
      const { result } = (await response.json()) as {
        result: { isError?: boolean; content: { text: string }[] };
      };
      return { error: result.isError === true, value: JSON.parse(result.content[0].text) };
    },
    async dispose() {
      await built.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

test("put_plan replaces an unknown Game DB token with its label and warns", async () => {
  const api = await setup();
  try {
    const result = await api.call("put_plan", {
      plan: { ...base, goal: "Find {item:999999|the keepsake}" },
    });
    assert.equal(result.error, false);
    assert.equal(result.value.stored.goal, "Find the keepsake");
    assert.match(result.value.warnings.join(" "), /item:999999/);
  } finally {
    await api.dispose();
  }
});

test("every entity kind uses its game id, and unknown ids lose their links", async () => {
  const api = await setup();
  try {
    for (const [kind, id] of Object.entries({
      item: 19019,
      quest: 90001,
      ach: 964,
      currency: 2000,
      mount: 6,
      pet: 39,
      toy: 1973,
      zone: 84,
      instance: 63,
      spell: 458,
      npc: 7390,
    })) {
      const token = `{${kind}:${id}|Known}`;
      const result = await api.call("put_plan", {
        plan: {
          ...base,
          goal: token,
          entities: { npc: { "7390": { name: "A companion" }, "999999": { name: "Invented" } } },
          tasks: [{ id: "go", title: `Find {${kind}:999999|Unknown}` }],
        },
      });
      assert.equal(result.error, false, kind);
      assert.equal(result.value.stored.goal, token, kind);
      assert.equal(result.value.stored.tasks[0].title, "Find Unknown", kind);
      assert.match(result.value.warnings.join(" "), new RegExp(`${kind}:999999`));
    }
  } finally {
    await api.dispose();
  }
});

test("missing outcome targets are rejected without storing a Plan", async () => {
  const api = await setup();
  try {
    for (const outcome of [
      { kind: "achievement", achievementID: 999999 },
      { kind: "currency", currencyID: 999999, amount: 10 },
      { kind: "rep", factionID: 999999, standing: 6 },
      { kind: "renown", factionID: 999999, level: 2 },
      ...["mount", "pet", "toy", "item"].map((kind) => ({ kind, id: 999999 })),
    ]) {
      const result = await api.call("put_plan", { plan: { ...base, outcome } });
      assert.equal(result.error, true, outcome.kind);
      assert.match(JSON.stringify(result.value), /outcome.*Game DB/i);
      assert.equal(await api.store.latestPlan(), undefined);
    }
  } finally {
    await api.dispose();
  }
});

test("unknown structured quest checks cannot remain automatic completion or Conditions", async () => {
  const api = await setup();
  try {
    const result = await api.call("put_plan", {
      plan: {
        ...base,
        tasks: [
          {
            id: "quest:999999",
            title: "Finish the errand",
            complete: { kind: "quest", questID: 999999 },
            condition: { text: "After the errand", check: { kind: "quest", id: 999999 } },
          },
          {
            id: "known",
            title: "A small adventure",
            complete: {
              kind: "any",
              any: [
                { kind: "quest", questID: 999999 },
                { kind: "quest", questID: 90001 },
              ],
            },
          },
        ],
      },
    });
    assert.equal(result.error, false);
    assert.deepEqual(result.value.stored.tasks[0].complete, { kind: "manual" });
    assert.equal(result.value.stored.tasks[0].condition.check, undefined);
    assert.deepEqual(result.value.stored.tasks[1].complete, {
      kind: "any",
      any: [{ kind: "quest", questID: 90001 }],
    });
    assert.match(result.value.warnings.join(" "), /quest.*999999/);
  } finally {
    await api.dispose();
  }
});

test("quest destinations come from the current Game DB and unsupported points are dropped", async () => {
  const api = await setup();
  try {
    const result = await api.call("put_plan", {
      plan: {
        ...base,
        tasks: [
          {
            id: "known",
            title: "Do {quest:90001}",
            mapID: 84,
            x: 0.9,
            y: 0.1,
            complete: { kind: "quest", questID: 90001 },
          },
          {
            id: "invented",
            title: "Take a look",
            mapID: 999999,
            x: 0.5,
            y: 0.5,
            complete: { kind: "proximity", mapID: 999999, x: 0.5, y: 0.5 },
            waypoints: [{ mapID: 84, x: 0.8, y: 0.8 }],
          },
        ],
      },
    });
    assert.equal(result.error, false);
    assert.equal(result.value.stored.tasks[0].mapID, 84);
    assert.equal(result.value.stored.tasks[0].x, 0.25);
    assert.equal(result.value.stored.tasks[0].y, 0.75);
    assert.equal(result.value.stored.tasks[1].mapID, undefined);
    assert.equal(result.value.stored.tasks[1].waypoints, undefined);
    assert.deepEqual(result.value.stored.tasks[1].complete, { kind: "manual" });
    assert.match(result.value.warnings.join(" "), /known quest point/);
  } finally {
    await api.dispose();
  }
});

test("answer_request checks message links, pins, entity points and route points", async () => {
  const api = await setup();
  try {
    await api.app.request("/v1/requests", {
      method: "POST",
      headers: { authorization: "Bearer companion-test-token", "content-type": "application/json" },
      body: JSON.stringify({
        id: "reply",
        character: "Mira",
        type: "question",
        question: "Where next?",
      }),
    });
    const result = await api.call("answer_request", {
      requestId: "reply",
      message:
        "Find {item:999999|the keepsake} at {pin:84:80:80|the square}. See {npc:7390|the companion} near {pin:84:25:75}.",
      entities: { npc: { "7390": { name: "A companion", mapID: 84, x: 80, y: 80 } } },
      waypoints: [
        { mapID: 84, x: 0.8, y: 0.8 },
        { mapID: 84, x: 0.25, y: 0.75 },
      ],
    });
    assert.equal(result.error, false, JSON.stringify(result.value));
    const answer = result.value.request.answer;
    assert.equal(
      answer.message,
      "Find the keepsake at the square. See {npc:7390|the companion} near {pin:84:25:75}.",
    );
    assert.deepEqual(answer.waypoints, [{ mapID: 84, x: 0.25, y: 0.75 }]);
    assert.deepEqual(answer.entities.npc["7390"], { name: "A companion" });
    assert.match(result.value.warnings.join(" "), /point/);
  } finally {
    await api.dispose();
  }
});

test("answer_request rejects a fake outcome atomically and leaves the Request pending", async () => {
  const api = await setup();
  try {
    await api.app.request("/v1/requests", {
      method: "POST",
      headers: { authorization: "Bearer companion-test-token", "content-type": "application/json" },
      body: JSON.stringify({ id: "reject", character: "Mira", mode: "fun" }),
    });
    const result = await api.call("answer_request", {
      requestId: "reject",
      message: "Let's go!",
      plan: { ...base, outcome: { kind: "item", id: 999999 } },
    });
    assert.equal(result.error, true);
    assert.equal((await api.store.requestById("reject"))?.status, "pending");
    assert.equal(await api.store.latestPlan(), undefined);
    const response = await api.app.request("/v1/plan", {
      method: "PUT",
      headers: { authorization: "Bearer planner-test-token", "content-type": "application/json" },
      body: JSON.stringify({ ...base, outcome: { kind: "achievement", achievementID: 999999 } }),
    });
    assert.equal(response.status, 400);
    assert.equal(await api.store.latestPlan(), undefined);
  } finally {
    await api.dispose();
  }
});

test("a newer build replaces validation evidence immediately", async () => {
  const api = await setup();
  try {
    const plan = {
      ...base,
      goal: "Find {item:19019|the blade}",
      tasks: [{ id: "go", title: "Do {quest:90001}", mapID: 84, x: 0.25, y: 0.75 }],
    };
    const before = await api.call("put_plan", { plan });
    assert.equal(before.value.stored.goal, "Find {item:19019|the blade}");
    await api.store.game.importBuild("12.0.1.70001", async (input) => {
      const table = new URL(String(input)).pathname.split("/")[2];
      if (table === "ItemSparse") return new Response("ID,Display_lang\n19020,Another blade\n");
      if (table === "QuestPOIPoint") return new Response("ID,QuestPOIBlobID,X,Y\n201,200,80,20\n");
      return coreResponse(input);
    });
    const after = await api.call("put_plan", { plan });
    assert.equal(after.value.stored.goal, "Find the blade");
    assert.equal(after.value.stored.tasks[0].x, 0.8);
    assert.equal(after.value.stored.tasks[0].y, 0.2);
  } finally {
    await api.dispose();
  }
});

test("unverified vignette points do not survive inside completion checks", async () => {
  const api = await setup();
  try {
    const result = await api.call("put_plan", {
      plan: {
        ...base,
        tasks: [
          {
            id: "rare",
            title: "Find the rare",
            complete: { kind: "vignette", questID: 90001, mapID: 84, x: 0.8, y: 0.8 },
          },
        ],
      },
    });
    assert.equal(result.error, false);
    assert.deepEqual(result.value.stored.tasks[0].complete, { kind: "vignette", questID: 90001 });
  } finally {
    await api.dispose();
  }
});

test("all supported outcome targets remain accepted when present in the imported build", async () => {
  const api = await setup();
  try {
    for (const outcome of [
      { kind: "achievement", achievementID: 964 },
      { kind: "currency", currencyID: 2000, amount: 10 },
      { kind: "rep", factionID: 72, standing: 6 },
      { kind: "renown", factionID: 72, level: 2 },
      { kind: "level", level: 80 },
      { kind: "mount", id: 6 },
      { kind: "pet", id: 39 },
      { kind: "toy", id: 1973 },
      { kind: "item", id: 19019 },
    ]) {
      const result = await api.call("put_plan", { plan: { ...base, outcome } });
      assert.equal(result.error, false, JSON.stringify(result.value));
      assert.deepEqual(result.value.stored.outcome, outcome);
    }
  } finally {
    await api.dispose();
  }
});

test("a chance bonus cannot also be the promised outcome", async () => {
  const api = await setup();
  try {
    const result = await api.call("put_plan", {
      plan: { ...base, outcome: { kind: "mount", id: 6 }, bonus: ["{mount:6|A lucky drop}"] },
    });
    assert.equal(result.error, true);
    assert.match(JSON.stringify(result.value), /outcome.*chance/i);
    assert.equal(await api.store.latestPlan(), undefined);
  } finally {
    await api.dispose();
  }
});

test("destination evidence remains bounded across several maps", async () => {
  const api = await setup();
  try {
    await api.store.game.importBuild("12.0.1.70001", async (input) => {
      const table = new URL(String(input)).pathname.split("/")[2];
      if (table === "UiMap")
        return new Response(
          "ID,Name_lang,ParentUiMapID,Type\n84,First city,13,3\n85,Second city,13,3\n",
        );
      if (table === "JournalEncounter")
        return new Response(
          "ID,Name_lang,JournalInstanceID,DungeonEncounterID,OrderIndex,UiMapID,Map_0,Map_1\n" +
            Array.from(
              { length: 256 },
              (_, i) => `${i + 1},A boss,63,2970,0,84,${i / 512},0.5\n`,
            ).join("") +
            "257,Another boss,63,2971,0,85,0.9,0.9\n",
        );
      return coreResponse(input);
    });
    const result = await api.call("put_plan", {
      plan: {
        ...base,
        tasks: [
          { id: "first", title: "Visit the first city", mapID: 84, x: 0.1, y: 0.5 },
          { id: "second", title: "Visit the second city", mapID: 85, x: 0.9, y: 0.9 },
        ],
      },
    });
    assert.equal(result.error, false);
    assert.equal(result.value.stored.tasks[0].mapID, 84);
    assert.equal(result.value.stored.tasks[1].mapID, undefined);
    assert.match(result.value.warnings.join(" "), /unsupported travel point/);
  } finally {
    await api.dispose();
  }
});
