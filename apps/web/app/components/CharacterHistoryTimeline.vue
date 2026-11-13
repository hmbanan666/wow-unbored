<script setup lang="ts">
import { CHARACTER_EVENT_TYPES } from "@unbored/contracts/character-history";
import { HISTORY_LABELS, historyDay, type CharacterHistory } from "#shared/character-history";
const props = defineProps<{
  history: CharacterHistory;
  back: string;
  selected: string;
  cursor: boolean;
}>();
const groups = computed(() => {
  const days = new Map<string, CharacterHistory["events"]>();
  for (const event of props.history.events) {
    const day = historyDay(event.at);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(event);
  }
  return [...days].map(([day, events]) => ({ day, events }));
});
const href = (types = "", cursor?: { at: number; id: number } | null) => {
  const params = new URLSearchParams();
  if (types) params.set("types", types);
  if (cursor) params.set("cursor", `${cursor.at}:${cursor.id}`);
  return `${props.back}/history${params.size ? `?${params}` : ""}`;
};
</script>
<template>
  <DsSection title="Timeline">
    <nav aria-label="History types" class="history-filters">
      <DsButton variant="ghost" :to="href()" :aria-current="!selected ? 'page' : undefined"
        >All changes</DsButton
      >
      <DsButton
        variant="ghost"
        v-for="type in CHARACTER_EVENT_TYPES"
        :key="type"
        :to="href(type)"
        :aria-current="selected === type ? 'page' : undefined"
        >{{ HISTORY_LABELS[type] }}</DsButton
      >
    </nav>
    <DsEmptyState
      v-if="!groups.length"
      :title="selected || cursor ? 'No changes on this page' : 'No changes recorded yet'"
      :text="
        selected || cursor
          ? 'Choose All changes to see the rest of your history.'
          : 'Play a little, then choose Open my profile in the Companion after your next session. Your first upload is the starting point.'
      "
    />
    <section v-for="group in groups" :key="group.day">
      <h3>
        <time :datetime="group.day">{{ group.day }}</time>
      </h3>
      <ul>
        <li v-for="event in group.events" :key="event.id">{{ event.label }}</li>
      </ul>
    </section>
    <DsButton v-if="history.next" :to="href(selected, history.next)">Older changes</DsButton>
    <DsButton v-if="cursor" :to="href(selected)" variant="ghost">Newest changes</DsButton>
  </DsSection>
</template>
<style scoped>
.history-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
[aria-current="page"] {
  font-weight: 700;
  text-decoration: underline;
}
li {
  margin: 0.5rem 0;
}
</style>
