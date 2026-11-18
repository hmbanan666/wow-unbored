<script setup lang="ts">
import { termParts } from "@unbored/contracts/guide";
import { articleImage, heroArt } from "#shared/game-media";
import type { PublicPage, CatalogSummary } from "#shared/catalog";
import { catalogHref, CATALOG_SECTION, PUBLIC_COPY, TIER_LABEL } from "#shared/catalog";

const props = defineProps<{
  page: PublicPage | null;
  message?: string;
  siblings?: CatalogSummary[];
}>();

const isGuide = computed(() => props.page?.kind === "guide");
const opening = computed(() =>
  isGuide.value && props.page?.blocks[0]?.type === "paragraph" ? props.page.blocks[0] : null,
);
const body = computed(() =>
  opening.value ? props.page!.blocks.slice(1) : (props.page?.blocks ?? []),
);
const contents = computed(() =>
  isGuide.value
    ? body.value.flatMap((b, i) =>
        b.type === "heading" ? [{ text: b.text, href: "#section-" + (i + 1) }] : [],
      )
    : [],
);

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
      ? `Sources checked ${evidenceDate(props.page.asOf.date)} · ${props.page.asOf.build}`
      : props.page?.build
        ? `Checked against game build ${props.page.build}`
        : "",
  ]
    .filter(Boolean)
    .join(" · "),
);

if (isGuide.value) useHead({ titleTemplate: "%s" });
useSeoMeta({
  title: () => props.page?.title || "Unbored",
  description: () => props.page?.description || "",
  ogType: () => (props.page?.kind === "page" ? "website" : "article"),
  articlePublishedTime: () =>
    props.page?.publishedAt ? new Date(props.page.publishedAt * 1000).toISOString() : undefined,
  articleModifiedTime: () =>
    props.page?.kind !== "page" && props.page?.updatedAt
      ? new Date(props.page.updatedAt * 1000).toISOString()
      : undefined,
});

const shareImage = props.page?.hero
  ? articleImage({ ...props.page, items: [] }, useSiteConfig().url || "https://playunbored.com")
  : undefined;
defineOgImage("Unbored", {
  title: props.page?.headline || "Unbored",
  description: props.page?.description || "Bory gives you one step at a time.",
  game: props.page?.game,
  image: shareImage ? `${new URL(shareImage).pathname}?format=png` : undefined,
  imageFit:
    props.page?.hero && heroArt(props.page.hero, props.page.media)?.render === false
      ? "cover"
      : "contain",
});

