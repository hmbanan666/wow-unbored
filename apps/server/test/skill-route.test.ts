import { NOW } from "./helpers.ts";
import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { computeSkillRoute, skillUpChance } from "../../../packages/contracts/src/skill-route.ts";
import type { ProfessionRecipe } from "@unbored/contracts/profession-catalog";

const recipe: ProfessionRecipe = {
  spellId: 100,
  skillLine: 197,
  name: "Linen cloth",
  category: { id: 1, name: "Cloth", order: 1 },
  minSkill: 1,
  thresholds: { orange: 1, yellow: 50, green: 75, grey: 100 },
  skillUps: 1,
  acquireMethod: 0,
  reagents: [{ itemId: 10, count: 2 }],
  craftedItems: [],
  teachingItems: [],
};
test("skill odds and expected reagent totals follow the catalog thresholds", () => {
  assert.equal(skillUpChance(recipe, 49), 1);
  assert.equal(skillUpChance(recipe, 50), 1);
  assert.equal(skillUpChance(recipe, 75), 0.5);
  assert.equal(skillUpChance(recipe, 100), 0);
  const route = computeSkillRoute({
    game: "forever",
    skillLine: 197,
    skill: 75,
    max: 150,
    target: 77,
    recipes: [recipe],
    known: [100],
  });
  assert.equal(route.reached, 77);
  assert.equal(route.stretches[0]!.slow, true);
  assert.ok(Math.abs(route.stretches[0]!.expectedCrafts - 4.083333333333334) < 1e-10);
  assert.deepEqual(route.reagents, [
    { itemId: 10, count: 10, unitCopper: null, totalCopper: null },
  ]);
});

test("routes use reachable trainers, prefer bands, stop at gaps and keep targets bounded", () => {
  const source = {
    kind: "trainer" as const,
    npcId: 1,
    npcName: "Teacher",
    uiMapID: 37,
    zone: "Elwynn",
    x: 12,
    y: 34,
    cost: 10,
    requiredSkill: 50,
    itemId: null,
    limited: false,
    firstSeen: 1,
    lastSeen: 2,
  };
  const input = {
    game: "forever" as const,
    skillLine: 197,
    skill: 49,
    max: 75,
    recipes: [recipe],
    known: [] as number[],
    sources: [{ spellId: 100, sources: [source], teachingItems: [] }],
  };
  assert.equal(computeSkillRoute(input).reached, 49);
  const trained = computeSkillRoute({ ...input, skill: 50, target: 52 });
  assert.deepEqual(trained.stretches[0]!.trainer, source);
  assert.equal(trained.stretches.length, 1);
  assert.equal(computeSkillRoute({ ...input, known: [100] }).target, 75);
  assert.equal(computeSkillRoute({ ...input, skill: 75, known: [100] }).target, 75);
  assert.equal(computeSkillRoute({ ...input, target: 999 }).target, 75);
  assert.equal(computeSkillRoute({ ...input, skill: 300, max: 300 }).status, "at_cap");
  const orange = {
    ...recipe,
    spellId: 200,
    minSkill: 50,
    thresholds: { orange: 50, yellow: 100, green: 110, grey: 120 },
    reagents: [{ itemId: 20, count: 100 }],
  };
  assert.equal(
    computeSkillRoute({
      ...input,
      skill: 75,
      max: 150,
      target: 76,
      recipes: [recipe, orange],
      known: [100, 200],
    }).stretches[0]!.spellId,
    200,
  );
  assert.equal(
    computeSkillRoute({ ...input, sources: [], recipes: [{ ...recipe, teachingItems: [9] }] })
      .stretches.length,
    0,
  );
  assert.equal(
    computeSkillRoute({
      ...input,
      recipes: [{ ...recipe, thresholds: { orange: 60, yellow: 1, green: 2, grey: 100 } }],
      known: [100],
    }).stretches.length,
    0,
  );
});

test("ranking uses reagent totals, held reagents, then ids and is independent of input order", () => {
  const other = { ...recipe, spellId: 101, reagents: [{ itemId: 20, count: 2 }] };
  const input = {
    game: "retail" as const,
    skillLine: 197,
    skill: 10,
    max: 12,
    recipes: [other, recipe],
    known: [100, 101],
    prices: { 10: 7 },
  };
  const first = computeSkillRoute(input);
  assert.equal(first.target, 12);
  assert.equal(first.stretches[0]!.spellId, 100);
  assert.deepEqual(first.reagents, [{ itemId: 10, count: 4, unitCopper: 7, totalCopper: 28 }]);
  assert.deepEqual(
    first,
    computeSkillRoute({ ...input, recipes: [recipe, other], known: [101, 100] }),
  );
  assert.equal(computeSkillRoute({ ...input, held: { 20: 3 } }).stretches[0]!.spellId, 101);
  assert.equal(computeSkillRoute({ ...input, target: 11 }).reached, 11);
  assert.equal(computeSkillRoute({ ...input, skill: 12 }).status, "needs_rank");
});

