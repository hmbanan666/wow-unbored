<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "collection" },
});
const pages = computed(() => data.value?.pages ?? []);

const title = "World of Warcraft collections: mounts and pets to get first";
const description =
  "Short, authored top lists for World of Warcraft: the mounts and battle pets worth getting first, each with exactly where and how to get it.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title: "Collections", description });
useSchemaOrg([
  defineWebPage({ "@type": "CollectionPage", name: title, description }),
  defineItemList({
    name: "Collections",
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
  <main class="page page-wide">
    <SiteBreadcrumbs
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Collections', to: '/collections' },
      ]"
    />
    <h1>Collections</h1>
    <p class="lead">
      Authored top lists, not a database: a short list of what is worth getting first, and for each
      pick exactly where it comes from. Luck-based drops are marked as chance drops.
    </p>
    <div v-if="pages.length" class="cards">
      <CatalogCard v-for="page in pages" :key="page.href" :page="page" />
    </div>
    <p v-else>The first collections are on their way.</p>
  </main>
</template>
