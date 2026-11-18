<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const title = "Field guides for WoW Forever and Retail";
const description =
  "Choose a hunter pet, find a profession recipe or track down the Grand Expedition Yak. Explore field guides for WoW Forever and World of Warcraft Retail.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title, description });
useSchemaOrg([defineWebPage({ "@type": "CollectionPage", name: title, description })]);

const { data, error, refresh } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog");
// Editorial order from the November 2026 search report. Only published entries can appear.
const picks = [
  "/guides/wow-forever-hunter-pet-guide",
  "/guides/best-wow-forever-addons",
  "/guides/wow-forever-cozy-sleeping-bag",
  "/guides/wow-forever-enchanting-guide",
  "/guides/wow-forever-warlock-leveling-guide",
  "/guides/how-to-get-the-grand-expedition-yak",
  "/collections/wow-hearthstone-toys",
];
const featured = computed(() => {
  const published = new Map(data.value?.pages?.map((page) => [page.href, page]));
  return picks.flatMap((href) => published.get(href) ?? []);
});
</script>
<template>
  <DsPage width="wide">
    <FieldGuideHome :featured="featured" :unavailable="!!error" @retry="refresh" />
  </DsPage>
</template>
