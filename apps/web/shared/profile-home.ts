import type { CharacterPage } from "./character-page";
export type ProfileHero = {
  className: string | null;
  race: string | null;
  faction: string | null;
  level: number | null;
  cap: number | null;
  xp: number | null;
  xpMax: number | null;
  rested: number | null;
  played: number | null;
  ilvl: number | null;
  money: number | null;
};
export type JourneyStop = {
  at: number;
  label: string;
  kind: "level" | "profession" | "reputation" | "recipe" | "zone";
};
export type ProfileHome = CharacterPage & { hero: ProfileHero; journey: JourneyStop[] };
