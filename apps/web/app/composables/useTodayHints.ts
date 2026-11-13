import { onMounted, ref, watch } from "vue";
import type { TodaySet, SavedTodayGoal } from "@unbored/contracts/today-goals";
/** Local hints are scoped to the unique persisted set, never sent to the Server. */
export function useTodayHints(sets: () => TodaySet[]) {
  const marked = ref<Record<string, boolean>>({});
  const key = (set: TodaySet, goal: SavedTodayGoal) => `unbored:today:${set.id}:${goal.id}`;
  const load = () => {
    const next: Record<string, boolean> = {};
    try {
      for (const set of sets())
        for (const goal of set.goals)
          next[key(set, goal)] = localStorage.getItem(key(set, goal)) === "done";
    } catch {
      /* Browser storage may be disabled; the toggle still works for this visit. */
    }
    marked.value = next;
  };
  onMounted(load);
  watch(sets, load);
  const done = (set: TodaySet, goal: SavedTodayGoal) =>
    goal.completedAt !== null || !!marked.value[key(set, goal)];
  const toggle = (set: TodaySet, goal: SavedTodayGoal) => {
    if (goal.completedAt !== null) return;
    const id = key(set, goal);
    marked.value[id] = !marked.value[id];
    try {
      if (marked.value[id]) localStorage.setItem(id, "done");
      else localStorage.removeItem(id);
    } catch {
      /* Keep the in-memory hint. */
    }
  };
  return { done, toggle };
}
