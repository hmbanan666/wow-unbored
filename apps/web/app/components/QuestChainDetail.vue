<script setup lang="ts">
import { questHref, type PublicQuestChain, type QuestOverlay } from "#shared/quests";
defineProps<{ chain: PublicQuestChain; overlay?: QuestOverlay | null }>();
</script>
<template>
  <article class="chain-detail">
    <DsPageHeader
      :title="chain.title"
      :eyebrow="`WoW Forever · ${chain.zone} · ${chain.faction}`"
    />
    <p>Follow these quests in order. Every step has been observed in the game.</p>
    <p v-if="overlay && overlay.steps.every((s) => s.done === null)">
      Progress not yet seen. Play this character with data sharing on, then let the Companion bring
      over your quests.
    </p>
    <p v-else-if="overlay">
      {{ overlay.character.name }} · {{ overlay.steps.filter((s) => s.done).length }} of
      {{ chain.steps.length }} done
    </p>
    <ol>
      <li v-for="(step, index) in chain.steps" :key="step.questID">
        <NuxtLink v-if="step.slug" :to="questHref(step.slug)">{{ step.title }}</NuxtLink
        ><span v-else>{{ step.title }}</span>
        <span v-if="overlay" class="progress"
          >{{
            overlay.steps[index]?.done
              ? "Done"
              : overlay.steps[index]?.inLog
                ? "In your quest log"
                : overlay.steps[index]?.done === null
                  ? "Progress not yet seen"
                  : "Not completed"
          }}<strong v-if="overlay.steps[index]?.next"> · Next step</strong></span
        >
        <p v-if="overlay?.steps[index]?.next && step.slug">
          <NuxtLink :to="questHref(step.slug)">See where to pick it up</NuxtLink>
        </p>
      </li>
    </ol>
  </article>
</template>
<style scoped>
.chain-detail {
  display: grid;
  gap: 1.5rem;
}
ol {
  padding-left: 1.75rem;
  display: grid;
  gap: 1rem;
}
li {
  padding: 1rem;
  border-bottom: 1px solid var(--lamp-line);
}
a {
  color: var(--lamp-gold-light);
}
.progress {
  display: block;
  margin-top: 0.5rem;
  color: var(--lamp-muted);
}
strong {
  color: var(--lamp-gold-light);
}
</style>
