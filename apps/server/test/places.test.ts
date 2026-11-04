import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { getPlace } from "../src/places.ts";
import { storage } from "./backend.ts";
import { createApp } from "../src/app.ts";
import { gamePlaces } from "../src/game-places.ts";
import { coreCsv } from "./game-content-fixture.ts";
import { cleanPlan } from "../src/plan.ts";

async function fixture() {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".places-"));
  const server = createApp({
    ...storage(),
    dataDir: dir,
    companionToken: "companion-test-token",
    plannerToken: "planner-test-token",
    log: () => {},
  });
  const tables: Record<string, string> = {
    ...coreCsv,
    QuestV2: "ID,UniqueBitFlag\n9726,1\n",
    Faction: "ID,Name_lang,ParentFactionID,Expansion\n970,Sporeggar,0,1\n",
  };
  const set = (name: string, csv: string) => {
    tables[name] = csv;
  };
  set(
    "UiMap",
    "ID,Name_lang,ParentUiMapID,Type\n101,Outland,0,2\n111,Shattrath City,101,3\n102,Zangarmarsh,101,3\n",
  );
  // Synthetic map bounds make world (600, 800) map (0.2, 0.4).
  set(
    "UiMapAssignment",
    "ID,UiMapID,MapID,AreaID,Region_0,Region_1,Region_3,Region_4,UiMin_0,UiMin_1,UiMax_0,UiMax_1\n1,102,530,0,0,0,1000,1000,0,0,1,1\n",
  );
  set("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,1\n");
  set("QuestPOIPoint", "ID,QuestPOIBlobID,X,Y\n1,1,600,800\n");
  set(
    "TaxiNodes",
    "ID,Name_lang,ContinentID,Pos_0,Pos_1,Flags\n9,Known flight point,530,600,790,3\n",
  );
  let revision = 66337;
  const load = () =>
    server.store.game.importBuild(
      `12.0.1.${revision++}`,
      async (input) => new Response(tables[new URL(String(input)).pathname.split("/")[2]]),
    );
  await load();
  const write = async (name: string, csv: string) => {
    set(name, csv);
    await load();
  };
  const game = server.store.game;
  const places = async (maps: number[] = [], quests: number[] = []) =>
    gamePlaces(game, (await game.currentBuild())!, maps, quests);
  const close = async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { ...server, dir, game, write, places, close };
}

test("place lookup returns imported names and only mapped quest and flight points", async () => {
  const { game, close } = await fixture();
  try {
    const place = await getPlace(game, { mapID: 102, questID: 9726 });
    assert.equal(place.name, "Zangarmarsh");
    assert.deepEqual(place.continent, { mapID: 101, name: "Outland" });
    assert.equal(place.label, "Zangarmarsh (Outland)");
    assert.deepEqual(place.questPoints, [{ mapID: 102, x: 0.2, y: 0.4, questID: 9726 }]);
    assert.equal(place.nearestFlightPoint?.id, 9);
    assert.equal(place.expansion, null);
    const unknown = await getPlace(game, { mapID: 999, npcID: 123 });
    assert.equal(unknown.name, null);
    assert.equal(unknown.nearestFlightPoint, null);
    assert.ok(unknown.unavailable.includes("npc position"));
  } finally {
    await close();
  }
});

test("quest points correct distant Steps, unsupported travel points disappear, starting points still disappear", async () => {
  const { close, places } = await fixture();
  try {
    const data = await places([102, 81]);
    const warnings: string[] = [];
    const plan = cleanPlan(
      {
        title: "Sporeggar to Honored",
        tasks: [
          { id: "quest", title: "Finish {quest:9726}", mapID: 102, x: 0.8, y: 0.8 },
          {
            id: "near",
            title: "Finish {quest:9726}",
            mapID: 102,
            x: 0.22,
            y: 0.4,
          },
          { id: "travel", title: "Fly there", mapID: 102, x: 0.8, y: 0.8 },
          { id: "flight", title: "Reach the flight point", mapID: 102, x: 0.21, y: 0.4 },
          { id: "start", title: "Go", mapID: 81, x: 0.42, y: 0.42 },
          { id: "unknown", title: "Finish {quest:1}", mapID: 102, x: 0.8, y: 0.8 },
        ],
      },
      1,
      { places: data, warnings, context: { mapID: 81, x: 0.42, y: 0.42 } },
    );
    assert.equal(plan.tasks[0].x, 0.2);
    assert.equal(plan.tasks[1].x, 0.22);
    assert.equal(plan.tasks[2].mapID, undefined);
    assert.equal(plan.tasks[3].x, 0.21);
    assert.equal(plan.tasks[4].mapID, undefined);
    assert.equal(plan.tasks[5].x, undefined);
    assert.ok(warnings.some((w) => w.includes("quest point")));
    assert.ok(warnings.some((w) => w.includes("unsupported")));
    assert.ok(warnings.some((w) => w.includes("own position")));
  } finally {
    await close();
  }
});