import { mkdtempSync, rmSync } from "node:fs";
import { createApp } from "../src/app.ts";
import { cleanSnapshot } from "../src/data.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
import { readSkillRoutes, skillRoutePlan } from "../src/skill-route.ts";
import { packIds } from "@unbored/contracts/packed";
import { cleanPlan } from "../src/plan.ts";
const pg = postgresPerFile();
for (const backend of BACKENDS)
  test(`skill Plans read game-specific Sections and observed prices (${backend})`, async () => {
    const dir = mkdtempSync(new URL(".skill-route-", import.meta.url).pathname);
    const runtime = createApp({
      database: pg(backend),
      dataDir: dir,
      ingest: "inline",
      blizzard: null,
      companionToken: "companion",
      plannerToken: "owner",
      webhook: { url: "", key: "", headerName: "" },
      log: () => {},
    });
    const store = runtime.store;
    try {
      for (const game of ["forever", "retail"] as const) {
        await store.db.run(
          `INSERT INTO ${store.db.pg ? "game.builds" : "game_builds"} (game, build, build_number, imported_at, achievements) VALUES (?, '1', 1, 1, 0)`,
          game,
        );
        await store.db.run(
          `INSERT INTO ${store.db.pg ? "game.profession_recipes" : "game_profession_recipes"} (game, build, skill_line, spell_id, ${store.db.body}) VALUES (?, '1', 197, 100, ?)`,
          game,
          JSON.stringify(recipe),
        );
        await store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game,
            account: "a",
            character: "Hero",
            realm: "Realm",
            savedAt: NOW,
            sections: {
              professions: {
                scope: "char",
                v: 1,
                body: { list: [{ skillLine: 197, name: "Tailoring", skill: 50, max: 75 }] },
              },
              recipes: {
                scope: "char",
                v: 1,
                body: { byProfession: { "197": { learned: packIds([]) } } },
              },
              trainerSeen: {
                scope: "char",
                v: 1,
                body: {
                  entries: [
                    {
                      npcId: 123,
                      npcName: "Teacher",
                      spellId: 100,
                      skillLine: 197,
                      requiredSkill: 50,
                      uiMapID: 37,
                      x: 12,
                      y: 34,
                      cost: 100,
                      seenAt: NOW,
                    },
                  ],
                },
              },
              merchantSeen: {
                scope: "char",
                v: 1,
                body: {
                  entries: [
                    {
                      npcId: 124,
                      npcName: "Vendor",
                      itemId: 10,
                      cost: 7,
                      numAvailable: -1,
                      seenAt: NOW,
                    },
                  ],
                },
              },
            },
          }),
          "pc",
          NOW,
        );
        const row = (await store.data.characters()).find((r) => r.game === game)!;
        const [entry] = await readSkillRoutes(store.db, row, 197, 52);
        assert.equal(entry!.route.reached, 52);
        const response = await runtime.app.request("/mcp", {
          method: "POST",
          headers: {
            authorization: "Bearer owner",
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "get_skill_route",
              arguments: { game, character: "Hero", skillLine: 197, target: 52 },
            },
          }),
        });
        const body = await response.text();
        const rpc = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1]!.trim() : body);
        assert.deepEqual(JSON.parse(rpc.result.content[0].text), entry!.route);
        assert.equal(entry!.route.reagents[0]!.unitCopper, 7);
        const plan = skillRoutePlan(entry!.route, "Tailoring", 1000);
        assert.equal(plan.tasks.length, 2);
        assert.deepEqual(
          [plan.tasks[0]!.mapID, plan.tasks[0]!.x, plan.tasks[0]!.y],
          [37, 0.12, 0.34],
        );
        assert.deepEqual(plan.tasks[1]!.complete, {
          kind: "profession",
          skillLine: 197,
          minSkill: 52,
        });
        assert.equal(cleanPlan(plan, 1000).tasks[1]!.complete!.kind, "profession");
        const ideas = await store.suggestionsForDevice("pc");
        const key = `${game === "forever" ? "forever/" : ""}Realm-Hero`;
        assert.equal(ideas.characters[key]?.[0]?.kind, "profession");
        await store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game,
            account: "a",
            character: "Hero",
            realm: "Realm",
            savedAt: NOW + 1,
            sections: {
              professions: {
                scope: "char",
                v: 1,
                body: { list: [{ skillLine: 197, name: "Tailoring", skill: 75, max: 75 }] },
              },
            },
          }),
          "pc",
          NOW + 1,
        );
        // Rank stops use profession sightings even before a recipe catalog is available.
        await store.db.run(
          `DELETE FROM ${store.db.pg ? "game.profession_recipes" : "game_profession_recipes"} WHERE game = ?`,
          game,
        );
        const [rank] = await readSkillRoutes(store.db, row, 197);
        assert.equal(rank!.route.status, "needs_rank");
        assert.deepEqual(rank!.route.stretches, []);
        const rankIdea = (await store.suggestionsForDevice("pc")).characters[key]![0]!;
        assert.equal(rankIdea.profession!.rankMax, 75);
        assert.equal(rankIdea.plan!.tasks.length, 1);
        assert.deepEqual(
          [rankIdea.plan!.tasks[0]!.mapID, rankIdea.plan!.tasks[0]!.x, rankIdea.plan!.tasks[0]!.y],
          [37, 0.12, 0.34],
        );
        assert.equal(rankIdea.plan!.tasks[0]!.note, "Visit Teacher.");
        assert.ok(!JSON.stringify(rank!.route).includes("requiredSkill"));
        assert.ok(!JSON.stringify(rank!.route).includes('"cost"'));
        const rankResponse = await runtime.app.request("/mcp", {
          method: "POST",
          headers: {
            authorization: "Bearer owner",
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "get_skill_route",
              arguments: { game, character: "Hero", skillLine: 197 },
            },
          }),
        });
        const rankBody = await rankResponse.text();
        const rankRpc = JSON.parse(
          rankBody.startsWith("event:") ? rankBody.split("data: ")[1]!.trim() : rankBody,
        );
        assert.deepEqual(JSON.parse(rankRpc.result.content[0].text), rank!.route);
      }
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

