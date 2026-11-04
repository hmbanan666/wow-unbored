<script setup lang="ts">
import { CATALOG_SECTION, TIER_LABEL, type CatalogSummary } from "#shared/catalog";

defineProps<{ page: CatalogSummary }>();
</script>

<template>
  <NuxtLink class="catalog-card" :to="page.href">
    <span class="card-kind">
      {{ CATALOG_SECTION[page.kind].one }}
      <template v-if="page.tier"> · {{ TIER_LABEL[page.tier] }}</template>
      <template v-if="page.count && page.kind !== 'guide'">
        · {{ page.count }} {{ page.kind === "collection" ? "picks" : "goals" }}</template
      >
    </span>
    <strong>{{ page.title }}</strong>
    <span class="card-text">{{ page.description }}</span>
  </NuxtLink>
</template>
