<script setup lang="ts">
import { questTitle, type PublicQuest, type QuestOverlay } from "#shared/quests";
defineProps<{ quest: PublicQuest; overlay?: QuestOverlay | null }>();
</script>
<template>
  <article class="quest-detail">
    <DsPageHeader
      :title="questTitle(quest)"
      :eyebrow="`WoW Forever · ${quest.level === null ? 'Level not yet seen' : `Level ${quest.level}`}`"
    />
    <p v-if="!quest.title" class="muted">
      The English title has not been observed yet. Visit this quest with an English client to fill
      in the details.
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
      <p v-if="overlay.steps[0]?.done === null">
        Play this character with data sharing on, then let the Companion bring over your quests.
      </p>
    </aside>
    <div class="places">
      <section
        v-for="[kind, label] in [
          ['accept', 'Where to accept'],
          ['turnIn', 'Where to turn in'],
        ] as const"
        :key="kind"
      >
        <h2>{{ label }}</h2>
        <p v-if="!quest[kind].length" class="muted">
          No location observed yet. Your next visit can help.
        </p>
        <ul v-else>
          <li v-for="(place, index) in quest[kind]" :key="index">
            <strong>{{ place.npcName || "NPC name not yet seen" }}</strong>
            <p>
              {{ place.zone || "Zone not yet seen"
              }}<template v-if="place.x !== null && place.y !== null">
                · {{ place.x.toFixed(1) }}, {{ place.y.toFixed(1) }}</template
              >
            </p>
          </li>
        </ul>
      </section>
    </div>
    <p class="muted">
      Shared observations, without player identities. Coordinates show where the player stood during
      the visit.
    </p>
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
h2 {
  font-size: var(--text-xl);
  color: var(--lamp-gold-light);
  margin-bottom: 1rem;
}
ul {
  display: grid;
  gap: 1rem;
  list-style: none;
  padding: 0;
}
.muted {
  color: var(--lamp-muted);
}
</style>
