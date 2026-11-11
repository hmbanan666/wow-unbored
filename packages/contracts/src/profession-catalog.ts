/** Client-table facts only. AcquireMethod is deliberately not a source classification. */
export type ProfessionRecipe = {
  spellId: number;
  skillLine: number;
  name: string | null;
  category: { id: number; name: string; order: number };
  minSkill: number;
  thresholds: { orange: number; yellow: number; green: number; grey: number };
  skillUps: number;
  acquireMethod: number;
  /** Confirmed trainer flag only; never inferred from raw AcquireMethod. */
  trainer?: boolean;
  reagents: { itemId: number; count: number }[];
  craftedItems: number[];
  teachingItems: number[];
};
export type RecipeBand = "orange" | "yellow" | "green" | "grey";
export function recipeBand(recipe: ProfessionRecipe, skill: number): RecipeBand {
  if (skill >= recipe.thresholds.grey) return "grey";
  if (skill >= recipe.thresholds.green) return "green";
  if (skill >= recipe.thresholds.yellow) return "yellow";
  return "orange";
}
