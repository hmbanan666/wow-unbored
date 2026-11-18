import type { CharacterProfessions } from "../../shared/character-page";

export function summaryFixture(): CharacterProfessions {
  return {
    game: "forever",
    name: "Kania",
    realm: "CAMWOW EU4 Realm 3 PvE",
    professions: [
      { name: "Enchanting", href: "/forever/professions/enchanting", known: 42 },
      { name: "Tailoring", href: "/forever/professions/tailoring", known: 7 },
    ],
  };
}
