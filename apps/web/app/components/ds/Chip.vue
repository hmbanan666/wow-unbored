<script setup lang="ts">
/** A small label: what an item is, where it comes from, guaranteed or chance. */
withDefaults(defineProps<{ tone?: "neutral" | "gold" | "chance" }>(), { tone: "neutral" });
</script>

<template>
  <span class="ds-chip" :class="`ds-chip--${tone}`"><slot /></span>
</template>

<style scoped>
.ds-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-pill);
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.ds-chip--gold {
  border-color: var(--lamp-gold-dark);
  color: var(--lamp-gold);
}

.ds-chip--chance {
  border-style: dashed;
  border-color: var(--lamp-gold-dark);
  color: var(--lamp-chance);
}
</style>
