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
  Blacksmithing: "BS",
  Engineering: "Eng.",
  Leatherworking: "LW",
  Enchanting: "Ench.",
  Tailoring: "Tail.",
  Alchemy: "Alch.",
};

export function recipeCopy(recipe: PublicRecipe, profession: string, game: Game) {
  const name = recipe.name!;
  const realm = gameName(game);
  const suffixes = [
    ` recipe · ${profession} · ${realm}`,
    ` recipe: ${profession}, ${realm}`,
    ` recipe (${shortProfession[profession] ?? profession}) ${realm}`,
  ];
  const suffix = suffixes.find((value) => name.length + value.length <= 60) ?? suffixes[2]!;
  const budget = 60 - suffix.length;
  let titleName = name;
  if (name.length > budget) {
    const words = name.split(/\s+/);
    const last = words.pop()!;
    while (words.length && words.join(" ").length + last.length + 2 > budget) words.pop();
    titleName = words.length ? words.join(" ") + "… " + last : name.slice(0, budget - 1) + "…";
  }
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
  const compactList =
    count > 0 && count <= 3 && recipe.reagents.every((r) => r.name)
      ? new Intl.ListFormat("en").format(recipe.reagents.map((r) => `${r.name} ×${r.count}`))
      : "";
  let description =
    lead.length < 100
      ? lead
      : skill === null
        ? `This ${profession} recipe appears in ${realm}.`
        : `This ${realm} recipe requires ${profession} ${skill}.`;
  const facts = [
    [
      source
        ? `A player visited ${source.kind} ${source.npcName}${source.zone === "Unknown zone" ? "" : " in " + source.zone}.`
        : "",
    ],
    [
      compactList ? `Bring ${compactList}.` : "",
      material ? `Bring ${materialCount}, including ${material.name} ×${material.count}.` : "",
      count ? `The recipe lists ${materialCount}.` : "No materials are listed.",
    ],
    [
      formula?.bindOnPickup === true ? "The teaching item binds on pickup." : "",
      formula?.bindOnPickup === false ? "The teaching item can be traded." : "",
    ],
    [!source ? "A trainer or vendor location is still unconfirmed." : ""],
    [skill === null ? "The skill requirement is unconfirmed." : ""],
    [`It turns grey at skill ${recipe.thresholds.grey}.`],
    ["Compare nearby recipes in the profession list."],
  ];
  for (const alternatives of facts) {
    const fact = alternatives.find((text) => text && description.length + text.length < 155);
    if (fact) description += " " + fact;
    if (description.length >= 120) break;
  }
  return { title: titleName + suffix, description, lead };
}
