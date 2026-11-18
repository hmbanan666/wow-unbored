<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";

const { data } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide", game: "retail" },
});
const pages = computed(() => data.value?.pages ?? []);

const title = "WoW Retail guides, Collections and Paths";
const description =
  "Short World of Warcraft guides written from the game's own data: what to do next, and exactly how to get the mounts and pets worth having.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title, description });
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
      title="WoW Retail field guides"
      lead="Find your next mount, choose a Collection or work through an expansion at your own pace."
    />
    <DsCardGrid>
      <DsCard
        to="/collections"
        title="Collections"
        text="Browse mounts, pets and toys, with a source for each pick."
      />
      <DsCard to="/paths" title="Paths" text="Pick an expansion and follow its goals in order." />
    </DsCardGrid>
    <DsSection title="Retail guides">
      <CatalogGrid :pages="pages" empty="The first guides are on their way." />
    </DsSection>
  </DsPage>
</template>
