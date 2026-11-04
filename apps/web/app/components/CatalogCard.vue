<script setup lang="ts">
import { TIER_LABEL, type CatalogSummary } from "#shared/catalog";

defineProps<{ page: CatalogSummary }>();
</script>

<template>
  <NuxtLink class="catalog-card" :to="page.href">
    <span class="card-kind">
      {{ page.kind === "collection" ? "Collection" : "Path" }}
      <template v-if="page.tier"> · {{ TIER_LABEL[page.tier] }}</template>
      <template v-if="page.count">
        · {{ page.count }} {{ page.kind === "collection" ? "picks" : "goals" }}</template
      >
    </span>
    <strong>{{ page.title }}</strong>
    <span class="card-text">{{ page.description }}</span>
  </NuxtLink>
</template>
