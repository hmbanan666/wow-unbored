<script setup lang="ts">
import type { Figure, PageMedia } from "@unbored/contracts/game-media";
import { figureArt } from "#shared/game-media";
const props = defineProps<{ figure: Figure; media?: PageMedia }>();
const art = computed(() => figureArt(props.figure, props.media));
</script>

<template>
  <figure v-if="art" class="ds-game-figure" :class="{ 'ds-game-figure--render': art.render }">
    <DsGameArt :media="art.media" :alt="art.alt" :render="art.render" />
    <figcaption v-if="figure.caption">{{ figure.caption }}</figcaption>
  </figure>
</template>

<style scoped>
.ds-game-figure {
  margin: var(--space-4) 0;
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-md);
  background: var(--lamp-deep);
  overflow: hidden;
}
.ds-game-figure--render {
  background: var(--render-bg);
}
.ds-game-figure :deep(picture) {
  border-radius: 0;
}
.ds-game-figure figcaption {
  padding: var(--space-3) var(--space-2) var(--space-1);
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}
</style>
