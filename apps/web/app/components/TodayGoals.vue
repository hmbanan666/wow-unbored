<script setup lang="ts">
import type { TodaySet } from "@unbored/contracts/today-goals";
import { useTodayHints } from "../composables/useTodayHints";
const props = defineProps<{ set?: TodaySet; name: string; unavailable?: boolean }>();
defineEmits<{ retry: [] }>();
const { done, toggle } = useTodayHints(() => (props.set ? [props.set] : []));
</script>
<template>
  <section class="today-section" aria-label="Today">
    <h2>Today in {{ name }}</h2>
    <template v-if="unavailable">
      <p>Bory could not check today's steps just now.</p>
      <DsButton variant="secondary" @click="$emit('retry')">Try again</DsButton>
    </template>
    <div v-else-if="set?.goals.length" class="today-grid">
      <article
        v-for="(goal, index) in set.goals"
        :key="goal.id"
        class="today-card"
        :class="{ 'is-done': done(set, goal) }"
      >
        <span class="today-number" aria-hidden="true">{{ done(set, goal) ? "✓" : index + 1 }}</span>
        <h3>{{ goal.title }}</h3>
        <p class="today-why">{{ goal.why }}</p>
        <p class="today-route">{{ goal.route }}</p>
        <span v-if="goal.completedAt !== null" class="today-status">Done ✓ · Seen in game</span>
        <button
          v-else
          type="button"
          class="today-toggle"
          :aria-pressed="done(set, goal)"
          @click="toggle(set, goal)"
        >
          {{ done(set, goal) ? "Done ✓" : "Mark done" }}
        </button>
      </article>
    </div>
    <p v-else class="today-why">
      No new steps from what Bory knows yet. Browse your collection below.
    </p>
    <p v-if="set?.goals.length" class="today-note">
      Ticks follow your next game read. Mark done is saved only in this browser.
    </p>
  </section>
</template>
<style scoped>
.today-section {
  margin-block: 1.5rem 2rem;
}
h2 {
  font-family: var(--font-display);
  color: var(--lamp-gold-light);
  font-size: 1.5rem;
  margin: 0 0 1rem;
}
.today-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
.today-card {
  background: var(--lamp-glow);
  border: 1px solid var(--lamp-line);
  border-radius: 18px;
  position: relative;
  padding: 1.25rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}
.today-number {
  position: absolute;
  top: -10px;
  left: 14px;
  color: var(--lamp-bg);
  background: var(--lamp-gold);
  border-radius: 8px;
  padding: 0 8px;
  font: 700 0.85rem/1.5 var(--font-ui);
}
h3 {
  margin: 0;
  color: var(--lamp-text);
  font-size: 1.05rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
p {
  margin: 0;
  line-height: 1.55;
}
.today-why,
.today-note {
  color: var(--lamp-muted);
  font-size: 0.875rem;
}
.today-route {
  border-top: 1px dashed var(--lamp-line);
  padding-top: 0.5rem;
  color: var(--lamp-gold);
  font-size: 0.875rem;
}
.today-toggle {
  margin-top: auto;
  min-height: 48px;
  padding: 0.5rem 0.85rem;
  border: 1px solid var(--lamp-line);
  border-radius: 8px;
  color: var(--lamp-text);
  background: var(--lamp-glow);
  cursor: pointer;
}
.today-toggle:focus-visible {
  outline: 2px solid var(--lamp-gold);
  outline-offset: 3px;
}
.today-status {
  margin-top: auto;
  padding-block: 0.7rem;
  font-size: 0.875rem;
}
.today-note {
  margin-top: 0.75rem;
}
.is-done {
  background: var(--lamp-surface);
  color: var(--lamp-muted);
}
.is-done h3,
.is-done .today-route {
  color: var(--lamp-muted);
}
@media (min-width: 768px) {
  .today-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
