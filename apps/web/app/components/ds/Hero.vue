<script setup lang="ts">
/** Home opening: eyebrow, the gold display line, text and actions, Bory beside it. */
defineProps<{ title: string; eyebrow?: string }>();
</script>

<template>
  <section class="ds-hero">
    <DsPortrait size="lg" class="ds-hero__bory" />
    <div class="ds-hero__text">
      <DsHeading :level="1" :eyebrow="eyebrow">{{ title }}</DsHeading>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.ds-hero {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5) 0 var(--space-4);
}

.ds-hero__text {
  display: grid;
  gap: var(--space-4);
}

@media (min-width: 768px) {
  .ds-hero {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-7);
    padding-top: var(--space-7);
  }

  .ds-hero__bory {
    order: 2;
    width: 11rem;
    height: 11rem;
  }
}
</style>
