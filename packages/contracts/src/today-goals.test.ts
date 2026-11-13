import { expect, test } from "vite-plus/test";
import { professionProgress } from "./profession-progress.ts";
import { computeTodayGoals, todayGoalComplete } from "./today-goals.ts";

function unopened() {
  return professionProgress({
    game: "forever",
    professions: { list: [{ skillLine: 333, name: "Enchanting", skill: 145, max: 150 }] },
    recipes: {},
    catalog: [],
    sightings: [],
    zones: new Map(),
    items: new Map(),
  })[0]!;
}
test("a profession whose recipes were never read asks for that read, even at its rank cap", () => {
  const p = unopened();
  expect(p).toBeDefined();
  const goals = computeTodayGoals(p, "forever", []);
  expect(goals.map((g) => g.title)).toEqual(["Open your Enchanting window once"]);
  expect(
    computeTodayGoals({ ...p, skill: 150, routes: progress(150).routes }, "forever", [])[0]!.target
      .kind,
  ).toBe("window");
  expect(todayGoalComplete(goals[0]!, p, [])).toBe(false);
  expect(todayGoalComplete(goals[0]!, { ...p, known: 0 }, [])).toBe(true);
});

import type { ProfessionRecipe } from "./profession-catalog.ts";
import { packIds } from "./packed.ts";
import type { RecipeSighting } from "./recipe-sources.ts";
const recipe: ProfessionRecipe = {
  spellId: 1,
  skillLine: 333,
  name: "Practice enchant",
  category: { id: 1, name: "Enchants", order: 1 },
  minSkill: 1,
  thresholds: { orange: 1, yellow: 150, green: 160, grey: 170 },
  skillUps: 1,
  acquireMethod: 0,
  reagents: [{ itemId: 10, count: 2 }],
  craftedItems: [],
  teachingItems: [],
};
const formula: ProfessionRecipe = {
  ...recipe,
  spellId: 2,
  name: "New enchant",
  teachingItems: [20],
  teaching: [{ itemId: 20, requiredSkill: 100, quality: 2, bindOnPickup: false }],
};
function progress(skill = 145, catalog = [recipe, formula], sightings: RecipeSighting[] = []) {
  return professionProgress({
    game: "forever",
    professions: { list: [{ skillLine: 333, name: "Enchanting", skill, max: 150 }] },
    recipes: { byProfession: { 333: { learned: packIds([1]) } } },
    catalog,
    sightings,
    zones: new Map([[5, "Observed zone"]]),
    items: new Map([[10, "Dust"]]),
  })[0]!;
}
test("a known recipe gives the first stretch and totals, at cap gives rank training", () => {
  const p = progress();
  expect(computeTodayGoals(p, "forever", [])[0]).toMatchObject({
    title: "Craft 5 x Practice enchant",
    from: 145,
    crafts: 5,
    reagents: [{ itemId: 10, name: "Dust", count: 10 }],
    target: { kind: "skill", to: 150 },
  });
  const rank = computeTodayGoals(progress(150), "forever", [])[0]!;
  expect(rank.target).toMatchObject({ kind: "rank", previousMax: 150 });
  expect(todayGoalComplete(rank, progress(150), [])).toBe(false);
  expect(todayGoalComplete(rank, { ...progress(150), max: 225 }, [])).toBe(true);
  expect(computeTodayGoals(progress(150), "retail", []).some((g) => g.target.kind === "rank")).toBe(
    false,
  );
});
test("easiest missing recipe uses score, required skill, name, and a tradable route", () => {
  const cheap = { ...formula, spellId: 4, name: "A enchant" };
  const p = progress(145, [
    recipe,
    formula,
    cheap,
    { ...formula, spellId: 5, teaching: [{ ...formula.teaching![0]!, requiredSkill: 120 }] },
  ]);
  const g = computeTodayGoals(p, "forever", []).find((g) => g.target.kind === "recipe")!;
  expect(g).toMatchObject({
    title: "Learn A enchant",
    route: "Auction house or a friend",
    target: { spellId: 4 },
  });
  expect(todayGoalComplete(g, p, [])).toBe(false);
  expect(
    todayGoalComplete(g, { ...p, album: p.album.map((r) => ({ ...r, known: true })) }, []),
  ).toBe(true);
});
test("a sighted trainer supplies the observed NPC, zone and coordinates", () => {
  const sighting: RecipeSighting = {
    kind: "trainer",
    spell_id: 2,
    recipe_spell_id: null,
    item_id: null,
    skill_line: 333,
    recipe_name: null,
    locale: "enUS",
    npc_id: 8,
    npc_name: "Observed trainer",
    ui_map_id: 5,
    x: 12.3,
    y: 45.6,
    cost: null,
    required_skill: 100,
    limited: 0,
    first_seen: 1,
    last_seen: 2,
  };
  const g = computeTodayGoals(progress(145, [recipe, formula], [sighting]), "forever", []).find(
    (g) => g.target.kind === "recipe",
  )!;
  expect(g.route).toBe("Observed trainer · Observed zone · (12.3, 45.6)");
  expect(g.waypoint).toMatchObject({ npcId: 8, x: 12.3, y: 45.6 });
});
test("coverage takes priority over next unlock, observes only new evidence, and sets are bounded and deterministic", () => {
  const unseen = { ...recipe, spellId: 3, name: "Unseen enchant" };
  const next = {
    ...formula,
    spellId: 6,
    teaching: [{ ...formula.teaching![0]!, requiredSkill: 160 }],
  };
  const catalog = [recipe, formula, unseen, next];
  const p = progress(145, catalog);
  const goals = computeTodayGoals(p, "forever", ["b", "a"]);
  expect(goals.map((g) => g.target.kind)).toEqual(["skill", "recipe", "coverage"]);
  expect(
    computeTodayGoals(progress(145, [...catalog].reverse()), "forever", ["a", "b", "a"]),
  ).toEqual(goals);
  expect(todayGoalComplete(goals[2]!, p, ["a", "b"])).toBe(false);
  expect(todayGoalComplete(goals[2]!, p, ["a", "b", "c"])).toBe(true);
  const unlock = computeTodayGoals(progress(145, [recipe, next]), "forever", []).at(-1)!;
  expect(unlock.target).toMatchObject({ kind: "unlock", to: 160 });
  expect(todayGoalComplete(unlock, progress(160), [])).toBe(true);
  expect(todayGoalComplete(goals[0]!, progress(149), [])).toBe(false);
  expect(todayGoalComplete(goals[0]!, progress(150), [])).toBe(true);
});
