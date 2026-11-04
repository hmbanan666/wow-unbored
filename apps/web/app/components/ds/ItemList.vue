<script setup lang="ts">
/** Ordered list wrapper for DsItemCard. */
</script>

<template>
  <ol class="ds-item-list">
    <slot />
  </ol>
</template>

<style scoped>
.ds-item-list {
  display: grid;
  gap: var(--space-4);
  margin: var(--space-6) 0 0;
  padding: 0;
  list-style: none;
}
</style>
