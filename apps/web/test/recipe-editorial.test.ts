import { expect, test } from "vite-plus/test";
import { recipeCopy } from "../shared/recipe-editorial";
import { publicAlbum } from "./fixtures/public-professions";

test("a Forever recipe snippet gives its verified skill and materials", () => {
  const { base } = publicAlbum();
  const recipe = {
    ...base.album[0]!,
    name: "Ironwood Blade",
    reagents: [{ itemId: 1, name: "Heavy Thorium Bar", count: 14 }],
    difficulty: { ...base.album[0]!.difficulty, requiredSkill: 300 },
  };
  const copy = recipeCopy(recipe, "Blacksmithing", "forever");
  expect(copy.title).toBe("Ironwood Blade recipe · Blacksmithing · WoW Forever");
  expect(copy.description).toMatch(/Blacksmithing 300/);
  expect(copy.description).toContain("Heavy Thorium Bar ×14");
  expect(copy.description.length).toBeGreaterThanOrEqual(120);
  expect(copy.description.length).toBeLessThanOrEqual(155);
});

test("an unobserved learning source cannot turn the catalog minimum into a requirement", () => {
  const { base } = publicAlbum();
  const original = base.album[0]!;
  for (const name of ["Enchanted Lute", "Fiery Plate Gauntlets of the Hidden Technique"]) {
    const copy = recipeCopy(
      {
        ...original,
        name,
        minSkill: 1,
        sources: [],
        teachingItemNames: [],
        reagents: [],
        difficulty: { ...original.difficulty, requiredSkill: null },
      },
      "Enchanting",
      "forever",
    );
    expect(copy.title.length).toBeLessThanOrEqual(60);
    expect(copy.title).toMatch(/recipe.*WoW Forever/);
    expect(copy.description.length).toBeGreaterThanOrEqual(120);
    expect(copy.description.length).toBeLessThanOrEqual(155);
    expect(copy.description).not.toMatch(/requires|drop|binds|trainer teaches/i);
    expect(copy.description).toContain("No materials are listed");
  }
});
