import type { AlbumRecipe } from "@unbored/contracts/profession-progress";
import { gameName, type Game, type PublicRecipe } from "./public-professions.ts";

export function byRecipeSkill(a: AlbumRecipe, b: AlbumRecipe) {
  return (
    (a.difficulty.requiredSkill ?? Infinity) - (b.difficulty.requiredSkill ?? Infinity) ||
    a.thresholds.grey - b.thresholds.grey ||
    (a.name ?? "").localeCompare(b.name ?? "", "en") ||
    a.spellId - b.spellId
  );
}

export function learningSource(recipe: AlbumRecipe) {
  const source = recipe.sources[0];
  if (source) return `Observed ${source.kind}: ${source.npcName} · ${source.zone}`;
  const item = recipe.teachingItemNames.find((item) => item.name);
  if (item) return item.name!;
  return "Learning source unconfirmed";
}

const shortProfession: Record<string, string> = {
  Blacksmithing: "Smithing",
  Engineering: "Eng.",
  Leatherworking: "LW",
  Enchanting: "Ench.",
  Tailoring: "Tail.",
  Alchemy: "Alch.",
};

export function recipeCopy(recipe: PublicRecipe, profession: string, game: Game) {
  const name = recipe.name!;
  const realm = gameName(game);
  let suffix = ` recipe · ${profession} · ${realm}`;
  if (name.length + suffix.length > 60) suffix = ` recipe: ${profession}, ${realm}`;
  if (name.length + suffix.length > 60)
    suffix = ` recipe | ${shortProfession[profession] ?? profession} | ${realm}`;
  const titleName =
    name.length + suffix.length <= 60 ? name : name.slice(0, 59 - suffix.length).trimEnd() + "…";
  const skill = recipe.difficulty.requiredSkill;
  const lead =
    skill === null
      ? `${name} is ${/^[aeiou]/i.test(profession) ? "an" : "a"} ${profession} recipe in ${realm}.`
      : `${name} requires ${profession} ${skill} in ${realm}.`;
  const material = recipe.reagents.filter((r) => r.name).sort((a, b) => b.count - a.count)[0];
  const count = recipe.reagents.length;
  const materialCount = `${count} material${count === 1 ? "" : "s"}`;
  const source = recipe.sources[0];
  const formula = recipe.teachingItemNames[0];
  const materials = count ? `The recipe lists ${materialCount}.` : "No materials are listed.";
  const facts = [
    source ? `Players saw ${source.kind} ${source.npcName} in ${source.zone}.` : "",
    material
      ? count === 1
        ? `Bring ${material.name} ×${material.count}.`
        : `Bring ${materialCount}, including ${material.name} ×${material.count}.`
      : "",
    materials,
    formula?.bindOnPickup === true ? "The teaching item binds on pickup." : "",
    formula?.bindOnPickup === false ? "The teaching item can be traded." : "",
    !source ? "A trainer or vendor location is still unconfirmed." : "",
    skill === null ? "The skill requirement is unconfirmed." : "",
    `It turns grey at skill ${recipe.thresholds.grey}.`,
    "Compare nearby recipes in the profession list.",
  ];
  let description = lead;
  for (const fact of facts) {
    if (fact === materials && description.includes("Bring ")) continue;
    if (fact && description.length + fact.length < 155) description += " " + fact;
    if (description.length >= 120) break;
  }
  return { title: titleName + suffix, description, lead };
}
