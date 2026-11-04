<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";
defineProps<{ icons: CatalogSummary["icons"] }>();
</script>
<template>
  <span v-if="icons.length" class="ds-game-icon-strip" aria-hidden="true">
    <DsGameIcon
      v-for="icon in icons.slice(0, 5)"
      :key="`${icon.kind}:${icon.id}`"
      :kind="icon.kind"
      :media="icon.icon"
      size="sm"
    />
  </span>
</template>
<style scoped>
.ds-game-icon-strip {
  display: flex;
  padding-bottom: var(--space-2);
}
.ds-game-icon-strip :deep(.ds-game-icon + .ds-game-icon) {
  margin-left: -6px;
}
</style>
