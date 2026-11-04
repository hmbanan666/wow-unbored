<script setup lang="ts">
/** A summary card: eyebrow, title, short text. With `to`, the whole card is the tap target. */
defineProps<{ to?: string; eyebrow?: string; title: string; text?: string }>();
// Resolved here: inside the template a string name would render a literal <NuxtLink> tag.
const NuxtLink = resolveComponent("NuxtLink");
</script>

<template>
  <component :is="to ? NuxtLink : 'div'" :to="to" class="ds-card" :class="{ 'ds-card--link': to }">
    <span v-if="eyebrow" class="ds-card__eyebrow">{{ eyebrow }}</span>
    <strong class="ds-card__title">{{ title }}</strong>
    <span v-if="text" class="ds-card__text">{{ text }}</span>
    <slot />
  </component>
</template>

<style scoped>
.ds-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  box-sizing: border-box;
  padding: var(--space-4) var(--space-5) var(--space-5);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-lg);
  background: var(--lamp-surface);
  box-shadow: var(--shadow-card);
  color: var(--lamp-text);
  text-decoration: none;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    box-shadow 0.15s;
}

.ds-card--link:hover {
  border-color: var(--lamp-gold-dark);
  background: var(--lamp-surface-hover);
  box-shadow: var(--glow-gold);
  color: var(--lamp-text);
}

.ds-card__eyebrow {
  color: var(--lamp-gold);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ds-card__title {
  color: var(--lamp-gold-light);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: var(--leading-snug);
}

.ds-card__text {
  color: var(--lamp-muted);
  font-size: var(--text-base);
  line-height: var(--leading-body);
}
</style>
