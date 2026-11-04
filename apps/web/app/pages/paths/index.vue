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
  <DsPage width="wide">
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Paths', to: '/paths' },
      ]"
      title="Paths"
      lead="A Path is a curated set of goals for one piece of content, in tiers: Basic, then Deeper, then Complete. Topic branches cover mounts, achievements and PvP."
    />
    <PersonalPaths>
      <template #default="{ paths, copy }">
        <CatalogGrid
          :progress="paths"
          :progress-label="copy.required"
          :pages="pages"
          empty="The first Paths are being written. Until then, start with a collection."
          :empty-link="{ label: 'Browse collections', to: '/collections' }"
        />
      </template>
    </PersonalPaths>
  </DsPage>
</template>
