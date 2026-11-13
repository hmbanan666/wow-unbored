<script setup lang="ts">
import type { CatalogSummary } from "#shared/catalog";
import {
  FOREVER_TITLE as title,
  FOREVER_DESCRIPTION as description,
  foreverHub,
} from "#shared/forever-hub";

const { data, error, refresh } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
  query: { kind: "guide", game: "forever" },
});
const { data: professions } = await useFetch<{ slug: string }[]>("/api/game/forever/professions");
const hub = computed(() => foreverHub(data.value?.pages ?? []));
const site = useSiteConfig();
const absolute = (path: string) => new URL(path, site.url).href;
const listId = absolute("/forever#guides");
useSeoMeta({ title, description });
defineOgImage("Unbored", { title, description, game: "forever" });
useSchemaOrg([
  defineWebPage({
    "@type": "CollectionPage",
    name: title,
    description,
    mainEntity: { "@id": listId },
  }),
  defineItemList(
    computed(() => ({
      "@id": listId,
      name: title,
      numberOfItems: hub.value.listed.length,
      itemListElement: hub.value.listed.map((page, index) => ({
        "@type": "ListItem" as const,
        position: index + 1,
        name: page.title,
        url: absolute(page.href),
      })),
    })),
  ),
]);
</script>

<template>
  <div>
    <DsContainer v-if="professions?.length" width="wide"
      ><DsButton to="/forever/professions" variant="ghost"
        >Explore profession recipes</DsButton
      ></DsContainer
    >
    <ForeverHub :hub="hub" :unavailable="!!error" @refresh="refresh" />
  </div>
</template>
