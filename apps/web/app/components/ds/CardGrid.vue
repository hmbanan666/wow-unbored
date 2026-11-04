<script setup lang="ts">
/** Responsive grid of DsCard: one column on phones, two from tablets, three on wide screens. */
</script>

<template>
  <div class="ds-card-grid"><slot /></div>
</template>

<style scoped>
.ds-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

@media (min-width: 640px) {
  .ds-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .ds-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
