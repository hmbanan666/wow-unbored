<script setup lang="ts">
import { PUBLIC_COPY, type CatalogSummary } from "#shared/catalog";

const { data, error, refresh } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide", game: "forever" },
});
const pages = computed(() => data.value?.pages ?? []);
const systemSlugs = new Set([
  "wow-forever-camping-guide",
  "wow-forever-cozy-sleeping-bag",
  "wow-forever-legacy-talents",
  "wow-forever-enhanced-vs-classic-preset",
]);
const systems = computed(() => pages.value.filter((page) => systemSlugs.has(page.slug)));
const otherGuides = computed(() => pages.value.filter((page) => !systemSlugs.has(page.slug)));

const title = "WoW Forever guides";
const description =
  "Guides for World of Warcraft: Forever, Blizzard's Classic-based game that launched on 4 November 2026. Every fact is checked against the current build and its sources are listed on each page.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title, description, game: "forever" });
useSchemaOrg([
  defineWebPage({ "@type": "CollectionPage", name: title, description }),
  defineItemList({
    name: title,
    numberOfItems: pages.value.length,
    itemListElement: [...otherGuides.value, ...systems.value].map((page, index) => ({
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
    <DsEmptyState v-if="error" :text="PUBLIC_COPY.unavailable">
      <DsButton @click="refresh()">Try again</DsButton>
    </DsEmptyState>
    <template v-else>
      <CatalogGrid
        v-if="otherGuides.length || !pages.length"
        :pages="otherGuides"
        empty="The first WoW Forever guides are on their way."
      />
      <DsSection v-if="systems.length" title="Systems">
        <CatalogGrid :pages="systems" empty="" />
      </DsSection>
    </template>
  </DsPage>
</template>
