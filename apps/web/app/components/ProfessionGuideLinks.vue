<script setup lang="ts">
import type { GuideLink } from "#shared/guide-references";
defineProps<{ guides: GuideLink[] }>();
</script>
<template>
  <nav v-if="guides.length" class="reading" aria-label="Profession guides">
    <h2>From the field guide</h2>
    <a v-for="guide in guides" :key="guide.href" :href="guide.href"
      >{{ guide.title }} <span aria-hidden="true">→</span></a
    >
  </nav>
</template>
<style scoped>
.reading {
  border-inline-start: 3px solid var(--lamp-gold-dark);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(100deg, var(--lamp-surface), transparent);
  margin-bottom: var(--space-4);
}
h2 {
  font: 700 var(--text-xs)/1.3 var(--font-ui);
  color: var(--lamp-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: fit-content;
  min-height: var(--tap);
  font-size: var(--text-lg);
  text-underline-offset: 0.18em;
}
</style>
