<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "path" },
});
const pages = computed(() => data.value?.pages ?? []);

const title = "World of Warcraft Paths: what to do next, step by step";
const description =
  "Paths are curated goal sets for one piece of World of Warcraft content, from Basic to Complete. Pick one and Bory plans the next goal in game.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title: "Paths", description });
useSchemaOrg([defineWebPage({ "@type": "CollectionPage", name: title, description })]);
</script>

<template>
  <main class="page page-wide">
    <SiteBreadcrumbs
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Paths', to: '/paths' },
      ]"
    />
    <h1>Paths</h1>
    <p class="lead">
      A Path is a curated set of goals for one piece of content, in tiers: Basic, then Deeper, then
      Complete. Topic branches cover mounts, achievements and PvP.
    </p>
    <div v-if="pages.length" class="cards">
      <CatalogCard v-for="page in pages" :key="page.href" :page="page" />
    </div>
    <template v-else>
      <p>The first Paths are being written. Until then, start with a collection.</p>
      <p><NuxtLink to="/collections">Browse collections</NuxtLink></p>
    </template>
  </main>
</template>
