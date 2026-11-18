<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";
const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide", game: "forever" },
});
const guides = computed(
  () =>
    data.value?.pages?.filter((page) =>
      ["wow-forever-cozy-sleeping-bag", "best-wow-forever-addons"].includes(page.slug),
    ) ?? [],
);
</script>
<template>
  <DsSection v-if="guides.length" title="More for your next quest">
    <ul class="quest-reading">
      <li v-for="page in guides" :key="page.slug">
        <NuxtLink :to="page.href">{{ page.title }}</NuxtLink>
      </li>
    </ul>
  </DsSection>
</template>
<style scoped>
.quest-reading {
  list-style: none;
  padding: 0;
}
.quest-reading a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
}
</style>
