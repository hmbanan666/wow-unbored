<script setup lang="ts">
import type { GameText } from "#shared/game-media";
import type { PageMedia } from "@unbored/contracts/game-media";
defineProps<{ part: GameText; media?: PageMedia }>();
</script>

<template>
  <DsTooltip v-if="part.term" :fallback-href="`#guide-term-${part.term.key}`" class="ds-game-ref">
    <span class="ds-game-ref__name">{{ part.text }}</span>
    <template #panel>
      <DsGameIcon
        v-if="part.term.icon && media?.[`image:${part.term.icon}`]?.image"
        :kind="part.term.kind || 'item'"
        :media="media[`image:${part.term.icon}`]!.image"
        size="sm"
      />
      <strong class="ds-term-name">{{ part.term.name }}</strong>
      <span>{{ part.term.text }}</span>
    </template>
  </DsTooltip>
  <DsTooltip v-else-if="part.kind && part.media" class="ds-game-ref">
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
.ds-term-name {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--lamp-gold);
}
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
