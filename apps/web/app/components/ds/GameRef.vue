<script setup lang="ts">
import type { GameText } from "#shared/game-media";
defineProps<{ part: GameText }>();
</script>

<template>
  <DsTooltip v-if="part.kind && part.media" class="ds-game-ref">
    <DsGameIcon :kind="part.kind" :media="part.media.icon" size="sm" />
    <span class="ds-game-ref__name">{{ part.text }}</span>
    <template #panel="{ open }"
      ><DsGameTooltip
        :name="part.text"
        :kind="part.kind"
        :media="part.media"
        :item="part.item"
        :open="open"
    /></template>
  </DsTooltip>
  <template v-else>{{ part.text }}</template>
</template>

<style scoped>
.ds-game-ref {
  color: var(--lamp-gold);
}
.ds-game-ref__name {
  text-decoration: underline dotted;
  text-underline-offset: 0.2em;
}
.ds-game-ref :deep(.ds-tooltip__trigger) {
  font-size: inherit;
  line-height: inherit;
}
</style>
