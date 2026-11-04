<script setup lang="ts">
/** A row of buttons; stacks full width on small screens. */
</script>

<template>
  <div class="ds-actions"><slot /></div>
</template>

<style scoped>
.ds-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

@media (max-width: 479px) {
  .ds-actions > :deep(*) {
    flex: 1 1 100%;
  }
}
</style>
