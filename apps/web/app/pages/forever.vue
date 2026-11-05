<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide", game: "forever" },
});
const pages = computed(() => data.value?.pages ?? []);

const title = "WoW Forever guides";
const description =
  "Guides for World of Warcraft: Forever, Blizzard's Classic-based game that launched on 4 November 2026. Every fact is checked against the current build and its sources are listed on each page.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title, description });
useSchemaOrg([
  defineWebPage({ "@type": "CollectionPage", name: title, description }),
  defineItemList({
    name: title,
    numberOfItems: pages.value.length,
    itemListElement: pages.value.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: page.title,
      url: page.href,
    })),
  }),
]);
</script>

<template>
  <DsPage width="wide">
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'WoW Forever', to: '/forever' },
      ]"
      :title="title"
      :lead="description"
    />
    <CatalogGrid :pages="pages" empty="The first WoW Forever guides are on their way." />
  </DsPage>
</template>