if (props.page && props.page.kind !== "page") {
  const page = props.page;
  const faq = page.kind === "guide" ? page.blocks.find((block) => block.type === "faq") : undefined;
  useSchemaOrg([
    ...(faq
      ? [
          defineWebPage({
            "@type": "FAQPage",
            mainEntity: faq.entries.map((entry) => ({
              "@type": "Question",
              name: entry.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: termParts(entry.a, [], false)
                  .map((part) => part.text)
                  .join(""),
              },
            })),
          }),
        ]
      : []),
    {
      ...defineArticle({
        headline: page.title,
        image: articleImage(page, useSiteConfig().url || "https://playunbored.com"),
        description: page.description,
        author: { "@id": "#identity" },
        publisher: { "@id": "#identity" },
        ...(page.publishedAt
          ? { datePublished: new Date(page.publishedAt * 1000).toISOString() }
          : {}),
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
    :width="
      page && (page.kind === 'page' || contents.length >= 3 || heroArt(page.hero, page.media))
        ? 'wide'
        : 'narrow'
    "
  >
    <DsEmptyState
      v-if="!page"
      :level="1"
      title="Unbored"
      :text="message || PUBLIC_COPY.unavailable"
    />
    <template v-else-if="page.kind === 'page'">
      <DsHero :title="page.headline">
        <EntryBody
          :terms="page.terms"
          :blocks="page.blocks"
          :media="page.media"
          :items="page.items"
        />
      </DsHero>
      <slot />
    </template>
    <template v-else>
      <div v-if="isGuide" class="guide-trail">
        <DsBreadcrumbs :trail="trail" /><DsChip v-if="page.game === 'forever'" tone="gold"
          >WoW Forever</DsChip
        >
      </div>
      <DsGameHeader :page="page">
        <DsPageHeader
          :trail="isGuide ? undefined : trail"
          :eyebrow="isGuide ? undefined : eyebrow"
          :title="page.headline"
          :lead="isGuide ? undefined : page.description"
          :meta="isGuide ? undefined : meta"
        />
      </DsGameHeader>
      <div :class="{ 'guide-spread': contents.length >= 3 }">
        <section v-if="isGuide" class="short-answer" aria-labelledby="short-answer">
          <h2 id="short-answer">The short answer</h2>
          <EntryBody
            v-if="opening"
            :blocks="[opening]"
            :terms="page.terms"
            :references="page.references"
            :items="page.items"
            :media="page.media"
            answer
          />
          <p v-else>{{ page.description }}</p>
        </section>
        <p v-if="isGuide && meta" class="ds-meta">{{ meta }}</p>
        <p v-if="page.asOf?.note" class="ds-meta">{{ page.asOf.note }}</p>
        <details v-if="contents.length >= 3" class="contents">
          <summary>On this page</summary>
          <nav aria-label="On this page">
            <a v-for="section in contents" :key="section.href" :href="section.href">{{
              section.text
            }}</a>
          </nav>
        </details>
        <EntryBody
          :terms="page.terms"
          :blocks="body"
          :anchors="isGuide"
          :references="page.references"
          :media="page.media"
          :items="page.items"
        />
        <nav v-if="contents.length >= 3" class="margin-contents" aria-label="Guide sections">
          <h2>On this page</h2>
          <a v-for="section in contents" :key="section.href" :href="section.href">{{
            section.text
          }}</a>
        </nav>
      </div>
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
      <DsSection v-if="page.game === 'retail'" divided title="Track this in game with Bory">
        <p>Pick an idea in Retail and follow one step at a time, with a pin on the map.</p>
        <DsActions>
          <DsButton to="/install">Get Bory</DsButton>
          <DsButton v-if="section" :to="section.to" variant="secondary"
            >More {{ section.label.toLowerCase() }}</DsButton
          >
        </DsActions>
      </DsSection>
      <DsSection
        v-if="page.kind === 'guide'"
        divided
        :title="page.game === 'forever' ? 'More WoW Forever guides' : 'More guides'"
        :more="{
          label: page.game === 'forever' ? 'All WoW Forever guides' : 'All guides',
          to: page.game === 'forever' ? '/forever' : '/guides',
        }"
      >
        <DsProse v-if="siblings?.length">
          <ul>
            <li v-for="sibling in siblings" :key="sibling.href">
              <NuxtLink :to="sibling.href">{{ sibling.title }}</NuxtLink>
            </li>
          </ul>
        </DsProse>
      </DsSection>
    </template>
  </DsPage>
</template>

<style scoped>
.guide-trail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.guide-trail :deep(ol) {
  margin: 0;
}
.margin-contents {
  display: none;
}
@media (min-width: 1024px) {
  .guide-spread {
    display: grid;
    grid-template-columns: minmax(0, var(--container-narrow)) minmax(12rem, 1fr);
    column-gap: var(--space-7);
  }
  .guide-spread > * {
    grid-column: 1;
  }
  .guide-spread > .contents {
    display: none;
  }
  .margin-contents {
    display: grid;
    grid-column: 2;
    grid-row: 1 / span 5;
    align-self: start;
    position: sticky;
    top: var(--space-4);
    margin-top: var(--space-3);
    border-top: 2px solid var(--lamp-gold-dark);
  }
  .margin-contents h2 {
    font: 700 var(--text-sm)/1.3 var(--font-ui);
    color: var(--lamp-muted);
    padding-top: var(--space-3);
  }
  .margin-contents a {
    display: block;
    align-content: center;
    min-height: var(--tap);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--lamp-line-soft);
    font: 500 var(--text-base)/1.35 var(--font-ui);
    text-decoration: none;
  }
  .margin-contents a:hover {
    text-decoration: underline;
  }
}
.short-answer {
  margin-block: var(--space-3) var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-inline-start: 3px solid var(--lamp-gold);
  background: linear-gradient(105deg, var(--lamp-glow), var(--lamp-bg));
  color: var(--lamp-text);
  font-size: var(--text-lg);
  line-height: 1.45;
  max-width: var(--container-narrow);
}
.short-answer h2 {
  font: 700 var(--text-sm)/1.4 var(--font-ui);
  color: var(--lamp-gold);
  margin-bottom: var(--space-2);
}
.contents {
  margin-block: var(--space-4) var(--space-5);
  border-block: 1px solid var(--lamp-line-soft);
}
.contents summary,
.contents a {
  min-height: var(--tap);
  align-content: center;
}
.contents summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--lamp-gold-light);
}
.contents nav {
  display: grid;
  padding-inline: var(--space-4);
}
</style>
