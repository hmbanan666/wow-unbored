import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { getPlace, readPlaceData } from "../src/places.ts";
import { storage } from "./backend.ts";
import { createApp } from "../src/app.ts";
import { cleanPlan } from "../src/plan.ts";

function cache() {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".places-"));
  mkdirSync(path.join(dir, "wago"));
  const write = (name: string, csv: string) =>
    writeFileSync(path.join(dir, "wago", `${name}.csv`), csv);
  write(
    "UiMap",
    "ID,Name_lang,ParentUiMapID,Type\n101,Outland,0,2\n111,Shattrath City,101,3\n102,Zangarmarsh,101,3\n",
  );
  // Synthetic map bounds make world (600, 800) map (0.2, 0.4).
  write(
    "UiMapAssignment",
    "ID,UiMapID,MapID,Region_0,Region_1,Region_3,Region_4,UiMin_0,UiMin_1,UiMax_0,UiMax_1\n1,102,530,0,0,1000,1000,0,0,1,1\n",
  );
  write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,1\n");
  write("QuestPOIPoint", "ID,QuestPOIBlobID,X,Y\n1,1,600,800\n");
  write(
    "TaxiNodes",
    "ID,Name_lang,ContinentID,Pos_0,Pos_1,Flags\n9,Known flight point,530,600,790,3\n",
  );
  return { dir, write };
}

