<script setup lang="ts">
/**
 * One heading style per level. Level 1 is the gold gradient display line, once per page.
 * `tag` keeps the outline right when the look and the level differ (an item title is an h2
 * that looks like a level 3).
 */
withDefaults(defineProps<{ level?: 1 | 2 | 3; tag?: "h1" | "h2" | "h3"; eyebrow?: string }>(), {
  level: 1,
});
</script>

<template>
  <div class="ds-heading" :class="`ds-heading--${level}`">
    <p v-if="eyebrow" class="ds-heading__eyebrow">{{ eyebrow }}</p>
    <component :is="tag || `h${level}`" class="ds-heading__text"><slot /></component>
  </div>
</template>

<style scoped>
.ds-heading__eyebrow {
  margin-bottom: var(--space-2);
  color: var(--lamp-gold);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ds-heading__text {
  color: var(--lamp-gold-light);
}

.ds-heading--1 .ds-heading__text {
  font-size: var(--text-3xl);
  background: var(--lamp-gold-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  padding-bottom: 0.08em;
}

.ds-heading--2 .ds-heading__text {
  font-size: var(--text-2xl);
}

.ds-heading--3 .ds-heading__text {
  font-size: var(--text-lg);
  line-height: var(--leading-snug);
}
</style>
