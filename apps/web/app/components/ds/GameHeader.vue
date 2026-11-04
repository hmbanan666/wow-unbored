<script setup lang="ts">
import type { PublicPage } from "#shared/catalog";
import { heroArt } from "#shared/game-media";
const props = defineProps<{ page: PublicPage }>();
const art = computed(() => heroArt(props.page.hero, props.page.media));
const icons = computed(() =>
  props.page.kind === "collection" || props.page.kind === "path"
    ? props.page.items.slice(0, 6)
    : [],
);
</script>

<template>
  <div v-if="art || icons.length" class="ds-game-header" :class="{ 'ds-game-header--hero': art }">
    <div v-if="art" class="ds-game-header__art">
      <DsGameArt
        :media="art.media"
        :alt="art.alt"
        :render="art.render"
        :max-width="art.render ? 320 : 640"
        sizes="(min-width: 768px) 320px, calc(100vw - 32px)"
        eager
      />
    </div>
    <div v-else class="ds-game-header__icons" aria-hidden="true">
      <DsGameIcon
        v-for="(item, index) in icons"
        :key="index"
        :kind="item.kind"
        :media="page.media[`${item.kind}:${item.id}`]?.icon"
        size="sm"
      />
    </div>
    <slot />
  </div>
  <slot v-else />
</template>

<style scoped>
.ds-game-header {
  display: grid;
  gap: var(--space-4);
}
.ds-game-header__art {
  aspect-ratio: 16 / 9;
  padding: var(--space-2);
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-md);
  background: var(--lamp-bg);
  overflow: hidden;
}
.ds-game-header__art :deep(picture),
.ds-game-header__art :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.ds-game-header__icons {
  display: flex;
  gap: var(--space-2);
}
@media (min-width: 768px) {
  .ds-game-header--hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
    align-items: center;
    gap: var(--space-6);
    margin-bottom: var(--space-6);
  }
  .ds-game-header__art {
    order: 2;
  }
  .ds-game-header--hero :deep(.ds-page-header) {
    margin-bottom: 0;
  }
  .ds-game-header__icons :deep(.ds-game-icon) {
    --game-icon-size: 44px;
  }
}
</style>