test("a newly reachable trainer is inserted between stretches and green never displaces yellow", () => {
  const start = { ...recipe, thresholds: { orange: 1, yellow: 11, green: 12, grey: 13 } };
  const next = {
    ...recipe,
    spellId: 101,
    trainer: true,
    minSkill: 12,
    thresholds: { orange: 12, yellow: 14, green: 16, grey: 18 },
  };
  const route = computeSkillRoute({
    game: "forever",
    skillLine: 197,
    skill: 10,
    max: 75,
    target: 14,
    recipes: [next, start],
    known: [100],
  });
  const plan = skillRoutePlan(route, "Tailoring", 1000);
  assert.deepEqual(
    plan.tasks.map((t) => t.id),
    ["craft:100:10", "train:101", "craft:101:12"],
  );
  assert.equal(route.stretches[0]!.expectedCrafts, 2);
  const yellow = {
    ...recipe,
    spellId: 102,
    thresholds: { orange: 1, yellow: 5, green: 15, grey: 25 },
    reagents: [{ itemId: 10, count: 100 }],
  };
  const onlyYellow = computeSkillRoute({
    game: "retail",
    skillLine: 197,
    skill: 12,
    max: 13,
    recipes: [yellow, start],
    known: [100, 102],
  });
  assert.equal(onlyYellow.stretches[0]!.spellId, 102);
  assert.equal(onlyYellow.stretches[0]!.slow, false);
});

for (const game of ["forever", "retail"] as const)
  test(`${game} respects the observed rank cap and offers rank training`, () => {
    const input = {
      game,
      skillLine: 197,
      skill: 74,
      max: 75,
      recipes: [{ ...recipe, thresholds: { orange: 1, yellow: 160, green: 180, grey: 200 } }],
      known: [100],
    };
    assert.equal(computeSkillRoute(input).reached, 75);
    assert.equal(computeSkillRoute({ ...input, target: 200 }).target, 75);
    assert.equal(computeSkillRoute({ ...input, skill: 100, max: 150 }).reached, 150);
    const rank = computeSkillRoute({ ...input, skill: 75 });
    assert.equal(rank.status, "needs_rank");
    assert.equal(rank.target, 75);
    assert.deepEqual(rank.stretches, []);
    const plan = skillRoutePlan(rank, "Tailoring", 1000);
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0]!.title, "Train the next rank of Tailoring at a trainer");
    assert.equal(plan.tasks[0]!.mapID, undefined);
    assert.deepEqual(plan.tasks[0]!.complete, {
      kind: "profession_rank",
      skillLine: 197,
      previousMax: 75,
    });
  });
