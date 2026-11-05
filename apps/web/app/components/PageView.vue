<script setup lang="ts">
import { articleImage, heroArt } from "#shared/game-media";
import type { PublicPage } from "#shared/catalog";
import { catalogHref, CATALOG_SECTION, PUBLIC_COPY, TIER_LABEL } from "#shared/catalog";

const props = defineProps<{
  page: PublicPage | null;
  message?: string;
}>();

const section = computed(() =>
  props.page?.game === "forever"
    ? { label: "WoW Forever", to: "/forever", one: "Guide" }
    : props.page && props.page.kind !== "page"
      ? CATALOG_SECTION[props.page.kind]
      : undefined,
);
const trail = computed(() =>
  section.value && props.page
    ? [
        { label: "Home", to: "/" },
        section.value,
        {
          label: props.page.title,
          to: catalogHref(props.page.kind as "guide" | "path" | "collection", props.page.slug)!,
        },
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
function evidenceDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
const meta = computed(() =>
  [
    updated.value ? `Updated ${updated.value}` : "",
    props.page?.asOf
      ? `Checked against build ${props.page.asOf.build} on ${evidenceDate(props.page.asOf.date)}`
      : props.page?.build
        ? `Checked against game build ${props.page.build}`
        : "",
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
    {
      ...defineArticle({
        headline: page.title,
        image: articleImage(page, useSiteConfig().url || "https://playunbored.com"),
        description: page.description,
        ...(page.updatedAt ? { dateModified: new Date(page.updatedAt * 1000).toISOString() } : {}),
      }),
      // The schema helper types about as text; Schema.org also accepts a Thing.
      about: {
        "@type": "VideoGame",
        name: page.game === "forever" ? "World of Warcraft: Forever" : "World of Warcraft",
      },
    },
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
  <DsPage
    :width="page && (page.kind === 'page' || heroArt(page.hero, page.media)) ? 'wide' : 'narrow'"
  >
    <DsEmptyState
      v-if="!page"
      :level="1"
      title="Unbored"
      :text="message || PUBLIC_COPY.unavailable"
    />
    <template v-else-if="page.kind === 'page'">
      <DsHero :title="page.headline">
        <EntryBody :blocks="page.blocks" :media="page.media" :items="page.items" />
      </DsHero>
      <slot />
    </template>
    <template v-else>
      <DsChipRow v-if="page.game === 'forever'"><DsChip tone="gold">WoW Forever</DsChip></DsChipRow>
      <DsGameHeader :page="page">
        <DsPageHeader
          :trail="trail"
          :eyebrow="eyebrow"
          :title="page.headline"
          :lead="page.description"
          :meta="meta"
        />
      </DsGameHeader>
      <p v-if="page.asOf?.note" class="ds-meta">{{ page.asOf.note }}</p>
      <EntryBody :blocks="page.blocks" :media="page.media" :items="page.items" />
      <PersonalPaths
        v-if="page.game === 'retail' && (page.kind === 'path' || page.kind === 'collection')"
        :page="page"
      >
        <template #default="{ progress, copy }">
          <LazyCollectionItems
            :hydrate-on-visible="{ rootMargin: '200px' }"
            v-if="page.items.length"
            :items="page.items"
            :media="page.media"
            :progress="progress"
            :copy="copy"
          />
        </template>
      </PersonalPaths>
      <LazyCollectionItems
        :hydrate-on-visible="{ rootMargin: '200px' }"
        v-else-if="page.items.length"
        :items="page.items"
        :media="page.media"
      />
      <DsSection v-if="page.sources?.length" title="Sources" divided>
        <DsProse
          ><ul>
            <li v-for="source in page.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="nofollow noopener noreferrer">{{
                source.label
              }}</a>
              <span class="ds-meta"> · Accessed {{ evidenceDate(source.accessed) }}</span>
            </li>
          </ul></DsProse
        >
      </DsSection>
      <DsActions v-if="page.game === 'forever'"
        ><DsButton to="/forever" variant="secondary">More WoW Forever guides</DsButton></DsActions
      >
      <DsSection
        v-else
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
