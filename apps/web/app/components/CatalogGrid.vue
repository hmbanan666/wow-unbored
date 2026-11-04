<script setup lang="ts">
import type { PathProgress } from "#shared/personal-paths";
import type { CatalogSummary } from "#shared/catalog";

/** Cards for catalog pages, or Bory's empty state when nothing is published yet. */
defineProps<{
  pages: CatalogSummary[];
  progress?: PathProgress[];
  progressLabel?: string;
  empty: string;
  emptyLink?: { label: string; to: string };
}>();
</script>

<template>
  <DsCardGrid v-if="pages.length">
    <CatalogCard
      v-for="page in pages"
      :key="page.href"
      :page="page"
      :progress="
        progress?.find(
          (path) => path.kind === page.kind && path.slug === page.slug && path.locale === 'en',
        )
      "
      :progress-label="progressLabel"
    />
  </DsCardGrid>
  <DsEmptyState v-else :text="empty">
    <DsButton v-if="emptyLink" :to="emptyLink.to" variant="secondary">{{
      emptyLink.label
    }}</DsButton>
  </DsEmptyState>
</template>
