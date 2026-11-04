<script setup lang="ts">
/** Bory with one short line, for empty lists, signed-out pages and errors. */
withDefaults(defineProps<{ title?: string; text?: string; level?: 1 | 2 }>(), { level: 2 });
</script>

<template>
  <div class="ds-empty">
    <DsPortrait />
    <DsHeading v-if="title" :level="level">{{ title }}</DsHeading>
    <p v-if="text" class="ds-lead">{{ text }}</p>
    <DsActions v-if="$slots.default"><slot /></DsActions>
  </div>
</template>

<style scoped>
.ds-empty {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-4);
  border: 1px dashed var(--lamp-line);
  border-radius: var(--radius-lg);
  text-align: center;
}

.ds-empty :deep(.ds-actions) {
  justify-content: center;
  margin-top: var(--space-2);
}
</style>
