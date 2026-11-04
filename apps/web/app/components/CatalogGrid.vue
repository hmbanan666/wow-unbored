<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

/** Cards for catalog pages, or Bory's empty state when nothing is published yet. */
defineProps<{
  pages: CatalogSummary[];
  empty: string;
  emptyLink?: { label: string; to: string };
}>();
</script>

<template>
  <DsCardGrid v-if="pages.length">
    <CatalogCard v-for="page in pages" :key="page.href" :page="page" />
  </DsCardGrid>
  <DsEmptyState v-else :text="empty">
    <DsButton v-if="emptyLink" :to="emptyLink.to" variant="secondary">{{
      emptyLink.label
    }}</DsButton>
  </DsEmptyState>
</template>
