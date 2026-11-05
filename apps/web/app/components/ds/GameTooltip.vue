<script setup lang="ts">
import type { PageMedia } from "@unbored/contracts/game-media";
import { ITEM_KIND_LABEL, type CatalogItem, type ItemKind } from "#shared/catalog";
defineProps<{
  name: string;
  kind: string;
  media?: PageMedia[string];
  item?: CatalogItem;
  open: boolean;
}>();
</script>

<template>
  <span class="ds-game-tooltip">
    <span v-if="media?.render && (kind === 'mount' || kind === 'pet')" class="ds-game-tooltip__art">
      <DsGameArt
        v-if="open"
        :media="media.render"
        :alt="media.render.alt"
        render
        :max-width="320"
        sizes="288px"
      />
    </span>
    <strong class="ds-game-tooltip__name">{{ name }}</strong>
    <span class="ds-game-tooltip__kind">{{ ITEM_KIND_LABEL[kind as ItemKind] }}</span>
    <template v-if="item">
      <span v-for="line in item.source.lines" :key="line">{{ line }}</span>
      <span
        ><DsChip :tone="item.chance ? 'chance' : 'gold'">{{
          item.chance ? "Chance drop" : "Guaranteed"
        }}</DsChip></span
      >
      <span v-if="item.note" class="ds-game-tooltip__note">{{ item.note }}</span>
    </template>
  </span>
</template>

<style scoped>
.ds-game-tooltip {
  display: grid;
  gap: var(--space-2);
}
.ds-game-tooltip__art {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--render-bg);
}
.ds-game-tooltip__art :deep(picture) {
  width: 100%;
  height: 100%;
}
.ds-game-tooltip__name {
  color: var(--lamp-gold-light);
  font-size: var(--text-lg);
}
.ds-game-tooltip__kind,
.ds-game-tooltip__note {
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}
</style>
