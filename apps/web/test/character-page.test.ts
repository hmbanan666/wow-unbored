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
        aliases: [],
        difficultyCounts: { easy: 0, medium: 0, hard: 0 },
        missing: [],
        album: [],
      },
      {
        skillLine: 185,
        name: "Cooking",
        skill: 0,
        max: null,
        known: 0,
        total: null,
        uncatalogued: 0,
        aliases: [],
        difficultyCounts: { easy: 0, medium: 0, hard: 0 },
        missing: [],
        album: [],
      },
      {
        skillLine: 164,
        name: "Blacksmithing",
        skill: null,
        max: null,
        known: null,
        total: null,
        uncatalogued: 0,
        aliases: [],
        difficultyCounts: { easy: 0, medium: 0, hard: 0 },
        missing: [],
        album: [],
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
    const missing = view.missing[0].recipes[0];
    assert.equal(missing.spellId, recipe.spellId);
    assert.equal(missing.band, band);
    assert.equal(missing.difficulty.requiredSkill, 50);
    assert.deepEqual(missing.teachingItemNames, []);
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

test("Kania's Forever profession aliases collapse to catalog lines and retain learned recipes", () => {
  const professions = {
    list: [
      { skillLine: 333, name: "Enchanting", skill: 145, max: 150 },
      { skillLine: 2940, name: "Enchanting", skill: 145, max: 150 },
      { skillLine: 185, name: "Cooking", skill: 145, max: 150 },
      { skillLine: 2939, name: "Cooking", skill: 145, max: 150 },
      { skillLine: 129, name: "First Aid", skill: 145, max: 150 },
      { skillLine: 2942, name: "First Aid", skill: 145, max: 150 },
      {
        skillLine: 197,
        name: "Tailoring",
        skill: 145,
        max: 150,
        tiers: [{ skillLine: 2948, name: "Tailoring", skill: 145, max: 150 }],
      },
      { skillLine: 356, name: "Fishing", skill: 145, max: 150 },
      { skillLine: 2943, name: "Fishing", skill: 145, max: 150 },
    ],
  };
  const recipe = {
    spellId: 1,
    skillLine: 333,
    name: "Enchant",
    category: { id: 1, name: "Enchantments", order: 0 },
    minSkill: 1,
    thresholds: { orange: 1, yellow: 130, green: 150, grey: 170 },
    skillUps: 1,
    acquireMethod: 0,
    reagents: [{ itemId: 10940, count: 2 }],
    craftedItems: [],
    teachingItems: [6342],
    teaching: [{ itemId: 6342, requiredSkill: 20, quality: 2, bindOnPickup: false }],
  };
  const catalog = [333, 185, 129, 197, 356].map((skillLine) => ({ ...recipe, skillLine }));
  catalog.push({ ...recipe, spellId: 2 });
  const views = professionViews(
    professions,
    { byProfession: { "2940": { learned: ["ids1", "1"] } } },
    catalog,
    [],
    "forever",
    new Map([[10940, "Strange Dust"]]),
  );
  assert.equal(views.length, 5);
  const enchanting = views.find((p) => p.skillLine === 333)!;
  assert.deepEqual(enchanting.aliases, [2940]);
  assert.equal(enchanting.known, 1);
  assert.equal(enchanting.total, 2);
  assert.deepEqual(enchanting.difficultyCounts, { easy: 0, medium: 1, hard: 0 });
  assert.equal(enchanting.missing[0].recipes[0].difficulty.canGetNow, true);
  assert.equal(enchanting.missing[0].recipes[0].reagents[0].name, "Strange Dust");
  assert.equal(professionViews(professions, undefined, catalog, [], "retail").length, 9);
});

test("Forever trainer sightings under an alias resolve to the catalog profession", async () => {
  const { professionProgress } = await import("@unbored/contracts/profession-progress");
  const catalog = [
    {
      spellId: 7426,
      skillLine: 333,
      name: "Enchant",
      category: { id: 1, name: "Enchantments", order: 0 },
      minSkill: 1,
      thresholds: { orange: 1, yellow: 130, green: 150, grey: 170 },
      skillUps: 1,
      acquireMethod: 0,
      reagents: [],
      craftedItems: [],
      teachingItems: [],
    },
  ];
  const [view] = professionProgress({
    game: "forever",
    catalog,
    professions: {
      list: [
        { skillLine: 2940, name: "Enchanting", skill: 145, max: 150 },
        { skillLine: 333, name: "Enchanting", skill: 145, max: 150 },
      ],
    },
    recipes: { byProfession: { "2940": { learned: ["ids1"] } } },
    sightings: [
      {
        kind: "trainer",
        spell_id: null,
        recipe_spell_id: null,
        item_id: null,
        skill_line: 2940,
        recipe_name: "Enchant",
        locale: "enUS",
        npc_id: 1,
        npc_name: "Teacher",
        ui_map_id: null,
        x: null,
        y: null,
        cost: null,
        required_skill: 80,
        limited: 0,
        first_seen: 1,
        last_seen: 2,
      },
    ],
    zones: new Map(),
    items: new Map(),
  });
  assert.equal(view.skillLine, 333);
  assert.equal(view.missing[0].recipes[0].difficulty.requiredSkill, 80);
  assert.equal(view.missing[0].recipes[0].difficulty.source, "trainer");
  assert.equal(view.missing[0].recipes[0].difficulty.canGetNow, true);
});
