<script setup lang="ts">
import {
  hasPlace,
  isMappedQuest,
  chainHref,
  questTitle,
  type PublicQuest,
  type QuestOverlay,
} from "#shared/quests";
defineProps<{ quest: PublicQuest; overlay?: QuestOverlay | null }>();
</script>
<template>
  <article class="quest-detail">
    <DsPageHeader
      :title="questTitle(quest)"
      :eyebrow="quest.level === null ? 'WoW Forever' : `WoW Forever · Level ${quest.level}`"
    />
    <div v-if="isMappedQuest(quest)" class="places">
      <template
        v-for="[kind, label] in [
          ['accept', 'Where to accept'],
          ['turnIn', 'Where to turn in'],
        ] as const"
        :key="kind"
      >
        <section v-if="quest[kind].some(hasPlace)">
          <h2>{{ label }}</h2>
          <ul>
            <li v-for="(place, index) in quest[kind].filter(hasPlace)" :key="index">
              <strong v-if="place.npcName">{{ place.npcName }}</strong>
              <p v-if="place.zone">{{ place.zone }}</p>
              <span v-if="place.x !== null && place.y !== null" class="coordinates"
                >{{ place.x.toFixed(1) }}, {{ place.y.toFixed(1) }}</span
              >
            </li>
          </ul>
        </section>
      </template>
    </div>
    <p v-else class="muted">
      No location observed yet. A player has recorded this quest, but its start and turn-in are
      still unmapped.
    </p>
    <p v-if="!quest.title" class="muted">The English title has not been observed yet.</p>
    <p
      v-if="[...quest.accept, ...quest.turnIn].some((p) => p.x !== null && p.y !== null)"
      class="muted"
    >
      Coordinates mark where the player stood during the visit.
    </p>
    <aside v-if="overlay" class="personal" aria-label="Your quest">
      <strong>{{ overlay.character.name }}</strong> ·
      {{
        overlay.steps[0]?.done
          ? "Done"
          : overlay.steps[0]?.inLog
            ? "In your quest log"
            : overlay.steps[0]?.done === false
              ? "Not completed yet"
              : "Progress not yet seen"
      }}
      <p v-for="chain in overlay.nextChains || []" :key="chain.slug">
        Next step in <NuxtLink :to="chainHref(chain.slug)">{{ chain.title }}</NuxtLink
        >.
      </p>
      <p v-if="overlay.steps[0]?.done === null">
        Play this character with data sharing on, then let the Companion bring over your quests.
      </p>
    </aside>
  </article>
</template>
<style scoped>
.quest-detail {
  display: grid;
  gap: 1.5rem;
}
.places {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1.5rem;
}
section,
.personal {
  padding: 1.25rem;
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-md);
  background: var(--lamp-glow);
}
.quest-detail :deep(.ds-page-header) {
  margin-bottom: 0;
}
.places section {
  position: relative;
  border-left: 3px solid var(--lamp-gold-dark);
  background: linear-gradient(115deg, var(--lamp-glow), var(--lamp-bg));
}
.places strong {
  font: 700 var(--text-2xl)/1.2 var(--font-display);
}
h2 {
  font: 700 var(--text-sm)/1.2 var(--font-ui);
  color: var(--lamp-gold);
  margin: 0 0 var(--space-4);
}
ul {
  display: grid;
  gap: 1rem;
  list-style: none;
  padding: 0;
}
.coordinates {
  font: 500 var(--text-base)/1.4 var(--font-ui);
  font-variant-numeric: tabular-nums;
  color: var(--lamp-gold-light);
}
.muted {
  color: var(--lamp-muted);
}
</style>
