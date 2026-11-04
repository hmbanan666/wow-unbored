<script setup lang="ts">
import type { PublicPage } from "#shared/catalog";
import { CATALOG_SECTION, PUBLIC_COPY, TIER_LABEL } from "#shared/catalog";

const props = defineProps<{
  page: PublicPage | null;
  message?: string;
}>();

const section = computed(() =>
  props.page && props.page.kind !== "page" ? CATALOG_SECTION[props.page.kind] : undefined,
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

const eyebrow = computed(() =>
  [section.value?.one, props.page?.tier ? TIER_LABEL[props.page.tier] : ""]
    .filter(Boolean)
    .join(" · "),
);
const meta = computed(() =>
  [
    updated.value ? `Updated ${updated.value}` : "",
    props.page?.build ? `Checked against game build ${props.page.build}` : "",
  ]
    .filter(Boolean)
    .join(" · "),
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
  <DsPage :width="page && page.kind === 'page' ? 'wide' : 'narrow'">
    <DsEmptyState
      v-if="!page"
      :level="1"
      title="Unbored"
      :text="message || PUBLIC_COPY.unavailable"
    />
    <template v-else-if="page.kind === 'page'">
      <DsHero :title="page.headline">
        <EntryBody :blocks="page.blocks" />
      </DsHero>
      <slot />
    </template>
    <template v-else>
      <DsPageHeader
        :trail="trail"
        :eyebrow="eyebrow"
        :title="page.headline"
        :lead="page.description"
        :meta="meta"
      />
      <EntryBody :blocks="page.blocks" />
      <PersonalPaths v-if="page.kind === 'path' || page.kind === 'collection'" :page="page">
        <template #default="{ progress, copy }">
          <CollectionItems
            v-if="page.items.length"
            :items="page.items"
            :progress="progress"
            :copy="copy"
          />
        </template>
      </PersonalPaths>
      <CollectionItems v-else-if="page.items.length" :items="page.items" />
      <DsSection
        divided
        :title="page.kind === 'guide' ? 'Let Bory pick the next step' : 'Track this list in game'"
      >
        <p>
          Install Unbored and Bory, a calm ginger cat, gives you the next step in game, one at a
          time, with a pin on the map.
        </p>
        <DsActions>
          <DsButton to="/install">Get Unbored</DsButton>
          <DsButton v-if="section" :to="section.to" variant="secondary"
            >More {{ section.label.toLowerCase() }}</DsButton
          >
        </DsActions>
      </DsSection>
    </template>
  </DsPage>
</template>
