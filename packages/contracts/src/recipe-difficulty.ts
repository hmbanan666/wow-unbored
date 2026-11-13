import type { ProfessionRecipe } from "./profession-catalog.ts";
import type { RecipeSource } from "./recipe-sources.ts";

export type RecipeDifficulty = {
  score: number;
  label: "easy" | "medium" | "hard";
  reasons: string[];
  requiredSkill: number | null;
  source: "trainer" | "vendor" | "vendor_limited" | "tradable_formula" | "bop_formula" | "not_seen";
  canGetNow: boolean;
};

/** ADR 0101. Client facts and observations only; orange = 1 is not a Forever requirement. */
export function recipeDifficulty({
  recipe,
  sources,
  skill,
  rankMax,
  game = "forever",
}: {
  recipe: ProfessionRecipe;
  sources: RecipeSource[];
  skill: number | null;
  rankMax: number | null;
  game?: "retail" | "forever";
}): RecipeDifficulty {
  const minimum = (values: (number | null)[]) => {
    const known = values.filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
    return known.length ? Math.min(...known) : null;
  };
  const requiredSkill =
    minimum((recipe.teaching ?? []).map((t) => t.requiredSkill)) ??
    minimum(sources.filter((s) => s.kind === "trainer").map((s) => s.requiredSkill)) ??
    (game === "retail" && recipe.minSkill > 0 ? recipe.minSkill : null);
  const candidates: { score: number; source: RecipeDifficulty["source"]; reason: string }[] = [];
  for (const s of sources) {
    candidates.push(
      s.kind === "trainer"
        ? { score: 0, source: "trainer", reason: "Seen at a trainer" }
        : s.limited
          ? { score: 2, source: "vendor_limited", reason: "Seen at a vendor: limited supply" }
          : { score: 1, source: "vendor", reason: "Seen at a vendor: unlimited supply" },
    );
  }
  for (const t of recipe.teaching ?? []) {
    const colour = ["grey", "white", "green", "blue", "epic"][t.quality] ?? "";
    const formula = colour ? `${colour} formula` : "formula";
    if (t.bindOnPickup)
      candidates.push({
        score: t.quality <= 2 ? 3 : 4,
        source: "bop_formula",
        reason: `${formula[0]!.toUpperCase()}${formula.slice(1)}, bind on pickup: you get it yourself. Source not seen yet`,
      });
    else if (!sources.length)
      candidates.push({
        score: 2,
        source: "tradable_formula",
        reason: `Tradable ${formula}: auction house or a friend`,
      });
  }
  const best = candidates.sort((a, b) => a.score - b.score)[0] ?? {
    score: 1,
    source: "not_seen" as const,
    reason: recipe.teachingItems.length
      ? "Formula details: not seen yet"
      : "No formula item. Not seen at a trainer yet",
  };
  let score = best.score;
  const reasons = [best.reason];
  if (requiredSkill === null) {
    score++;
    reasons.push("Skill needed: unknown until seen");
  } else if (skill !== null && requiredSkill <= skill) {
    reasons.push(`Needs ${requiredSkill}: you have it`);
  } else {
    const nextRank = rankMax !== null && requiredSkill > rankMax;
    score += nextRank ? 2 : 1;
    reasons.push(
      `Needs ${requiredSkill}: ${nextRank ? "next rank first" : skill === null ? "your skill is not known yet" : `you have ${skill}`}`,
    );
    if (skill !== null && requiredSkill - skill > 100) {
      score++;
      reasons.push("More than 100 skill points away");
    }
  }
  const reagents = new Set(recipe.reagents.map((r) => r.itemId)).size;
  if (reagents >= 4) {
    score++;
    reasons.push(`${reagents} different reagents`);
  }
  return {
    score,
    label: score <= 1 ? "easy" : score <= 3 ? "medium" : "hard",
    reasons,
    requiredSkill,
    source: best.source,
    canGetNow:
      requiredSkill !== null &&
      skill !== null &&
      requiredSkill <= skill &&
      (sources.length > 0 || (recipe.teaching ?? []).some((t) => !t.bindOnPickup)),
  };
}
