<script setup lang="ts">
/** A titled block of a page: heading, optional lead, content, optional "more" link. */
defineProps<{
  title?: string;
  lead?: string;
  more?: { label: string; to: string };
  divided?: boolean;
}>();
</script>

<template>
  <section class="ds-section" :class="{ 'ds-section--divided': divided }">
    <header v-if="title || lead" class="ds-section__head">
      <DsHeading v-if="title" :level="2">{{ title }}</DsHeading>
      <p v-if="lead" class="ds-meta">{{ lead }}</p>
    </header>
    <slot />
    <p v-if="more" class="ds-section__more">
      <DsButton :to="more.to" variant="ghost">{{ more.label }} →</DsButton>
    </p>
  </section>
</template>

<style scoped>
.ds-section {
  margin-top: var(--space-7);
}

.ds-section--divided {
  padding-top: var(--space-6);
  border-top: 1px solid var(--lamp-line-soft);
}

.ds-section__head {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.ds-section__more {
  margin-top: var(--space-4);
}
</style>
