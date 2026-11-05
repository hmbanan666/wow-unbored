<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide", game: "retail" },
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
  <DsPage width="wide">
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Guides', to: '/guides' },
      ]"
      title="Guides"
      lead="Short guides with the facts checked against the game's own data. Each one points at the lists and Paths that take you further."
    />
    <DsSection>
      <DsCard
        to="/forever"
        title="WoW Forever"
        text="Guides for Blizzard’s separate Classic-based game."
      />
    </DsSection>
    <CatalogGrid :pages="pages" empty="The first guides are on their way." />
  </DsPage>
</template>
