<script setup lang="ts">
/** A wrapping row of DsChip. */
</script>

<template>
  <p class="ds-chip-row"><slot /></p>
</template>

<style scoped>
.ds-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
