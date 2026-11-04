<script setup lang="ts">
/** One pick of a Collection: rank, name, chips, why it is worth it, how to get it, source. */
defineProps<{
  rank: number;
  name: string;
  chips: { label: string; tone?: "neutral" | "gold" | "chance" }[];
  note?: string;
  how: string[];
  source?: string;
}>();
</script>

<template>
  <article class="ds-item">
    <header class="ds-item__head">
      <span class="ds-item__rank" aria-hidden="true">{{ rank }}</span>
      <DsHeading :level="3" tag="h2">{{ name }}</DsHeading>
    </header>
    <DsChipRow>
      <DsChip v-for="chip in chips" :key="chip.label" :tone="chip.tone">{{ chip.label }}</DsChip>
    </DsChipRow>
    <p v-if="note" class="ds-item__note">{{ note }}</p>
    <div v-if="how.length" class="ds-item__how">
      <span class="ds-item__how-label">How to get it</span>
      <ul>
        <li v-for="line in how" :key="line">{{ line }}</li>
      </ul>
    </div>
    <a v-if="source" class="ds-item__source" :href="source" rel="nofollow noopener" target="_blank"
      >Check the source <span aria-hidden="true">↗</span></a
    >
  </article>
</template>

<style scoped>
.ds-item {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-lg);
  background: var(--lamp-surface);
  box-shadow: var(--shadow-card);
}

@media (min-width: 640px) {
  .ds-item {
    padding: var(--space-5) var(--space-5) var(--space-4);
  }
}

.ds-item__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ds-item__rank {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-pill);
  color: var(--lamp-gold);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 700;
}

.ds-item__note {
  color: var(--lamp-text);
}

.ds-item__how {
  padding: var(--space-3) var(--space-4);
  border-left: 2px solid var(--lamp-gold);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: rgb(20 13 10 / 0.45);
}

.ds-item__how-label {
  color: var(--lamp-gold-light);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ds-item__how ul {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}

.ds-item__how li + li {
  margin-top: var(--space-1);
}

.ds-item__source {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  justify-self: start;
  min-height: var(--tap);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 500;
}
</style>
