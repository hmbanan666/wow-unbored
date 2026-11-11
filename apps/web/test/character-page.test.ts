import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { characterHref, professionViews } from "../shared/character-page.ts";

test("character links encode each realm and name segment and separate games", () => {
  assert.equal(
    characterHref({ game: "forever", realm: "A / B", name: "Мира Sun" }),
    "/my/forever/A%20%2F%20B/%D0%9C%D0%B8%D1%80%D0%B0%20Sun",
  );
});

test("profession counts come only from its learned packed set, and unseen is not zero", () => {
  assert.deepEqual(
    professionViews(
      {
        list: [
          { skillLine: 171, name: "Alchemy", skill: 112, max: 150 },
          { skillLine: 185, name: "Cooking", skill: 0 },
          { skillLine: 164, name: "Blacksmithing" },
        ],
      },
      {
        byProfession: {
          "171": { learned: ["ids1", "2s,2,1,1"] },
          "185": { learned: ["ids1"] },
        },
      },
    ),
    [
      {
        skillLine: 171,
        name: "Alchemy",
        skill: 112,
        max: 150,
        known: 4,
        total: null,
        uncatalogued: 0,
        missing: [],
      },
      {
        skillLine: 185,
        name: "Cooking",
        skill: 0,
        max: null,
        known: 0,
        total: null,
        uncatalogued: 0,
        missing: [],
      },
      {
        skillLine: 164,
        name: "Blacksmithing",
        skill: null,
        max: null,
        known: null,
        total: null,
        uncatalogued: 0,
        missing: [],
      },
    ],
  );
  assert.deepEqual(professionViews(undefined, undefined), []);
});

test("catalog totals retain unknown learned recipes and group missing colours by source", () => {
  const recipe = {
    spellId: 2334,
    skillLine: 171,
    name: "Elixir of Minor Fortitude",
    category: { id: 2450, name: "Elixirs", order: 30 },
    minSkill: 50,
    thresholds: { orange: 50, yellow: 80, green: 100, grey: 120 },
    skillUps: 1,
    acquireMethod: 0,
    reagents: [],
    craftedItems: [],
    teachingItems: [],
  };
  for (const [skill, band] of [
    [79, "orange"],
    [80, "yellow"],
    [100, "green"],
    [120, "grey"],
  ] as const) {
    const [view] = professionViews(
      { list: [{ skillLine: 171, name: "Alchemy", skill }] },
      { byProfession: { "171": { learned: ["ids1", "1"] } } },
      [recipe],
    );
    assert.equal(view.known, 1);
    assert.equal(view.total, 1);
    assert.equal(view.uncatalogued, 1);
    assert.equal(view.missing[0].id, "unseen");
    assert.deepEqual(view.missing[0].recipes, [
      { ...recipe, band, sources: [], teachingItemNames: [] },
    ]);
  }
  const [unseen] = professionViews({ list: [{ skillLine: 171, name: "Alchemy" }] }, undefined, [
    recipe,
  ]);
  assert.equal(unseen.known, null);
  assert.deepEqual(unseen.missing, []);
  const [empty] = professionViews(
    { list: [{ skillLine: 171, name: "Alchemy" }] },
    { byProfession: { "171": { learned: ["ids1"] } } },
    [],
  );
  assert.equal(empty.known, 0);
  assert.equal(empty.total, null);
});

test("missing recipe source groups follow evidence order and keep every observed place", () => {
  const catalog = Array.from({ length: 5 }, (_, i) => ({
    spellId: i + 1,
    skillLine: 171,
    name: `Recipe ${i + 1}`,
    category: { id: 1, name: "Potions", order: 0 },
    minSkill: 1,
    thresholds: { orange: 1, yellow: 20, green: 30, grey: 40 },
    skillUps: 1,
    acquireMethod: 0,
    reagents: [],
    craftedItems: [],
    teachingItems: i === 3 ? [2555] : [],
  }));
  const place = {
    npcId: 123,
    npcName: "Teacher",
    zone: "Elwynn Forest",
    uiMapID: 37,
    x: 10,
    y: 20,
    cost: 100,
    requiredSkill: 1,
    itemId: null,
    firstSeen: 1,
    lastSeen: 2,
  };
  const sources = [
    {
      spellId: 1,
      teachingItems: [],
      sources: [{ ...place, kind: "trainer" as const, limited: false }],
    },
    {
      spellId: 2,
      teachingItems: [],
      sources: [{ ...place, kind: "vendor" as const, limited: false }],
    },
    {
      spellId: 3,
      teachingItems: [],
      sources: [{ ...place, kind: "vendor" as const, limited: true }],
    },
  ];
  const [view] = professionViews(
    { list: [{ skillLine: 171, name: "Alchemy" }] },
    { byProfession: { "171": { learned: ["ids1"] } } },
    catalog.reverse(),
    sources,
  );
  assert.deepEqual(
    view.missing.map((g) => g.id),
    ["trainer", "vendor", "limited", "item", "unseen"],
  );
  assert.equal(view.missing[0].recipes[0].sources[0].zone, "Elwynn Forest");
  assert.deepEqual(view.missing[3].recipes[0].teachingItems, [2555]);
});
