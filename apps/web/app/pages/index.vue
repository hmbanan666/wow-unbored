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
const guides = computed(() => (catalog.value?.pages ?? []).filter((item) => item.kind === "guide"));

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
  <div>
    <PageView :page="page" />
    <section class="home-section">
      <h2>How Bory works</h2>
      <ol class="steps">
        <li>
          <strong>Install the addon and the Companion.</strong> The Companion is a small Windows app
          that keeps Bory up to date.
        </li>
        <li>
          <strong>Pick an idea in game.</strong> No typing: tap a chip like "Get a mount" or one of
          Bory's ideas.
        </li>
        <li>
          <strong>Follow one step at a time.</strong> Each plan promises one result you can really
          get tonight, with a pin on the map for every step.
        </li>
      </ol>
    </section>
    <section v-if="guides.length" class="home-section">
      <h2>Guides</h2>
      <p class="meta">Short guides, checked against the game's own data.</p>
      <div class="cards">
        <CatalogCard v-for="item in guides" :key="item.href" :page="item" />
      </div>
      <p><NuxtLink to="/guides">All guides</NuxtLink></p>
    </section>
    <section v-if="collections.length" class="home-section">
      <h2>Collections</h2>
      <p class="meta">Short, authored top lists. Every pick says exactly where it comes from.</p>
      <div class="cards">
        <CatalogCard v-for="item in collections" :key="item.href" :page="item" />
      </div>
      <p><NuxtLink to="/collections">All collections</NuxtLink></p>
    </section>
    <section v-if="paths.length" class="home-section">
      <h2>Paths</h2>
      <div class="cards">
        <CatalogCard v-for="item in paths" :key="item.href" :page="item" />
      </div>
      <p><NuxtLink to="/paths">All paths</NuxtLink></p>
    </section>
  </div>
</template>
