<script setup lang="ts">
import { computed } from "vue";
import {
  questHref,
  chainHref,
  questTitle,
  type PublicQuest,
  type PublicQuestChain,
} from "#shared/quests";
const props = defineProps<{ quests: PublicQuest[]; chains: PublicQuestChain[] }>();
const zones = computed(() => {
  const grouped = new Map<string, PublicQuest[]>();
  for (const quest of props.quests) {
    const names = [
      ...new Set(
        [...quest.accept, ...quest.turnIn].map((p) => p.zone).filter((z): z is string => !!z),
      ),
    ];
    for (const name of names.length ? names : ["Zone not yet seen"])
      grouped.set(name, [...(grouped.get(name) || []), quest]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "en"));
});
</script>
<template>
  <div class="quest-index">
    <DsPageHeader title="Quests in WoW Forever" eyebrow="One step at a time" />
    <p>
      Quest places seen by players, and verified chains to follow. Pick your character above to see
      your progress on each page.
    </p>
    <section>
      <h2>Quest chains</h2>
      <p v-if="!chains.length">
        No verified chains yet. Quest observations below are the first pieces.
      </p>
      <ul v-else>
        <li v-for="chain in chains" :key="chain.slug">
          <NuxtLink :to="chainHref(chain.slug)">{{ chain.title }}</NuxtLink> · {{ chain.zone }} ·
          {{ chain.steps.length }} steps
        </li>
      </ul>
    </section>
    <section>
      <h2>Recently observed quests by zone</h2>
      <p v-if="!quests.length">
        No quests shared yet. Accept or turn in a quest with data sharing on; the Companion brings
        it over after the game saves.
      </p>
      <section v-for="[zone, rows] in zones" :key="zone" class="zone">
        <h3>{{ zone }}</h3>
        <ul>
          <li v-for="quest in rows" :key="quest.questID">
            <NuxtLink :to="questHref(quest.slug)">{{ questTitle(quest) }}</NuxtLink
            ><span v-if="quest.level !== null"> · Level {{ quest.level }}</span>
          </li>
        </ul>
      </section>
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
h3 {
  font-size: var(--text-xl);
  margin-bottom: 0.75rem;
}
.zone {
  margin-top: 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-md);
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
