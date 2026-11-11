export const CHARACTER_EVENT_TYPES = [
  "level_up",
  "skill_step",
  "recipe_learned",
  "gold_close",
  "gear_change",
  "rep_standing",
] as const;
export type CharacterEventType = (typeof CHARACTER_EVENT_TYPES)[number];
export type CharacterEvent = {
  id: number;
  type: CharacterEventType;
  key: string;
  at: number;
  from: number | null;
  to: number;
};
export type HistoryCursor = { at: number; id: number };
export type HistoryFilter = {
  types?: CharacterEventType[];
  since?: number;
  limit?: number;
  cursor?: HistoryCursor;
};
export type HistoryPage = { events: CharacterEvent[]; next: HistoryCursor | null };
export function historyCursor(value: unknown): HistoryCursor | undefined {
  if (typeof value !== "string" || !/^-?\d+:\d+$/.test(value)) return undefined;
  const [at, id] = value.split(":").map(Number);
  return Number.isSafeInteger(at) && Number.isSafeInteger(id) ? { at: at!, id: id! } : undefined;
}