test("quest polygons, ambiguous assignments and different maps never supply correction points", async () => {
  const { game, close, write } = await fixture();
  try {
    await write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,2\n");
    let place = await getPlace(game, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    assert.equal(place.nearestFlightPoint, null);
    await write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,111,530,1\n");
    place = await getPlace(game, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    await write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,1\n");
    await write(
      "UiMapAssignment",
      "ID,UiMapID,MapID,AreaID,Region_0,Region_1,Region_3,Region_4,UiMin_0,UiMin_1,UiMax_0,UiMax_1\n1,102,530,0,0,0,1000,1000,0,0,1,1\n2,102,530,0,0,0,1000,1000,0,0,1,1\n",
    );
    place = await getPlace(game, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    assert.deepEqual(place.flightPoints, []);
  } finally {
    await close();
  }
});

test("journal boss points stay usable and proximity completion cannot keep a dropped point", async () => {
  const { close, write, places } = await fixture();
  try {
    await write(
      "UiMap",
      "ID,Name_lang,ParentUiMapID,Type\n101,Outland,0,2\n102,Zangarmarsh,101,3\n661,Citadel,0,4\n",
    );
    await write(
      "JournalEncounter",
      "ID,Name_lang,JournalInstanceID,DungeonEncounterID,OrderIndex,UiMapID,Map_0,Map_1\n1,Boss,669,1,0,661,0.3,0.6\n",
    );
    const warnings: string[] = [];
    const plan = cleanPlan(
      {
        title: "Through the citadel",
        tasks: [
          { id: "boss", title: "Reach the boss", mapID: 661, x: 0.3, y: 0.6 },
          {
            id: "start",
            title: "Travel",
            mapID: 81,
            x: 0.42,
            y: 0.42,
            complete: { kind: "proximity", mapID: 81, x: 0.42, y: 0.42 },
          },
          {
            id: "route",
            title: "Travel",
            waypoints: [
              { mapID: 102, x: 0.21, y: 0.4 },
              { mapID: 102, x: 0.9, y: 0.9 },
            ],
          },
        ],
      },
      1,
      {
        places: await places([102, 661]),
        warnings,
        context: { mapID: 81, x: 0.42, y: 0.42 },
      },
    );
    assert.equal(plan.tasks[0].x, 0.3);
    assert.equal(plan.tasks[1].mapID, undefined);
    assert.deepEqual(plan.tasks[1].complete, { kind: "manual" });
    assert.equal(plan.tasks[2].waypoints?.length, 1);
  } finally {
    await close();
  }
});

test("MCP looks up places and validates submitted quest and travel points before storage", async () => {
  const { app, store, close } = await fixture();
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
    const body = (await response.json()) as {
      result: { isError?: boolean; content: { text: string }[] };
    };
    assert.notEqual(body.result.isError, true, JSON.stringify(body));
    return JSON.parse(body.result.content[0].text);
  };
  try {
    const place = await call("get_place", { mapID: 102, questID: 9726 });
    assert.equal(place.label, "Zangarmarsh (Outland)");
    assert.equal(place.nearestFlightPoint.id, 9);
    const plan = {
      title: "Sporeggar to Honored",
      outcome: { kind: "rep", factionID: 970, standing: 6 },
      tasks: [
        { id: "quest", title: "Finish {quest:9726}", mapID: 102, x: 0.8, y: 0.8 },
        { id: "travel", title: "Fly to Sporeggar", mapID: 102, x: 0.8, y: 0.8 },
      ],
    };
    const result = await call("put_plan", { plan });
    assert.equal(result.stored.tasks[0].x, 0.2);
    assert.equal(result.stored.tasks[1].x, undefined);
    assert.equal(result.warnings.length, 2);
    assert.equal((await store.latestPlan())!.plan.tasks[0].y, 0.4);
    const http = await app.request("/v1/plan", {
      method: "PUT",
      headers: { authorization: "Bearer planner-test-token", "content-type": "application/json" },
      body: JSON.stringify(plan),
    });
    assert.equal(http.status, 200);
    const viaHttp = (await http.json()) as {
      stored: { tasks: { x?: number }[] };
      warnings: string[];
    };
    assert.equal(viaHttp.stored.tasks[0].x, 0.2);
    assert.equal(viaHttp.stored.tasks[1].x, undefined);
    assert.equal(viaHttp.warnings.length, 2);
    const request = await app.request("/v1/requests", {
      method: "POST",
      headers: { authorization: "Bearer companion-test-token", "content-type": "application/json" },
      body: JSON.stringify({
        id: "place-answer",
        character: "Hero",
        type: "question",
        question: "Where next?",
      }),
    });
    assert.equal(request.status, 201);
    const answer = await call("answer_request", {
      requestId: "place-answer",
      message: "Off to Sporeggar!",
      plan,
    });
    assert.equal(answer.warnings.length, 2);
    assert.equal((await store.latestPlan())!.plan.tasks[0].x, 0.2);
    assert.equal((await store.latestPlan())!.plan.tasks[1].mapID, undefined);
  } finally {
    await close();
  }
});

test("mixed quest geometry never become authoritative quest points", async () => {
  const { game, close, write } = await fixture();
  try {
    await write(
      "QuestPOIBlob",
      "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,1\n2,9726,102,530,2\n",
    );
    await write("QuestPOIPoint", "ID,QuestPOIBlobID,X,Y\n1,1,600,800\n2,2,100,100\n3,2,200,200\n");
    assert.deepEqual((await getPlace(game, { mapID: 102, questID: 9726 })).questPoints, []);
  } finally {
    await close();
  }
});

test("a quest reference cannot source a travel point and nested completion cannot keep it", () => {
  const warnings: string[] = [];
  const plan = cleanPlan(
    {
      title: "Find the quest",
      tasks: [
        {
          id: "travel",
          title: "Go to {quest:1}",
          mapID: 81,
          x: 0.8,
          y: 0.8,
          complete: {
            kind: "any",
            any: [
              { kind: "proximity", mapID: 81, x: 0.4, y: 0.4 },
              { kind: "quest", questID: 1 },
            ],
          },
        },
      ],
    },
    1,
    {
      places: { knownPoints: [], questPoints: [] },
      warnings,
      context: { mapID: 81, x: 0.4, y: 0.4 },
    },
  );
  assert.equal(plan.tasks[0].x, undefined);
  assert.deepEqual(plan.tasks[0].complete, { kind: "any", any: [{ kind: "quest", questID: 1 }] });
  assert.equal(warnings.length, 2);
});

test("dense maps keep requested quest evidence without unbounded internal results", async () => {
  const { game, store, close, write, places } = await fixture();
  try {
    await write("QuestV2", "ID,UniqueBitFlag\n600,1\n");
    await write(
      "QuestPOIBlob",
      "ID,QuestID,UiMapID,MapID,NumPoints\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},${i + 1},102,530,1\n`).join(""),
    );
    await write(
      "QuestPOIPoint",
      "ID,QuestPOIBlobID,X,Y\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},${i + 1},600,800\n`).join(""),
    );
    assert.equal((await getPlace(game, { mapID: 102, questID: 600 })).questPoints[0]?.x, 0.2);
    const stored = await store.putPlan({
      title: "Earn a level",
      tasks: [{ id: "quest", title: "Finish {quest:600}", mapID: 102, x: 0.8, y: 0.8 }],
    });
    assert.equal(stored.plan.tasks[0].x, 0.2);
    const data = await places([102]);
    assert.ok(data.questPoints.length <= 256 && data.knownPoints.length <= 256);
    assert.deepEqual(await places(), { questPoints: [], knownPoints: [] });
  } finally {
    await close();
  }
});

test("large flight lists are capped and truncated quest geometry never looks unique", async () => {
  const { game, close, write } = await fixture();
  try {
    await write(
      "TaxiNodes",
      "ID,Name_lang,ContinentID,Pos_0,Pos_1,Flags\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},Flight ${i},530,600,790,3\n`).join(""),
    );
    let place = await getPlace(game, { mapID: 102, questID: 9726 });
    assert.equal(place.flightPoints.length, 256);
    assert.ok(place.unavailable.some((value) => value.includes("limit")));
    await write(
      "QuestPOIBlob",
      "ID,QuestID,UiMapID,MapID,NumPoints\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},9726,102,530,1\n`).join(""),
    );
    place = await getPlace(game, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    assert.equal(place.nearestFlightPoint, null);
  } finally {
    await close();
  }
});

test("quests nested in completion conditions correct both destination and proximity", () => {
  const plan = cleanPlan(
    {
      title: "Finish the quest",
      tasks: [
        {
          id: "quest",
          title: "Turn it in",
          mapID: 102,
          x: 0.8,
          y: 0.8,
          complete: {
            kind: "any",
            any: [
              { kind: "quest", questID: 9726 },
              { kind: "proximity", mapID: 102, x: 0.8, y: 0.8 },
            ],
          },
        },
      ],
    },
    1,
    { places: { questPoints: [{ questID: 9726, mapID: 102, x: 0.2, y: 0.4 }], knownPoints: [] } },
  );
  assert.equal(plan.tasks[0].x, 0.2);
  assert.deepEqual(plan.tasks[0].complete?.any, [
    { kind: "quest", questID: 9726 },
    { kind: "proximity", mapID: 102, x: 0.2, y: 0.4, radiusYards: 40 },
  ]);
});

for (const reference of ["condition check", "condition text", "Step text"]) {
  test(`a verified flight destination wins over a quest in ${reference}`, () => {
    const warnings: string[] = [];
    const destination = { mapID: 102, x: 0.8, y: 0.8 };
    const plan = cleanPlan(
      {
        title: "Reach the flight master",
        tasks: [
          {
            id: "flight",
            title: "Reach the flight master",
            ...destination,
            ...(reference === "condition check"
              ? { condition: { text: "If ready", check: { kind: "quest", id: 9726 } } }
              : reference === "condition text"
                ? { condition: { text: "After {quest:9726}" } }
                : { note: "Then accept {quest:9726}" }),
            complete: { kind: "proximity", mapID: 102, x: 0.2, y: 0.4 },
          },
        ],
      },
      1,
      {
        warnings,
        places: {
          questPoints: [{ questID: 9726, mapID: 102, x: 0.2, y: 0.4 }],
          knownPoints: [destination],
        },
      },
    );
    assert.equal(plan.tasks[0].x, 0.8);
    assert.equal(plan.tasks[0].y, 0.8);
    assert.deepEqual(plan.tasks[0].complete, {
      kind: "proximity",
      ...destination,
      radiusYards: 40,
    });
    assert.deepEqual(warnings, []);
  });
}

for (const condition of [
  { text: "If ready", check: { kind: "quest", id: 9726 } },
  { text: "After {quest:9726}" },
]) {
  test(`a prerequisite alone cannot verify a destination: ${condition.text}`, () => {
    const warnings: string[] = [];
    const plan = cleanPlan(
      {
        tasks: [
          {
            id: "flight",
            title: "Reach the flight master",
            condition,
            mapID: 102,
            x: 0.8,
            y: 0.8,
            complete: { kind: "proximity", mapID: 102, x: 0.8, y: 0.8 },
          },
        ],
      },
      1,
      {
        warnings,
        places: {
          questPoints: [{ questID: 9726, mapID: 102, x: 0.2, y: 0.4 }],
          knownPoints: [],
        },
      },
    );
    assert.equal(plan.tasks[0].mapID, undefined);
    assert.deepEqual(plan.tasks[0].complete, { kind: "manual" });
    assert.ok(warnings.some((warning) => warning.includes("unsupported travel point")));
    assert.ok(!warnings.some((warning) => warning.includes("replaced")));
  });
}

test("nested proximity completion follows the kept flight destination", () => {
  const destination = { mapID: 102, x: 0.8, y: 0.8 };
  const warnings: string[] = [];
  const plan = cleanPlan(
    {
      title: "Reach the flight master",
      tasks: [
        {
          id: "flight",
          title: "Reach the flight master",
          ...destination,
          condition: { text: "After {quest:9726}", check: { kind: "quest", id: 9726 } },
          complete: {
            kind: "any",
            any: [
              { kind: "quest", questID: 9726 },
              { kind: "proximity", mapID: 102, x: 0.2, y: 0.4 },
            ],
          },
        },
      ],
    },
    1,
    {
      warnings,
      places: {
        questPoints: [{ questID: 9726, mapID: 102, x: 0.2, y: 0.4 }],
        knownPoints: [destination],
      },
    },
  );
  assert.equal(plan.tasks[0].x, 0.8);
  assert.equal(plan.tasks[0].y, 0.8);
  assert.deepEqual(plan.tasks[0].complete?.any, [
    { kind: "quest", questID: 9726 },
    { kind: "proximity", ...destination, radiusYards: 40 },
  ]);
  assert.deepEqual(warnings, []);
});
