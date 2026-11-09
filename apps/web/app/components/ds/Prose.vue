<script setup lang="ts">
/** Reading rhythm for authored text: paragraphs, lists, H2s. */
</script>

<template>
  <div class="ds-prose"><slot /></div>
</template>

<style scoped>
.ds-prose > :deep(* + *) {
  margin-top: var(--space-4);
}

.ds-prose :deep(h2) {
  margin-top: var(--space-6);
  color: var(--lamp-gold-light);
  font-size: var(--text-2xl);
}

.ds-prose :deep(ul),
.ds-prose :deep(ol) {
  padding-left: var(--space-5);
}

.ds-prose :deep(li + li) {
  margin-top: var(--space-2);
}

.ds-prose :deep(code) {
  overflow-wrap: anywhere;
}

.ds-prose :deep(li::marker) {
  color: var(--lamp-gold);
}
</style>
