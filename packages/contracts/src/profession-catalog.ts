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
  /** ADR 0101: requiredSkill is the item rank only when its skill line matches. */
  teaching?: {
    itemId: number;
    requiredSkill: number | null;
    quality: number;
    bindOnPickup: boolean;
  }[];
};
export type RecipeBand = "orange" | "yellow" | "green" | "grey";
export function recipeBand(recipe: ProfessionRecipe, skill: number): RecipeBand {
  if (skill >= recipe.thresholds.grey) return "grey";
  if (skill >= recipe.thresholds.green) return "green";
  if (skill >= recipe.thresholds.yellow) return "yellow";
  return "orange";
}
