<script setup lang="ts">
defineProps<{ done: number; total: number; label: string }>();
</script>
<template>
  <div class="ds-progress">
    <span>{{ done }} / {{ total }} {{ label }}</span>
    <progress v-if="total > 0" :value="done" :max="total" :aria-label="label">
      {{ done }} / {{ total }}
    </progress>
  </div>
</template>
<style scoped>
.ds-progress {
  display: grid;
  gap: var(--space-1);
  font-family: var(--font-ui);
  color: var(--lamp-text);
}
.ds-progress progress {
  width: 100%;
  max-width: 100%;
  accent-color: var(--lamp-gold);
}
</style>