test("place lookup returns cached names and only mapped quest and flight points", async () => {
  const { dir } = cache();
  try {
    const place = await getPlace(dir, { mapID: 102, questID: 9726 });
    assert.equal(place.name, "Zangarmarsh");
    assert.deepEqual(place.continent, { mapID: 101, name: "Outland" });
    assert.equal(place.label, "Zangarmarsh (Outland)");
    assert.deepEqual(place.questPoints, [{ mapID: 102, x: 0.2, y: 0.4, questID: 9726 }]);
    assert.equal(place.nearestFlightPoint?.id, 9);
    assert.equal(place.expansion, null);
    const unknown = await getPlace(dir, { mapID: 999, npcID: 123 });
    assert.equal(unknown.name, null);
    assert.equal(unknown.nearestFlightPoint, null);
    assert.ok(unknown.unavailable.includes("npc position"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quest points correct distant Steps, unsupported travel points disappear, starting points still disappear", async () => {
  const { dir } = cache();
  try {
    const places = await readPlaceData(dir, [102, 81]);
    const warnings: string[] = [];
    const plan = cleanPlan(
      {
        title: "Sporeggar to Honored",
        tasks: [
          { id: "quest", title: "Finish {quest:9726}", mapID: 102, x: 0.8, y: 0.8 },
          {
            id: "near",
            title: "Finish the quest",
            condition: { text: "If ready", check: { kind: "quest", id: 9726 } },
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
      { places, warnings, context: { mapID: 81, x: 0.42, y: 0.42 } },
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
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing, oversized and malformed tables return unknown facts without invented places", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".places-"));
  try {
    const fetchImpl: typeof fetch = async (input) => {
      const table = new URL(String(input)).pathname.split("/")[2];
      if (table === "UiMap")
        return new Response(
          "ID,Name_lang,ParentUiMapID,Type\n111,Shattrath City,101,3\n101,Outland,0,2\n",
        );
      if (table === "TaxiNodes") return new Response("x".repeat(20_000_001));
      if (table === "UiMapAssignment") return new Response("ID,WrongColumn\n1,2\n");
      return new Response("unavailable", { status: 403 });
    };
    const place = await getPlace(dir, { mapID: 111, questID: 9726 }, { fetchImpl });
    assert.equal(place.label, "Shattrath City (Outland)");
    assert.deepEqual(place.questPoints, []);
    assert.equal(place.nearestFlightPoint, null);
    for (const table of ["TaxiNodes", "UiMapAssignment", "QuestPOIBlob", "QuestPOIPoint"])
      assert.ok(place.unavailable.includes(table));
    const plan = cleanPlan(
      {
        title: "Visit Outland",
        tasks: [{ id: "travel", title: "Travel", mapID: 111, x: 0.5, y: 0.5 }],
      },
      1,
      { places: await readPlaceData(dir, [111]) },
    );
    assert.equal(plan.tasks[0].x, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quest polygons, ambiguous assignments and different maps never supply correction points", async () => {
  const { dir, write } = cache();
  try {
    write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,2\n");
    let place = await getPlace(dir, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    assert.equal(place.nearestFlightPoint, null);
    write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,111,530,1\n");
    place = await getPlace(dir, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,1\n");
    write(
      "UiMapAssignment",
      "ID,UiMapID,MapID,Region_0,Region_1,Region_3,Region_4,UiMin_0,UiMin_1,UiMax_0,UiMax_1\n1,102,530,0,0,1000,1000,0,0,1,1\n2,102,530,0,0,1000,1000,0,0,1,1\n",
    );
    place = await getPlace(dir, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    assert.deepEqual(place.flightPoints, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("journal boss points stay usable and proximity completion cannot keep a dropped point", async () => {
  const { dir, write } = cache();
  try {
    write("JournalEncounter", "ID,UiMapID,Map_0,Map_1\n1,661,0.3,0.6\n");
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
        places: await readPlaceData(dir, [102, 661]),
        warnings,
        context: { mapID: 81, x: 0.42, y: 0.42 },
      },
    );
    assert.equal(plan.tasks[0].x, 0.3);
    assert.equal(plan.tasks[1].mapID, undefined);
    assert.deepEqual(plan.tasks[1].complete, { kind: "manual" });
    assert.equal(plan.tasks[2].waypoints?.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP looks up places and validates submitted quest and travel points before storage", async () => {
  const { dir } = cache();
  const { app, store, close } = createApp({
    ...storage(),
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
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mixed quest geometry and missing join ids never become authoritative quest points", async () => {
  const { dir, write } = cache();
  try {
    write(
      "QuestPOIBlob",
      "ID,QuestID,UiMapID,MapID,NumPoints\n1,9726,102,530,1\n2,9726,102,530,2\n",
    );
    write("QuestPOIPoint", "ID,QuestPOIBlobID,X,Y\n1,1,600,800\n2,2,100,100\n3,2,200,200\n");
    assert.deepEqual((await getPlace(dir, { mapID: 102, questID: 9726 })).questPoints, []);
    write("QuestPOIBlob", "ID,QuestID,UiMapID,MapID,NumPoints\n,9726,102,530,1\n");
    write("QuestPOIPoint", "ID,QuestPOIBlobID,X,Y\n1,,600,800\n");
    assert.deepEqual((await getPlace(dir, { mapID: 102, questID: 9726 })).questPoints, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

test("a production-style cold cache downloads every place table and reuses it without a network", async () => {
  const source = cache();
  const dir = mkdtempSync(path.join(import.meta.dirname, ".places-"));
  const fetched: string[] = [];
  try {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://wago.tools");
      assert.ok(init?.signal, "the shared downloader bounds the runtime wait");
      const table = url.pathname.split("/")[2];
      fetched.push(table);
      let csv = readFileSync(path.join(source.dir, "wago", `${table}.csv`), "utf8");
      // A valid table larger than the old 2 MB place-only cap must be usable.
      if (table === "QuestPOIPoint") csv += "0,0," + " ".repeat(2_000_001) + ",0\n";
      return new Response(csv);
    };
    const place = await getPlace(dir, { mapID: 102, questID: 9726 }, { fetchImpl });
    assert.deepEqual(fetched.sort(), [
      "QuestPOIBlob",
      "QuestPOIPoint",
      "TaxiNodes",
      "UiMap",
      "UiMapAssignment",
    ]);
    assert.equal(place.label, "Zangarmarsh (Outland)");
    assert.equal(place.questPoints.length, 1);
    assert.equal(place.nearestFlightPoint?.id, 9);
    const cached = await getPlace(
      dir,
      { mapID: 102, questID: 9726 },
      {
        fetchImpl: async () => {
          throw new Error("offline");
        },
      },
    );
    assert.deepEqual(cached, place);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(source.dir, { recursive: true, force: true });
  }
});

test("a runtime 403 or network failure reports unavailable rather than crashing", async () => {
  for (const fetchImpl of [
    async () => new Response("Forbidden", { status: 403 }),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".places-"));
    try {
      const place = await getPlace(dir, { mapID: 102, questID: 9726 }, { fetchImpl });
      for (const name of ["UiMap", "UiMapAssignment", "QuestPOIBlob", "QuestPOIPoint", "TaxiNodes"])
        assert.ok(place.unavailable.includes(name));
      assert.equal(place.label, null);
      assert.deepEqual(place.questPoints, []);
      assert.equal(place.nearestFlightPoint, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("dense maps keep requested quest evidence without unbounded internal results", async () => {
  const { dir, write } = cache();
  try {
    write(
      "QuestPOIBlob",
      "ID,QuestID,UiMapID,MapID,NumPoints\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},${i + 1},102,530,1\n`).join(""),
    );
    write(
      "QuestPOIPoint",
      "ID,QuestPOIBlobID,X,Y\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},${i + 1},600,800\n`).join(""),
    );
    assert.equal((await getPlace(dir, { mapID: 102, questID: 600 })).questPoints[0]?.x, 0.2);
    const { store, close } = createApp({
      ...storage(),
      dataDir: dir,
      companionToken: "companion-test-token",
      plannerToken: "planner-test-token",
      log: () => {},
    });
    try {
      const stored = await store.putPlan({
        title: "Earn a level",
        tasks: [{ id: "quest", title: "Finish {quest:600}", mapID: 102, x: 0.8, y: 0.8 }],
      });
      assert.equal(stored.plan.tasks[0].x, 0.2);
    } finally {
      await close();
    }
    const places = await readPlaceData(dir, [102]);
    assert.ok(places.questPoints.length <= 256 && places.knownPoints.length <= 256);
    assert.deepEqual(await readPlaceData(dir), { questPoints: [], knownPoints: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "a stalled download returns unavailable by the place load deadline",
  { timeout: 5_000 },
  async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".places-"));
    try {
      const start = performance.now();
      const result = await getPlace(
        dir,
        { mapID: 102 },
        { fetchImpl: () => new Promise(() => {}) },
      );
      assert.ok(performance.now() - start < 4_000);
      assert.equal(result.name, null);
      assert.ok(result.unavailable.includes("UiMap"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("large flight lists are capped and truncated quest geometry never looks unique", async () => {
  const { dir, write } = cache();
  try {
    write(
      "TaxiNodes",
      "ID,Name_lang,ContinentID,Pos_0,Pos_1,Flags\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},Flight ${i},530,600,790,3\n`).join(""),
    );
    let place = await getPlace(dir, { mapID: 102, questID: 9726 });
    assert.equal(place.flightPoints.length, 256);
    assert.ok(place.unavailable.some((value) => value.includes("limit")));
    write(
      "QuestPOIBlob",
      "ID,QuestID,UiMapID,MapID,NumPoints\n" +
        Array.from({ length: 600 }, (_, i) => `${i + 1},9726,102,530,1\n`).join(""),
    );
    place = await getPlace(dir, { mapID: 102, questID: 9726 });
    assert.deepEqual(place.questPoints, []);
    assert.equal(place.nearestFlightPoint, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cached file versions refresh names and preserve quoted CSV cells", async () => {
  const { dir, write } = cache();
  try {
    assert.equal((await getPlace(dir, { mapID: 102 })).name, "Zangarmarsh");
    write(
      "UiMap",
      'ID,Name_lang,ParentUiMapID,Type\r\n101,Outland,0,2\r\n102,"A, ""quoted""\nplace",101,3\r\n',
    );
    assert.equal((await getPlace(dir, { mapID: 102 })).name, 'A, "quoted"\nplace');
    write("UiMap", 'ID,Name_lang,ParentUiMapID,Type\n102,"Unclosed,101,3\n');
    const place = await getPlace(dir, { mapID: 102 });
    assert.equal(place.name, null);
    assert.ok(place.unavailable.includes("UiMap"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
