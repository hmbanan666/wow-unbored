<script setup lang="ts">
import {
  pageMessage,
  PUBLIC_COPY,
  RELEASES_URL,
  type CatalogSummary,
  type PublicPage,
} from "#shared/catalog";

type Payload = PublicPage | { error: string; message: string };

const { data, error } = await useFetch<Payload>("/api/home");
const page = data.value && "headline" in data.value ? data.value : null;
if (!page) {
  throw createError({
    statusCode: 503,
    statusMessage: pageMessage(data.value, error.value, PUBLIC_COPY.unavailable),
    fatal: true,
  });
}
const { data: catalog } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog");
const collections = computed(() =>
  (catalog.value?.pages ?? []).filter((item) => item.kind === "collection"),
);
const paths = computed(() => (catalog.value?.pages ?? []).filter((item) => item.kind === "path"));
const guides = computed(() =>
  (catalog.value?.pages ?? []).filter((item) => item.kind === "guide" && item.game === "retail"),
);
const hasForever = computed(() =>
  (catalog.value?.pages ?? []).some((item) => item.kind === "guide" && item.game === "forever"),
);

const steps = [
  {
    title: "Install the addon and the Companion.",
    text: "The Companion is a small Windows app that keeps Bory up to date.",
  },
  {
    title: "Pick an idea in game.",
    text: 'No typing: tap a chip like "Get a mount" or one of Bory\'s ideas.',
  },
  {
    title: "Follow one step at a time.",
    text: "Each plan promises one result you can really get tonight, with a pin on the map for every step.",
  },
];

useSchemaOrg([
  defineSoftwareApp({
    name: "Unbored",
    operatingSystem: "Windows",
    applicationCategory: "GameApplication",
    offers: { price: 0, priceCurrency: "USD" },
    downloadUrl: RELEASES_URL,
  }),
]);
</script>

<template>
  <PageView :page="page">
    <DsSection title="How Bory works">
      <DsSteps :steps="steps" />
    </DsSection>
    <DsSection
      v-if="guides.length"
      title="Guides"
      lead="Short guides, checked against the game's own data."
      :more="{ label: 'All guides', to: '/guides' }"
    >
      <CatalogGrid :pages="guides" empty="" />
    </DsSection>
    <DsSection v-if="hasForever">
      <DsCard
        to="/forever"
        title="WoW Forever"
        text="Explore guides for Blizzard’s separate Classic-based game, with sources and build checks."
      />
    </DsSection>
    <DsSection
      v-if="collections.length"
      title="Collections"
      lead="Short, authored top lists. Every pick says exactly where it comes from."
      :more="{ label: 'All collections', to: '/collections' }"
    >
      <CatalogGrid :pages="collections" empty="" />
    </DsSection>
    <DsSection v-if="paths.length" title="Paths" :more="{ label: 'All paths', to: '/paths' }">
      <CatalogGrid :pages="paths" empty="" />
    </DsSection>
  </PageView>
</template>
