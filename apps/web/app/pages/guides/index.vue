<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide" },
});
const pages = computed(() => data.value?.pages ?? []);

const title = "World of Warcraft guides: what to do and how to get it";
const description =
  "Short World of Warcraft guides written from the game's own data: what to do next, and exactly how to get the mounts and pets worth having.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title: "Guides", description });
useSchemaOrg([
  defineWebPage({ "@type": "CollectionPage", name: title, description }),
  defineItemList({
    name: "Guides",
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
        { label: 'Guides', to: '/guides' },
      ]"
    />
    <h1>Guides</h1>
    <p class="lead">
      Short guides with the facts checked against the game's own data. Each one points at the lists
      and Paths that take you further.
    </p>
    <div v-if="pages.length" class="cards">
      <CatalogCard v-for="page in pages" :key="page.href" :page="page" />
    </div>
    <p v-else>The first guides are on their way.</p>
  </main>
</template>
