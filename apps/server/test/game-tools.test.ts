import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test, vi } from "vite-plus/test";
import { Store } from "../src/store.ts";
import { getInstanceGuide } from "../src/instances.ts";
import { getPlace } from "../src/places.ts";
import { coreResponse, instanceResponse } from "./game-content-fixture.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";

const pg = postgresPerFile();
for (const backend of BACKENDS) {
  test(`place lookup reads imported game data without a CSV cache (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".game-tools-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      await store.game.importBuild("12.0.1.66337", coreResponse);
      const network = vi.fn(() => {
        throw new Error("No request-time downloads");
      });
      vi.stubGlobal("fetch", network);
      const place = await getPlace(store.game, { mapID: 84, questID: 90001 });
      const guide = await getInstanceGuide(store.game, { instanceID: 63 });
      assert.equal(guide.bosses[0].name, "A boss");
      assert.equal(network.mock.calls.length, 0);
      assert.equal(place.name, "Stormwind City");
      assert.deepEqual(place.questPoints, [{ mapID: 84, x: 0.25, y: 0.75, questID: 90001 }]);
      assert.deepEqual(place.nearestFlightPoint, {
        mapID: 84,
        x: 0.25,
        y: 0.75,
        id: 2,
        name: "Stormwind",
      });
    } finally {
      vi.unstubAllGlobals();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("imported instance guides preserve boss order, evidence and floor labels", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".game-tools-"));
  const store = new Store(dir);
  try {
    await store.game.importBuild("12.0.1.66337", instanceResponse);
    const guide = await getInstanceGuide(store.game, { achievementID: 10149 });
    assert.equal(guide.instance?.instanceID, 669);
    assert.deepEqual(
      guide.bosses.map((boss) => boss.encounterID),
      [1426, 1425, 1372],
    );
    assert.equal(guide.bosses[1].criteria[0].achievement?.id, 10057);
    assert.equal(guide.bosses[2].point?.name, "Hellfire Antechamber");
    assert.deepEqual(
      guide.unmapped.map((criterion) => criterion.criteriaID),
      [28495, 28503],
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tools report an unimported Game DB without downloading tables", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".game-tools-"));
  const store = new Store(dir);
  const network = vi.fn(() => {
    throw new Error("No request-time downloads");
  });
  vi.stubGlobal("fetch", network);
  try {
    const place = await getPlace(store.game, { mapID: 84, questID: 90001 });
    assert.equal(place.name, null);
    assert.deepEqual(place.questPoints, []);
    assert.ok(place.unavailable.includes("Game DB unavailable"));
    await assert.rejects(getInstanceGuide(store.game, { instanceID: 63 }), /Game DB unavailable/);
    assert.equal(network.mock.calls.length, 0);
  } finally {
    vi.unstubAllGlobals();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("place names and flight names follow locale and the latest imported build", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".game-tools-"));
  const store = new Store(dir);
  try {
    await store.game.importBuild("12.0.1.66337", coreResponse);
    await store.game.importBuild("12.0.1.66338", async (input) => {
      const csv = await (await coreResponse(input)).text();
      return new Response(
        String(input).includes("ruRU")
          ? csv.replaceAll("Stormwind", "Штормград")
          : csv.replaceAll("Stormwind", "Updated city"),
      );
    });
    const ru = await getPlace(store.game, { mapID: 84, questID: 90001, lang: "ru" });
    assert.equal(ru.name, "Штормград City");
    assert.equal(ru.nearestFlightPoint?.name, "Штормград");
    assert.equal((await getPlace(store.game, { mapID: 84 })).name, "Updated city City");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
