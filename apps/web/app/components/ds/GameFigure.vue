<script setup lang="ts">
import type { Figure, PageMedia } from "@unbored/contracts/game-media";
import { figureArt } from "#shared/game-media";
const props = defineProps<{ figure: Figure; media?: PageMedia }>();
const art = computed(() => figureArt(props.figure, props.media));
</script>

<template>
  <figure v-if="art" class="ds-game-figure">
    <DsGameArt :media="art.media" :alt="art.alt" :render="art.render" />
    <figcaption v-if="figure.caption">{{ figure.caption }}</figcaption>
  </figure>
</template>

<style scoped>
.ds-game-figure {
  margin: var(--space-5) 0;
  padding: var(--space-2);
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-md);
  background: var(--lamp-deep);
}
.ds-game-figure figcaption {
  padding: var(--space-3) var(--space-2) var(--space-1);
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}
</style>
