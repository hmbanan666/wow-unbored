import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { Store } from "../src/store.ts";
import { database } from "./backend.ts";
import { coreResponse } from "./game-content-fixture.ts";
import { getInstanceGuide } from "../src/instances.ts";

const fixtureFetch: typeof fetch = async (input) => {
  const table = new URL(String(input)).pathname.split("/")[2];
  if (
    ![
      "JournalInstance",
      "JournalEncounter",
      "Achievement",
      "CriteriaTree",
      "Criteria",
      "UiMap",
      "UiMapGroupMember",
    ].includes(table)
  )
    return coreResponse(input);
  return new Response(readFileSync(new URL(`./fixtures/instances/${table}.csv`, import.meta.url)));
};

test("instance guide orders bosses and maps only typed evidence from child achievements", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  try {
    await store.game.importBuild("12.0.1.66337", fixtureFetch);
    const guide = await getInstanceGuide(store.game, { achievementID: 10149 });
    assert.equal(guide.instance?.instanceID, 669);
    assert.equal(guide.instance?.mapID, 1448);
    assert.deepEqual(
      guide.bosses.map((boss) => boss.encounterID),
      [1426, 1425, 1372],
    );
    assert.deepEqual(guide.bosses[1].point, {
      uiMapID: 661,
      x: 0.43,
      y: 0.5,
      name: "Hellfire Citadel",
    });
    assert.equal(guide.bosses[1].criteria[0].achievement?.id, 10057);
    assert.equal(guide.bosses[1].criteria[0].criteriaID, 28497);
    assert.match(guide.bosses[1].criteria[0].achievement!.description, /10 Hellfire Guardians/);
    assert.deepEqual(
      guide.unmapped.map((criterion) => criterion.criteriaID),
      [28495, 28503],
    );
    assert.equal(
      guide.unmapped[0].requirements[0].asset,
      1778,
      "a spell asset is not an encounter id",
    );
    assert.equal(guide.entrance, null, "boss points do not invent an entrance");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("creature criteria use journal creature ids from the Game Data API, never display ids", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  const { BlizzardIds } = await import("../src/blizzard.ts");
  const gameIds = new BlizzardIds(
    { clientId: "test", clientSecret: "test", region: "us" },
    { get: async () => undefined, put: async () => {} },
    async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("/token")
          ? { access_token: "test", expires_in: 3600 }
          : {
              id: Number(url.match(/journal-encounter\/(\d+)/)?.[1]),
              creatures: url.includes("/1372?") ? [{ id: 90199, name: "Gorefiend" }] : [],
            },
    }),
  );
  try {
    await store.game.importBuild("12.0.1.66337", fixtureFetch);
    const guide = await getInstanceGuide(
      store.game,
      { instanceID: 669, achievementID: 10149 },
      { gameIds },
    );
    assert.equal(guide.bosses[2].criteria[0].achievement?.id, 9979);
    assert.deepEqual(
      guide.unmapped.map((c) => c.achievement?.id),
      [10026],
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("floor labels come from the map group, and missing points stay absent", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  try {
    await store.game.importBuild("12.0.1.66337", fixtureFetch);
    const guide = await getInstanceGuide(store.game, { instanceID: 669 });
    assert.equal(guide.bosses[2].point?.name, "Hellfire Antechamber");
    const unplaced = await getInstanceGuide(store.game, { instanceID: 670 });
    assert.equal(unplaced.bosses[0].point, undefined);
    await assert.rejects(getInstanceGuide(store.game, { instanceID: 1448 }), /journal instance/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("guides use localized names from the latest imported build", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  try {
    await store.game.importBuild("12.0.1.66337", fixtureFetch);
    assert.equal(
      (await getInstanceGuide(store.game, { instanceID: 669 })).bosses[1].name,
      "Iron Reaver",
    );
    await store.game.importBuild("12.0.1.66338", async (input) => {
      const csv = await (await fixtureFetch(input)).text();
      return new Response(
        String(input).includes("ruRU")
          ? csv.replaceAll("Iron Reaver", "Железный разоритель")
          : csv.replaceAll("Iron Reaver", "Updated Reaver"),
      );
    });
    const ru = await getInstanceGuide(store.game, { instanceID: 669, lang: "ru" });
    assert.equal(ru.bosses[1].name, "Железный разоритель");
    assert.equal(ru.locale, "ruRU");
    assert.equal(
      (await getInstanceGuide(store.game, { instanceID: 669 })).bosses[1].name,
      "Updated Reaver",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a meta spanning instances returns candidates and keeps criteria unmapped", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  const fetchImpl: typeof fetch = async (input) => {
    const response = await fixtureFetch(input);
    const csv = await response.text();
    return new Response(
      String(input).includes("/Achievement/") ? csv.replace("health.,1448", "health.,1449") : csv,
    );
  };
  try {
    await store.game.importBuild("12.0.1.66337", fetchImpl);
    const guide = await getInstanceGuide(store.game, { achievementID: 10149 });
    assert.equal(guide.instance, null);
    assert.deepEqual(
      guide.candidates.map((i) => i.instanceID),
      [669, 670],
    );
    assert.equal(guide.bosses.length, 0);
    assert.equal(guide.unmapped.length, 3);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown child achievements remain visible and cyclic trees fail safely", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  const missing: typeof fetch = async (input) => {
    const response = await fixtureFetch(input);
    const csv = await response.text();
    return new Response(
      String(input).includes("/Criteria/") ? csv.replace("28495,8,10026", "28495,8,99999") : csv,
    );
  };
  try {
    await store.game.importBuild("12.0.1.66337", missing);
    const guide = await getInstanceGuide(store.game, { instanceID: 669, achievementID: 10149 });
    assert.ok(guide.unmapped.some((c) => c.asset === 99999 && c.criteriaID === 28495));
    const cycle: typeof fetch = async (input) => {
      const response = await fixtureFetch(input);
      const csv = await response.text();
      return new Response(
        String(input).includes("/Criteria/") ? csv.replace("28495,8,10026", "28495,8,10149") : csv,
      );
    };
    await store.game.importBuild("12.0.1.66338", cycle);
    await assert.rejects(
      getInstanceGuide(store.game, { achievementID: 10149 }),
      /child achievement graph/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a child with only partial boss evidence stays unmapped with all requirements", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".guide-"));
  const store = new Store(dir, { postgres: database() });
  const fetchImpl: typeof fetch = async (input) => {
    const response = await fixtureFetch(input);
    const csv = await response.text();
    return new Response(
      String(input).includes("/CriteriaTree/")
        ? `${csv}\n44061,An unproved mechanic,44059,1,0,28084,1\n`
        : csv,
    );
  };
  try {
    await store.game.importBuild("12.0.1.66337", fetchImpl);
    const guide = await getInstanceGuide(store.game, { achievementID: 10149 });
    assert.equal(guide.bosses[1].criteria.length, 0);
    const child = guide.unmapped.find((c) => c.achievement?.id === 10057)!;
    assert.equal(child.requirements.length, 2);
    assert.deepEqual(
      child.evidence.map((e) => e.encounterID),
      [1425],
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("journal creature documents expire and rejected documents do not poison the cache", async () => {
  const { BlizzardIds } = await import("../src/blizzard.ts");
  let now = 1000;
  let reads = 0;
  const gameIds = new BlizzardIds(
    { clientId: "test", clientSecret: "test", region: "us" },
    { get: async () => undefined, put: async () => {} },
    async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes("/token")) return { access_token: "test", expires_in: 3600 };
        reads++;
        return reads === 1
          ? { id: 1372, creatures: [{ id: 90199 }], text: "x".repeat(64_001) }
          : { id: 1372, creatures: [{ id: 90199 }, { id: 0 }, { displayID: 123 }, { id: 90199 }] };
      },
    }),
    () => now,
  );
  assert.equal(await gameIds.journalCreatures(1372), undefined);
  assert.deepEqual(await gameIds.journalCreatures(1372), [90199]);
  assert.deepEqual(await gameIds.journalCreatures(1372), [90199]);
  assert.equal(reads, 2);
  now += 86_401;
  assert.deepEqual(await gameIds.journalCreatures(1372), [90199]);
  assert.equal(reads, 3);
});
