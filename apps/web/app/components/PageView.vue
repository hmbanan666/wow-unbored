<script setup lang="ts">
import type { PublicPage } from "#shared/catalog";
import { PUBLIC_COPY, SITE_NAV, TIER_LABEL } from "#shared/catalog";

const props = defineProps<{
  page: PublicPage | null;
  message?: string;
}>();

const tier = computed(() => (props.page?.tier ? TIER_LABEL[props.page.tier] : ""));
const section = computed(() =>
  props.page?.kind === "path"
    ? { label: "Paths", to: "/paths" }
    : props.page?.kind === "collection"
      ? { label: "Collections", to: "/collections" }
      : undefined,
);
const trail = computed(() =>
  section.value && props.page
    ? [
        { label: "Home", to: "/" },
        section.value,
        { label: props.page.title, to: `${section.value.to}/${props.page.slug}` },
      ]
    : [],
);
const updated = computed(() =>
  props.page?.updatedAt
    ? new Date(props.page.updatedAt * 1000).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "",
);

useSeoMeta({
  title: () => props.page?.title || "Unbored",
  description: () => props.page?.description || "",
  ogType: () => (props.page?.kind === "page" ? "website" : "article"),
});

defineOgImage("Unbored", {
  title: props.page?.headline || "Unbored",
  description: props.page?.description || "Bory gives you one step at a time.",
});

if (props.page && props.page.kind !== "page") {
  const page = props.page;
  useSchemaOrg([
    defineArticle({
      headline: page.title,
      description: page.description,
      ...(page.updatedAt ? { dateModified: new Date(page.updatedAt * 1000).toISOString() } : {}),
    }),
    ...(page.items.length
      ? [
          defineItemList({
            name: page.title,
            numberOfItems: page.items.length,
            itemListElement: page.items.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.name,
            })),
          }),
        ]
      : []),
  ]);
}
</script>

<template>
  <main class="page" :class="{ 'page-wide': page && page.items.length }">
    <SiteBreadcrumbs v-if="trail.length" :trail="trail" />
    <div v-if="!page || page.kind === 'page'" class="portrait" aria-hidden="true">
      <img class="bory" src="/bory.png" alt="" />
      <img src="/bory-frame.png" alt="" />
    </div>
    <p v-if="!page">{{ message || PUBLIC_COPY.unavailable }}</p>
    <template v-else>
      <h1>{{ page.headline }}</h1>
      <p v-if="tier" class="tier">{{ tier }}</p>
      <p v-if="page.kind !== 'page'" class="lead">{{ page.description }}</p>
      <p v-if="page.kind !== 'page' && (updated || page.build)" class="meta">
        <template v-if="updated">Updated {{ updated }}</template>
        <template v-if="updated && page.build"> · </template>
        <template v-if="page.build">Checked against game build {{ page.build }}</template>
      </p>
      <EntryBody :blocks="page.blocks" />
      <CollectionItems v-if="page.items.length" :items="page.items" />
      <section v-if="page.kind !== 'page'" class="track">
        <h2>Track this list in game</h2>
        <p>
          Install Unbored and Bory, a calm ginger cat, gives you the next step in game, one at a
          time, with a pin on the map. Ticking off this list on My page is coming next.
        </p>
        <div class="actions">
          <UButton to="/install" color="primary" size="lg" class="gold-button">Get Unbored</UButton>
          <UButton :to="SITE_NAV[0].to" color="neutral" variant="outline" size="lg"
            >More collections</UButton
          >
        </div>
      </section>
    </template>
  </main>
</template>
