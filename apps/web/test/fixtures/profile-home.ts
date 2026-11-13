import type { ProfileHome } from "../../shared/profile-home";
import { albumCharacter } from "./profession-album";
import { professionViews } from "@unbored/contracts/profession-progress";
export function kaniaProfile(): ProfileHome {
  const character = albumCharacter("known");
  character.professions[0]!.known = 42;
  character.professions.push(
    ...professionViews(
      {
        list: [
          { skillLine: 185, name: "Cooking", skill: 123, max: 150 },
          { skillLine: 129, name: "First Aid", skill: 45, max: 75 },
          { skillLine: 356, name: "Fishing", skill: 118, max: 150 },
        ],
      },
      {},
      [],
      [],
      "forever",
    ),
  );
  return {
    ...character,
    hero: {
      className: "Warlock",
      race: "Troll",
      faction: "Horde",
      level: 25,
      cap: 60,
      xp: 18993,
      xpMax: 34000,
      rested: 6800,
      played: 194400,
      ilvl: 24.5,
      money: 123456,
    },
    journey: [
      { at: 1794268800, kind: "level", label: "Level 20" },
      { at: 1794355200, kind: "profession", label: "Enchanting · first recorded skill 125" },
      { at: 1794441600, kind: "recipe", label: "Learned Runed Copper Rod" },
      { at: 1794441700, kind: "reputation", label: "Orgrimmar · Friendly" },
      { at: 1794528000, kind: "zone", label: "Most time in Orgrimmar" },
      { at: 1794528100, kind: "level", label: "Level 25" },
    ],
  };
}
