<script setup lang="ts">
import type { RecipeDifficulty } from "@unbored/contracts/recipe-difficulty";
defineProps<{ label: RecipeDifficulty["label"] }>();
</script>
<template>
  <span class="difficulty-badge" :class="label">{{ label }}</span>
</template>
<style scoped>
.difficulty-badge {
  display: inline-block;
  justify-self: start;
  padding: 3px 8px;
  border-radius: 7px;
  font: 700 11px/1.5 var(--font-ui);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--lamp-deep);
}
.easy {
  background: #7fb069;
}
.medium {
  background: var(--lamp-gold);
}
.hard {
  background: #c8553d;
  color: var(--lamp-deep);
}
</style>
