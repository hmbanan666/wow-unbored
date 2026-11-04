<script setup lang="ts">
/** Top of every page below the home: breadcrumbs, eyebrow, H1, lead, meta line. */
defineProps<{
  trail?: { label: string; to: string }[];
  eyebrow?: string;
  title: string;
  lead?: string;
  meta?: string;
}>();
</script>

<template>
  <header class="ds-page-header">
    <DsBreadcrumbs v-if="trail && trail.length" :trail="trail" />
    <DsHeading :level="1" :eyebrow="eyebrow">{{ title }}</DsHeading>
    <p v-if="lead" class="ds-lead">{{ lead }}</p>
    <p v-if="meta" class="ds-meta">{{ meta }}</p>
    <slot />
  </header>
</template>

<style scoped>
.ds-page-header {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.ds-page-header > p {
  max-width: var(--container-narrow);
}

.ds-page-header > :deep(.ds-crumbs) {
  margin-bottom: 0;
}
</style>
