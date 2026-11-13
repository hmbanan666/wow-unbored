import { professionViews } from "../../shared/character-page";
import type { CharacterPage } from "../../shared/character-page";
import type { ProfessionRecipe } from "@unbored/contracts/profession-catalog";
import { computeSkillRoute } from "@unbored/contracts/skill-route";
import { packIds } from "@unbored/contracts/packed";
import rows from "./enchanting.json";

/** Offline client-shaped fixture from the approved mockup, never a production data source.
 * Formula/reagent ids and sightings below are synthetic. Kania's skill shape is retained. */
const items = new Map<number, string>();
const categories = new Map<string, number>();
const catalog: ProfessionRecipe[] = rows.map((row, index) => {
  const [id, name, category, grey, rawFormula, required, rawReagents] = row;
  const cat = String(category);
  if (!categories.has(cat)) categories.set(cat, categories.size + 1);
  const formula = rawFormula as { name: string; quality: string; bop: boolean } | null;
  const itemId = 900000 + index;
  if (formula) items.set(itemId, formula.name);
  return {
    spellId: Number(id),
    skillLine: 333,
    name: String(name),
    category: { id: categories.get(cat)!, name: cat, order: 0 },
    minSkill: 1,
    thresholds: {
      orange: 1,
      yellow: Number(grey) - 40,
      green: Number(grey) - 20,
      grey: Number(grey),
    },
    skillUps: 1,
    acquireMethod: 0,
    craftedItems: [],
    teachingItems: formula ? [itemId] : [],
    teaching: formula
      ? [
          {
            itemId,
            requiredSkill: required === null ? null : Number(required),
            quality: ["grey", "white", "green", "blue", "epic"].indexOf(formula.quality),
            bindOnPickup: formula.bop,
          },
        ]
      : [],
    reagents: (rawReagents as string[]).map((r, i) => {
      const reagentId = 1000000 + index * 10 + i;
      const [count, ...parts] = r.split("× ");
      const name = parts.join("× ");
      if (!/^\d+$/.test(name)) items.set(reagentId, name);
      return { itemId: reagentId, count: Number(count) };
    }),
  };
});
const tailoring = [
  "Bolt of Linen Cloth",
  "Linen Belt",
  "Linen Cloak",
  "Brown Linen Robe",
  "White Linen Robe",
  "Linen Bag",
  "Reinforced Linen Cape",
  "Woolen Bag",
  "Gray Woolen Robe",
  "Double-stitched Woolen Shoulders",
  "Pearl-clasped Cloak",
  "Green Woolen Bag",
  "Bolt of Silk Cloth",
  "Azure Silk Hood",
  "Silk Headband",
  "Crimson Silk Vest",
].map((name, i): ProfessionRecipe => ({
  spellId: 2000000 + i,
  skillLine: 197,
  name,
  category: { id: 100 + (i < 7 ? 0 : 1), name: i < 7 ? "Linen" : "Wool and silk", order: 0 },
  minSkill: 1,
  thresholds: { orange: 1, yellow: 80, green: 100, grey: 120 },
  skillUps: 1,
  acquireMethod: 0,
  craftedItems: [],
  teachingItems: [],
  reagents: [],
}));
export function albumCharacter(
  state: "unopened" | "empty" | "known" = "known",
  game: "forever" | "retail" = "forever",
): CharacterPage {
  return {
    game,
    realm: "CAMWOW EU4 Realm 3 PvE",
    name: "Kania",
    professions: professionViews(
      {
        list: [
          { skillLine: 333, name: "Enchanting", skill: 145, max: 150 },
          { skillLine: 197, name: "Tailoring", skill: 112, max: 150 },
        ],
      },
      {
        byProfession: {
          ...(state === "unopened"
            ? {}
            : {
                "333": {
                  learned: packIds(
                    state === "known"
                      ? [
                          7421, 7418, 7428, 7457, 7748, 7771, 7776, 7782, 7788, 7857, 7863, 13607,
                          13620, 13622, 13626,
                        ]
                      : [],
                  ),
                },
              }),
          "197": { learned: packIds(tailoring.slice(0, 7).map((r) => r.spellId)) },
        },
      },
      [...catalog, ...tailoring],
      [],
      game,
      items,
    ).map((profession) => ({
      ...profession,
      routes: [
        {
          name: profession.name,
          route: computeSkillRoute({
            game,
            skillLine: profession.skillLine,
            skill: profession.skill,
            max: profession.max,
            recipes: [...catalog, ...tailoring],
            known: profession.album.filter((r) => r.known).map((r) => r.spellId),
            sources: [],
            itemNames: Object.fromEntries(items),
          }),
        },
      ],
    })),
  };
}
