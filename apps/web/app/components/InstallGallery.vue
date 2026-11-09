<script setup lang="ts">
import { installMedia as media } from "#shared/install-media";
</script>

<template>
  <DsSection title="A plan in Tanaan Jungle">
    <figure class="install-gallery">
      <DsGameArt
        :media="media"
        :alt="media.alt"
        sizes="(min-width: 704px) 640px, calc(100vw - 64px)"
      />
      <figcaption>
        One step is current. Show more opens the full plan and its rewards, as shown here.
      </figcaption>
    </figure>
  </DsSection>
</template>

<style scoped>
.install-gallery {
  max-width: 640px;
  margin: 0;
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--lamp-deep);
}
.install-gallery :deep(img) {
  object-fit: contain;
}
figcaption {
  padding: var(--space-3) var(--space-4);
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}
</style>
