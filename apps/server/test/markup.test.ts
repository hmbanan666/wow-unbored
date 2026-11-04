import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import type { GameDataFetch } from "../src/blizzard.ts";
import { createApp } from "../src/app.ts";
import { cleanPlan, type PlayerContext } from "../src/plan.ts";
import { coreResponse } from "./game-content-fixture.ts";
import { storage } from "./backend.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/markup.json", import.meta.url),
    "utf8",
  ),
) as { plan: Record<string, unknown> };
fixture.plan.outcome = { kind: "achievement", achievementID: 964 };

type Built = ReturnType<typeof createApp>;

function build(options: { blizzardFetch?: GameDataFetch } = {}): Built {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-markup-"));
  return createApp({
    ...storage(),
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    log: () => {},
    blizzard: options.blizzardFetch
      ? { clientId: "client-id", clientSecret: "client-secret", region: "eu" }
      : null,
    blizzardFetch: options.blizzardFetch,
  });
}

async function mcpCall(app: Built["app"], name: string, args: Record<string, unknown>) {
  const headers = {
    authorization: `Bearer ${planner}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const response = await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = (await response.json()) as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  return {
    isError: body.result.isError === true,
    value: JSON.parse(body.result.content[0].text) as Record<string, unknown>,
  };
}

function decode(unb1: unknown): Record<string, unknown> {
  return JSON.parse(Buffer.from(String(unb1).slice(5), "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

const startPosition = { mapID: 85, x: 0.5, y: 0.4 };
const pointCases: {
  name: string;
  point: typeof startPosition;
  context?: PlayerContext | null;
  withoutRequest?: boolean;
  dropped: boolean;
}[] = [
  { name: "equal to start", point: startPosition, dropped: true },
  { name: "within tolerance", point: { mapID: 85, x: 0.504, y: 0.397 }, dropped: true },
  { name: "at upper tolerance", point: { mapID: 85, x: 0.505, y: 0.405 }, dropped: true },
  { name: "at lower tolerance", point: { mapID: 85, x: 0.495, y: 0.395 }, dropped: true },
  { name: "different x", point: { mapID: 85, x: 0.5051, y: 0.4 }, dropped: false },
  { name: "different y", point: { mapID: 85, x: 0.5, y: 0.3949 }, dropped: false },
  { name: "different map", point: { mapID: 84, x: 0.5, y: 0.4 }, dropped: false },
  { name: "no context", point: startPosition, context: null, dropped: false },
  { name: "partial context", point: startPosition, context: { mapID: 85, x: 0.5 }, dropped: false },
  { name: "no Request", point: startPosition, withoutRequest: true, dropped: false },
];

for (const scenario of pointCases) {
  test(`put_plan checks the Request's starting position: ${scenario.name}`, async () => {
    const { app, store, close } = build();
    await store.game.importBuild("12.0.1.66337", async (input) => {
      const table = new URL(String(input)).pathname.split("/")[2];
      if (table === "UiMap")
        return new Response(
          "ID,Name_lang,ParentUiMapID,Type\n84,City,0,3\n85,City,0,3\n102,Zangarmarsh,0,3\n",
        );
      if (table === "Faction")
        return new Response("ID,Name_lang,ParentFactionID,Expansion\n970,Sporeggar,0,1\n");
      if (table === "JournalEncounter")
        return new Response(
          "ID,Name_lang,JournalInstanceID,DungeonEncounterID,OrderIndex,UiMapID,Map_0,Map_1\n" +
            [scenario.point, { mapID: 102, x: 0.2, y: 0.5 }]
              .map((p, i) => `${i + 1},Boss,1,1,${i},${p.mapID},${p.x},${p.y}`)
              .join("\n"),
        );
      return coreResponse(input);
    });
    try {
      if (!scenario.withoutRequest) {
        const response = await app.request("/v1/requests", {
          method: "POST",
          headers: {
            authorization: `Bearer ${companion}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "travel",
            character: "Mira",
            mode: "farm",
            context: scenario.context === undefined ? startPosition : scenario.context,
          }),
        });
        assert.equal(response.status, 201);
      }
      const prepare = { id: "prepare", title: "Use your hearthstone" };
      const task = {
        id: "travel",
        title: "Travel to Sporeggar (Outland)",
        ...scenario.point,
        waypoints: [{ mapID: 102, x: 0.2, y: 0.5 }],
        complete: { kind: "proximity", ...scenario.point, radiusYards: 40 },
      };
      const { isError, value } = await mcpCall(app, "put_plan", {
        ...(scenario.withoutRequest ? {} : { requestId: "travel" }),
        plan: {
          outcome: { kind: "rep", factionID: 970, standing: 6 },
          title: "Sporeggar to Honored",
          tasks: [prepare, task],
        },
      });
      assert.equal(isError, false);
      const stored = value.stored as { tasks: Record<string, unknown>[] };
      const expectedTask: Record<string, unknown> = { ...task, estMinutes: 15 };
      if (scenario.dropped) {
        delete expectedTask.mapID;
        delete expectedTask.x;
        delete expectedTask.y;
        expectedTask.complete = { kind: "manual" };
      }
      assert.deepEqual(stored.tasks, [
        { ...prepare, estMinutes: 15, complete: { kind: "manual" } },
        expectedTask,
      ]);
      assert.deepEqual(
        value.warnings,
        scenario.dropped
          ? [
              "Step 2 point is the player's own position; use the destination or leave the point out.",
              "Step 2 point is the player's own position; dropped",
            ]
          : [],
      );
      assert.deepEqual(decode(value.plan).tasks, stored.tasks);
      const current = await mcpCall(app, "get_current_plan", {});
      assert.deepEqual(decode(current.value.plan).tasks, stored.tasks);
    } finally {
      close();
    }
  });
}

test("put_plan keeps good links and the npcs they use, and warns about the rest", async () => {
  const { app, close } = build();
  try {
    const plan = structuredClone(fixture.plan) as {
      tasks: Record<string, unknown>[];
      entities: { npc: Record<string, unknown> };
    };
    plan.tasks.push({
      id: "guard",
      title: "Ask {npc:999|the guard} about {faction:1}",
      note: "Then {item:abc} and {pin:84:150:20|the gate}.",
    });
    plan.entities.npc["4242"] = { name: "Nobody links me" };
    const { isError, value } = await mcpCall(app, "put_plan", { plan });
    assert.equal(isError, false, JSON.stringify(value));
    const stored = value.stored as {
      tasks: { title: string; note?: string }[];
      entities?: { npc: Record<string, unknown> };
    };
    assert.equal(stored.tasks[0].title, "Talk to {npc:12345}");
    assert.equal(
      stored.tasks[0].note,
      "He is at {pin:2339:52.1:47.3|the forge}. Bring {item:6948}.",
    );
    assert.equal(stored.tasks[1].title, "Ask the guard about");
    assert.equal(stored.tasks[1].note, "Then and the gate.");
    assert.deepEqual(Object.keys(stored.entities?.npc ?? {}), ["12345"], "unused npcs are dropped");
    const warnings = value.warnings as string[];
    assert.equal(warnings.length, 4, warnings.join("\n"));
    assert.ok(warnings[0].startsWith("Task 2 title: {npc:999|the guard} npc needs an entry"));
    assert.deepEqual(
      decode(value.plan).entities,
      stored.entities,
      "the UNB1 string carries entities",
    );
  } finally {
    close();
  }
});

test("a title made only of bad tokens is refused, and a clean plan has no warnings", async () => {
  assert.throws(
    () => cleanPlan({ tasks: [{ id: "a", title: "{item:0}" }] }, 1),
    /Task 1 needs a title/,
  );
  const warnings: string[] = [];
  cleanPlan(fixture.plan, 1, { warnings });
  assert.deepEqual(warnings, []);
});

test("answer_request cleans the message and keeps its npc entities", async () => {
  const { app, store, close } = build();
  try {
    await store.addRequest({
      id: "req-m",
      deviceId: "legacy",
      character: "Hero",
      realm: "Area 52",
      mode: "fun",
      budget: null,
      wish: null,
      nowSeconds: 1000,
    });
    const { isError, value } = await mcpCall(app, "answer_request", {
      requestId: "req-m",
      message: "Find {npc:12345} near {pin:2339:52.1:47.3}. {npc:5|Ghost} is gone.",
      entities: { npc: { "12345": { name: "Fixer Kev", mapID: 2339, x: 52.1, y: 47.3 } } },
    });
    assert.equal(isError, false, JSON.stringify(value));
    assert.equal((value.warnings as string[]).length, 1);
    const answer = (await store.requestById("req-m"))?.answer as {
      message: string;
      entities?: unknown;
    };
    assert.equal(answer.message, "Find {npc:12345} near {pin:2339:52.1:47.3}. Ghost is gone.");
    assert.deepEqual(answer.entities, {
      npc: { "12345": { name: "Fixer Kev", mapID: 2339, x: 52.1, y: 47.3 } },
    });
  } finally {
    close();
  }
});

test("with Blizzard credentials, ids that do not exist lose their link; answers are cached", async () => {
  const calls: string[] = [];
  const blizzardFetch: GameDataFetch = async (url, init) => {
    calls.push(url);
    if (url.startsWith("https://oauth.battle.net/")) {
      assert.match(init.headers.authorization, /^Basic /);
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok", expires_in: 86400 }),
      };
    }
    assert.equal(init.headers.authorization, "Bearer tok");
    const missing = url.includes("/item/999999") || url.includes("/creature/12345");
    return { ok: !missing, status: missing ? 404 : 200, json: async () => ({}) };
  };
  const { app, close } = build({ blizzardFetch });
  try {
    const plan = structuredClone(fixture.plan) as { tasks: Record<string, unknown>[] };
    plan.tasks.push({ id: "b", title: "Get {item:999999|the fake} and {currency:2815}" });
    const first = await mcpCall(app, "put_plan", { plan });
    const stored = first.value.stored as { tasks: { title: string }[]; entities?: unknown };
    assert.equal(stored.tasks[0].title, "Talk to", "a missing creature loses its npc link");
    assert.equal(
      stored.tasks[1].title,
      "Get the fake and {currency:2815}",
      "currency is not checked",
    );
    assert.equal(stored.entities, undefined);
    assert.ok(
      calls.some((url) =>
        url.startsWith("https://eu.api.blizzard.com/data/wow/item/6948?namespace=static-eu"),
      ),
    );
    assert.ok(!calls.some((url) => url.includes("/currency/")));
    await mcpCall(app, "put_plan", {
      plan: {
        outcome: { kind: "achievement", achievementID: 964 },
        title: "Mounts and pets",
        tasks: [{ id: "m", title: "Ride {mount:183} with {pet:39}" }],
      },
    });
    assert.ok(
      calls.some((url) => url.includes("/data/wow/mount/183?")),
      "mount ids are checked",
    );
    assert.ok(
      calls.some((url) => url.includes("/data/wow/pet/39?")),
      "pet ids are checked",
    );
    assert.ok(!calls.some((url) => url.includes("/toy/")), "toys are not checked");
    const count = calls.length;
    await mcpCall(app, "put_plan", { plan });
    assert.equal(calls.length, count, "the second plan is answered from the cache");
  } finally {
    close();
  }
});

test("an outage never strips links", async () => {
  const blizzardFetch: GameDataFetch = async (url) => {
    if (url.startsWith("https://oauth.battle.net/")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "tok" }) };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const { app, close } = build({ blizzardFetch });
  try {
    const { value } = await mcpCall(app, "put_plan", { plan: fixture.plan });
    const stored = value.stored as { tasks: { title: string }[] };
    assert.equal(stored.tasks[0].title, "Talk to {npc:12345}");
    assert.deepEqual(value.warnings, []);
  } finally {
    close();
  }
});
