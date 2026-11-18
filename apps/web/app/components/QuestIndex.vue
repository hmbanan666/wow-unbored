<script setup lang="ts">
import { computed } from "vue";
import {
  isMappedQuest,
  questHref,
  chainHref,
  questTitle,
  type PublicQuest,
  type PublicQuestChain,
} from "#shared/quests";
const props = defineProps<{ quests: PublicQuest[]; chains: PublicQuestChain[] }>();
const unmapped = computed(() => props.quests.filter((q) => !isMappedQuest(q)));
const zones = computed(() => {
  const grouped = new Map<string, PublicQuest[]>();
  for (const quest of props.quests.filter(isMappedQuest)) {
    const names = [
      ...new Set(
        [...quest.accept, ...quest.turnIn].map((p) => p.zone).filter((z): z is string => !!z),
      ),
    ];
    for (const name of names.length ? names : ["Other sightings"])
      grouped.set(name, [...(grouped.get(name) || []), quest]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "en"));
});
</script>
<template>
  <div class="quest-index">
    <DsPageHeader
      title="Quests in WoW Forever"
      lead="Pick a zone to find quest starts and turn-ins seen by players."
    />
    <section v-if="chains.length">
      <h2>Quest chains</h2>
      <ul>
        <li v-for="chain in chains" :key="chain.slug">
          <NuxtLink :to="chainHref(chain.slug)">{{ chain.title }}</NuxtLink> · {{ chain.zone }} ·
          {{ chain.steps.length }} {{ chain.steps.length === 1 ? "step" : "steps" }}
        </li>
      </ul>
    </section>
    <section>
      <h2>Quests by zone</h2>
      <p v-if="!quests.length">
        No quests shared yet. Accept or turn in a quest with data sharing on; the Companion brings
        it over after the game saves.
      </p>
      <details v-for="[zone, rows] in zones" :key="zone" class="zone">
        <summary>{{ zone }} ({{ rows.length }})</summary>
        <ul>
          <li v-for="quest in rows" :key="quest.questID">
            <NuxtLink :to="questHref(quest.slug)">{{ questTitle(quest) }}</NuxtLink
            ><span v-if="quest.level !== null"> · Level {{ quest.level }}</span>
          </li>
        </ul>
      </details>
      <details v-if="unmapped.length" class="zone unmapped">
        <summary>Show unmapped quests ({{ unmapped.length }})</summary>
        <ul>
          <li v-for="quest in unmapped" :key="quest.slug">
            <NuxtLink :to="questHref(quest.slug)">{{ questTitle(quest) }}</NuxtLink>
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>
<style scoped>
.quest-index {
  display: grid;
  gap: 2rem;
}
h2 {
  font-size: var(--text-2xl);
  color: var(--lamp-gold-light);
  margin-bottom: 1rem;
}
summary {
  padding: var(--space-3) var(--space-4);
  min-height: var(--tap);
  font: 700 var(--text-lg)/1.3 var(--font-display);
  cursor: pointer;
}
.zone {
  border-top: 1px solid var(--lamp-line);
}
.zone[open] {
  background: var(--lamp-surface);
}
.zone ul {
  padding: 0 var(--space-4) var(--space-4);
  gap: 0;
}
.zone a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
}
.unmapped {
  color: var(--lamp-muted);
}
ul {
  list-style: none;
  display: grid;
  gap: 0.75rem;
  padding: 0;
}
a {
  color: var(--lamp-gold-light);
}
</style>
