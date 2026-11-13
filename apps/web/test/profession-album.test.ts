import { expect, test } from "vite-plus/test";
import { professionViews } from "../shared/character-page";

const recipe = {
  spellId: 7421,
  skillLine: 333,
  name: "Runed Copper Rod",
  category: { id: 1, name: "Rods", order: 0 },
  minSkill: 1,
  thresholds: { orange: 1, yellow: 5, green: 8, grey: 10 },
  skillUps: 1,
  acquireMethod: 0,
  reagents: [{ itemId: 10940, count: 2 }],
  craftedItems: [],
  teachingItems: [],
};
test("album includes known catalog recipes with details and preserves unseen state", () => {
  const professions = { list: [{ skillLine: 333, name: "Enchanting", skill: 145, max: 150 }] };
  const [seen] = professionViews(
    professions,
    { byProfession: { "333": { learned: ["ids1", "5q5"] } } },
    [recipe],
    [],
    "forever",
    new Map([[10940, "Strange Dust"]]),
  );
  expect(seen!.album).toMatchObject([
    {
      known: true,
      name: "Runed Copper Rod",
      thresholds: { grey: 10 },
      reagents: [{ name: "Strange Dust" }],
    },
  ]);
  expect(seen!.missing).toEqual([]);
  expect(professionViews(professions, undefined, [recipe])[0]!.album[0]!.known).toBeNull();
});

test("Retail album includes expansion recipes and uses each tier's skill and learned set", () => {
  const [view] = professionViews(
    {
      list: [
        {
          skillLine: 333,
          name: "Enchanting",
          tiers: [
            { skillLine: 2486, name: "Classic Enchanting", skill: 5, max: 300 },
            { skillLine: 2874, name: "Khaz Algar Enchanting", skill: 80, max: 100 },
          ],
        },
      ],
    },
    { byProfession: { "2486": { learned: ["ids1", "5q5"] }, "2874": { learned: ["ids1"] } } },
    [
      { ...recipe, skillLine: 2486 },
      { ...recipe, spellId: 99, skillLine: 2874, minSkill: 75 },
    ],
    [],
    "retail",
  );
  expect(view!.total).toBe(2);
  expect(view!.known).toBe(1);
  expect(view!.album.map((r) => r.known)).toEqual([true, false]);
  expect(view!.album[1]!.difficulty.reasons).toContain("Needs 75: you have it");
});

import {
  professionSlug,
  albumFilter,
  matchesAlbumFilter,
  albumCategories,
  easiestMissing,
} from "../shared/profession-album";
import type { AlbumRecipe } from "@unbored/contracts/profession-progress";
function slot(name: string, extra: Partial<AlbumRecipe> = {}): AlbumRecipe {
  return {
    ...recipe,
    name,
    known: false,
    band: null,
    sources: [],
    teachingItemNames: [],
    reagents: [],
    difficulty: {
      score: 2,
      label: "medium",
      requiredSkill: null,
      source: "not_seen",
      canGetNow: false,
    },
    ...extra,
  };
}
test("profession slugs use English names and filters accept only a single known query value", () => {
  expect(professionSlug({ skillLine: 129, name: "Первая помощь" })).toBe("first-aid");
  expect(professionSlug({ skillLine: 333, name: "Enchanting" })).toBe("enchanting");
  expect(albumFilter("vendor")).toBe("vendor");
  expect(albumFilter(["missing", "now"])).toBe("all");
  expect(albumFilter("unknown")).toBe("all");
});
test("album filtering distinguishes missing, both vendor types, formula binding and observed zones", () => {
  const r = slot("Formula", {
    difficulty: {
      score: 2,
      label: "medium",
      requiredSkill: 80,
      source: "vendor_limited",
      canGetNow: true,
    },
    sources: [{ kind: "vendor", zone: "Orgrimmar" } as AlbumRecipe["sources"][number]],
  });
  for (const f of ["all", "missing", "now", "vendor", "zone:Orgrimmar"])
    expect(matchesAlbumFilter(r, f)).toBe(true);
  for (const f of ["trainer", "tradable", "bop", "unseen", "zone:Stormwind"])
    expect(matchesAlbumFilter(r, f)).toBe(false);
  expect(matchesAlbumFilter({ ...r, known: true }, "now")).toBe(false);
  expect(matchesAlbumFilter({ ...r, known: null }, "missing")).toBe(false);
  expect(
    matchesAlbumFilter(
      slot("Tradable", { difficulty: { ...r.difficulty, source: "tradable_formula" } }),
      "tradable",
    ),
  ).toBe(true);
  expect(
    matchesAlbumFilter(
      slot("Bound", { difficulty: { ...r.difficulty, source: "bop_formula" } }),
      "bop",
    ),
  ).toBe(true);
  expect(matchesAlbumFilter(slot("Unseen"), "unseen")).toBe(true);
});
test("missing order is score, required skill with unknown last, then English name; categories prefer known then size", () => {
  const a = slot("Zulu", { spellId: 1 });
  const b = slot("Bravo", { spellId: 2, difficulty: { ...a.difficulty, requiredSkill: 10 } });
  const c = slot("Alpha", { spellId: 3, difficulty: b.difficulty });
  const d = slot("Known", {
    spellId: 4,
    known: true,
    category: { id: 2, name: "Wands", order: 10 },
  });
  expect(easiestMissing([a, b, c, d], "all").map((r) => r.name)).toEqual([
    "Alpha",
    "Bravo",
    "Zulu",
  ]);
  expect(albumCategories([a, b, c, d]).map((c) => c.name)).toEqual(["Wands", "Rods"]);
});

test("Retail uses the addon's base-profession learned set for expansion recipes", () => {
  const [view] = professionViews(
    {
      list: [
        {
          skillLine: 333,
          name: "Enchanting",
          tiers: [{ skillLine: 2874, name: "Khaz Algar Enchanting", skill: 80, max: 100 }],
        },
      ],
    },
    { byProfession: { "333": { learned: ["ids1", "5q5"] } } },
    [
      { ...recipe, skillLine: 2874 },
      { ...recipe, spellId: 99, skillLine: 2874, minSkill: 75 },
    ],
    [],
    "retail",
  );
  expect(view!.album.map((r) => r.known)).toEqual([true, false]);
  expect(view!.missing[0]!.recipes[0]!.difficulty.reasons).toContain("Needs 75: you have it");
});
