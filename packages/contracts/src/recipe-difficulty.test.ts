import { expect, test } from "vite-plus/test";
import { recipeDifficulty } from "./recipe-difficulty.ts";
import type { ProfessionRecipe } from "./profession-catalog.ts";

const recipe: ProfessionRecipe = {
  spellId: 7426,
  skillLine: 333,
  name: "Enchant Chest - Minor Intellect",
  category: { id: 1, name: "Enchantments", order: 0 },
  minSkill: 1,
  thresholds: { orange: 1, yellow: 50, green: 70, grey: 90 },
  skillUps: 1,
  acquireMethod: 0,
  reagents: [],
  craftedItems: [],
  teachingItems: [6342],
  teaching: [{ itemId: 6342, requiredSkill: 20, quality: 2, bindOnPickup: false }],
};
test("a tradable green formula uses its client requirement and is available now", () => {
  expect(recipeDifficulty({ recipe, sources: [], skill: 145, rankMax: 150 })).toEqual({
    score: 2,
    label: "medium",
    requiredSkill: 20,
    source: "tradable_formula",
    canGetNow: true,
    reasons: ["Tradable green formula: auction house or a friend", "Needs 20: you have it"],
  });
});

import type { RecipeSource } from "./recipe-sources.ts";
const trainer: RecipeSource = {
  kind: "trainer",
  npcId: 1,
  npcName: "Teacher",
  uiMapID: null,
  zone: "Unknown zone",
  x: null,
  y: null,
  cost: null,
  requiredSkill: 20,
  itemId: null,
  limited: false,
  firstSeen: 1,
  lastSeen: 1,
};
const vendor: RecipeSource = { ...trainer, kind: "vendor", requiredSkill: 999 };
const bare = { ...recipe, teaching: [], teachingItems: [] };
for (const [name, facts, sources, score, source] of [
  ["trainer", bare, [trainer], 0, "trainer"],
  ["unseen without formula", bare, [], 2, "not_seen"],
  ["unlimited vendor", recipe, [vendor], 1, "vendor"],
  ["limited vendor", recipe, [{ ...vendor, limited: true }], 2, "vendor_limited"],
  ["tradable formula", recipe, [], 2, "tradable_formula"],
  ...[1, 2, 3, 4].map(
    (quality) =>
      [
        `BoP quality ${quality}`,
        { ...recipe, teaching: [{ ...recipe.teaching![0]!, quality, bindOnPickup: true }] },
        [],
        quality <= 2 ? 3 : 4,
        "bop_formula",
      ] as const,
  ),
] as const) {
  test(`source points: ${name}`, () => {
    const result = recipeDifficulty({
      recipe: { ...facts, teaching: facts.teaching ? [...facts.teaching] : undefined },
      sources: [...sources],
      skill: 145,
      rankMax: 150,
    });
    expect(result.score).toBe(score);
    expect(result.source).toBe(source);
    expect(result.label).toBe(score <= 1 ? "easy" : score <= 3 ? "medium" : "hard");
    expect(result.canGetNow).toBe(source !== "not_seen" && source !== "bop_formula");
  });
}
for (const [requiredSkill, skill, rankMax, score] of [
  [80, 80, 150, 0],
  [81, 80, 150, 1],
  [150, 80, 150, 1],
  [151, 80, 150, 2],
  [180, 80, 225, 1],
  [181, 80, 225, 2],
  [190, 80, 150, 3],
] as const)
  test(`skill points: ${requiredSkill} at ${skill}/${rankMax}`, () => {
    const result = recipeDifficulty({
      recipe: bare,
      sources: [{ ...trainer, requiredSkill }],
      skill,
      rankMax,
    });
    expect(result.score).toBe(score);
    expect(result.canGetNow).toBe(requiredSkill <= skill);
  });
test("lowest source wins regardless of order; teaching skill takes precedence over trainers", () => {
  for (const sources of [
    [vendor, trainer],
    [trainer, vendor],
  ]) {
    expect(recipeDifficulty({ recipe, sources, skill: 20, rankMax: 75 })).toMatchObject({
      score: 0,
      source: "trainer",
      requiredSkill: 20,
    });
  }
  expect(
    recipeDifficulty({
      recipe,
      sources: [{ ...trainer, requiredSkill: 100 }],
      skill: 20,
      rankMax: 75,
    }).requiredSkill,
  ).toBe(20);
  const multiple = {
    ...recipe,
    teaching: [{ ...recipe.teaching![0]!, bindOnPickup: true, quality: 4 }, recipe.teaching![0]!],
  };
  expect(recipeDifficulty({ recipe: multiple, sources: [], skill: 20, rankMax: 75 }).source).toBe(
    "tradable_formula",
  );
});
test("unknown requirements never use Forever thresholds or vendor requirements; Retail keeps minSkill", () => {
  expect(recipeDifficulty({ recipe: bare, sources: [], skill: 145, rankMax: 150 })).toMatchObject({
    requiredSkill: null,
    canGetNow: false,
  });
  expect(
    recipeDifficulty({ recipe: bare, sources: [vendor], skill: 145, rankMax: 150 }).requiredSkill,
  ).toBeNull();
  expect(
    recipeDifficulty({
      recipe: { ...bare, minSkill: 80 },
      sources: [],
      skill: 145,
      rankMax: 150,
      game: "retail",
    }),
  ).toMatchObject({ requiredSkill: 80, score: 1 });
  expect(recipeDifficulty({ recipe, sources: [], skill: null, rankMax: null }).canGetNow).toBe(
    false,
  );
});
test("four distinct reagents add one point, including across the hard label boundary", () => {
  const bop = { ...recipe, teaching: [{ ...recipe.teaching![0]!, bindOnPickup: true }] };
  const reagents = [1, 2, 3, 3].map((itemId) => ({ itemId, count: 20 }));
  expect(
    recipeDifficulty({ recipe: { ...bop, reagents }, sources: [], skill: 145, rankMax: 150 }).score,
  ).toBe(3);
  const result = recipeDifficulty({
    recipe: { ...bop, reagents: [...reagents, { itemId: 4, count: 1 }] },
    sources: [],
    skill: 145,
    rankMax: 150,
  });
  expect(result).toMatchObject({ score: 4, label: "hard" });
  expect(result.reasons).toContain("4 different reagents");
});

for (const [requiredSkill, reagentCount, label] of [
  [20, 0, "easy"],
  [21, 0, "easy"],
  [76, 0, "medium"],
  [121, 0, "medium"],
  [121, 4, "hard"],
] as const)
  test(`label boundary at ${requiredSkill} with ${reagentCount} reagents is ${label}`, () => {
    const facts = {
      ...bare,
      reagents: Array.from({ length: reagentCount }, (_, itemId) => ({ itemId, count: 1 })),
    };
    expect(
      recipeDifficulty({
        recipe: facts,
        sources: [{ ...trainer, requiredSkill }],
        skill: 20,
        rankMax: 75,
      }).label,
    ).toBe(label);
  });

test("a trainer without a requirement does not make unknown skill available now", () => {
  expect(
    recipeDifficulty({
      recipe: { ...bare, minSkill: 80 },
      sources: [{ ...trainer, requiredSkill: null }],
      skill: 145,
      rankMax: 150,
    }),
  ).toMatchObject({ requiredSkill: null, score: 1, canGetNow: false });
});
