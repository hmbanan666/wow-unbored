<script setup lang="ts">
import type { AlbumRecipe } from "@unbored/contracts/profession-progress";
defineProps<{ items: AlbumRecipe["teachingItemNames"]; binding?: boolean }>();
</script>
<template>
  <span class="formula-list">
    <span v-for="item in items" :key="item.itemId">
      <span :class="['formula', `quality-${item.quality}`]">{{
        item.name || "Formula name unavailable"
      }}</span>
      <template v-if="binding">
        ·
        {{
          item.bindOnPickup === null
            ? "binding unknown until seen"
            : item.bindOnPickup
              ? "bind on pickup"
              : "tradable"
        }}</template
      >
    </span>
  </span>
</template>
<style scoped>
.formula-list {
  display: grid;
  gap: var(--space-1);
  color: var(--lamp-muted);
}
.quality-0 {
  color: var(--recipe-grey);
}
.quality-1 {
  color: #eeeeee;
}
.quality-2 {
  color: #91c98b;
}
.quality-3 {
  color: #80b3ff;
}
.quality-4 {
  color: #c396ff;
}
.quality-5 {
  color: var(--recipe-orange);
}
.quality-6,
.quality-7 {
  color: var(--lamp-gold-light);
}
</style>
