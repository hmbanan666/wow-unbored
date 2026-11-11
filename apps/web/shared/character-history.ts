import type {
  CharacterEvent,
  CharacterEventType,
  HistoryCursor,
} from "@unbored/contracts/character-history";
import type { CharacterIdentity } from "./character-page";
export type HistoryPoint = { at: number; value: number };
export type HistoryChart = { key: string; title: string; money: boolean; points: HistoryPoint[] };
export type CharacterHistory = CharacterIdentity & {
  events: (CharacterEvent & { label: string })[];
  charts: HistoryChart[];
  next: HistoryCursor | null;
};
export const HISTORY_LABELS: Record<CharacterEventType, string> = {
  level_up: "Level",
  skill_step: "Profession skill",
  recipe_learned: "Recipe learned",
  gold_close: "Gold at day's end",
  gear_change: "Equipment",
  rep_standing: "Reputation standing",
};
export const historyDay = (at: number) => {
  const date = new Date(at * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "Unknown date";
};
export function moneyText(copper: number): string {
  return `${Math.floor(copper / 10000)}g ${Math.floor((copper % 10000) / 100)}s ${copper % 100}c`;
}
export function eventLabel(
  event: CharacterEvent,
  recipes: Map<number, string>,
  professions: Map<string, string>,
): string {
  const change = event.from === null ? String(event.to) : `${event.from} → ${event.to}`;
  switch (event.type) {
    case "level_up":
      return event.from === null ? `First recorded level: ${event.to}` : `Level: ${change}`;
    case "skill_step":
      return `${professions.get(event.key) ?? `Profession ${event.key}`}: ${change}`;
    case "recipe_learned":
      return `Recipe learned: ${recipes.get(event.to) ?? event.to}`;
    case "gold_close":
      return `Gold at day's end: ${moneyText(event.to)}`;
    case "gear_change":
      return `Equipment slot ${event.key}: ${event.from || "Empty"} → ${event.to || "Empty"}`;
    case "rep_standing":
      return `Faction ${event.key} standing: ${change}`;
  }
}
