import type { Profession } from "./profession-progress.ts";

// Base client skill lines keep links stable when the player's client language changes.
const ENGLISH_PROFESSIONS: Record<number, string> = {
  129: "First Aid",
  164: "Blacksmithing",
  165: "Leatherworking",
  171: "Alchemy",
  182: "Herbalism",
  185: "Cooking",
  186: "Mining",
  197: "Tailoring",
  202: "Engineering",
  333: "Enchanting",
  356: "Fishing",
  393: "Skinning",
  755: "Jewelcrafting",
  773: "Inscription",
  794: "Archaeology",
};
export function professionName(
  profession: Pick<Profession, "skillLine" | "name"> & Partial<Pick<Profession, "aliases">>,
): string {
  return (
    ENGLISH_PROFESSIONS[profession.skillLine] ??
    (profession.aliases ?? []).map((id) => ENGLISH_PROFESSIONS[id]).find(Boolean) ??
    profession.name
  );
}
