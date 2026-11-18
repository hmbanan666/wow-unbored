<script setup lang="ts">
import { SITE_NAV, type CatalogSummary } from "#shared/catalog";
defineProps<{ featured: CatalogSummary[]; unavailable: boolean }>();
defineEmits<{ retry: [] }>();
const doorText = [
  "Start a character or plan your next quest.",
  "Look up a recipe and where to learn it.",
  "Find a mount, build a Collection or follow a Path.",
];
</script>
<template>
  <header class="field-cover">
    <div class="landscape" aria-hidden="true">
      <i class="sun" /><i class="ridge far" /><i class="ridge near" /> <i class="river" /><i
        class="pines"
      />
    </div>
    <h1>
      <span>Field guides for </span>WoW Forever<br />
      and Retail
    </h1>
  </header>
  <nav class="doors" aria-label="Explore the field guides">
    <NuxtLink v-for="(door, index) in SITE_NAV" :key="door.to" :to="door.to">
      <strong>{{ door.label }} <span aria-hidden="true">↗</span></strong>
      <small>{{ doorText[index] }}</small>
    </NuxtLink>
  </nav>
  <DsSection v-if="featured.length || unavailable" title="Most read">
    <div v-if="unavailable" role="status">
      The guides could not be loaded.
      <DsButton variant="ghost" @click="$emit('retry')">Try again</DsButton>
    </div>
    <ul v-else class="features">
      <li v-for="page in featured" :key="page.href">
        <NuxtLink :to="page.href">
          <small
            >{{ page.game === "forever" ? "WoW Forever" : "WoW Retail" }} ·
            {{ page.kind === "collection" ? "Collection" : "Guide" }}</small
          >
          <h3>{{ page.title }}</h3>
          <p>{{ page.description }}</p>
        </NuxtLink>
      </li>
    </ul>
  </DsSection>
  <p class="addon-note">
    Want your character’s progress alongside the guides?
    <NuxtLink to="/install">Get Bory</NuxtLink>.
  </p>
</template>
<style scoped>
.field-cover {
  isolation: isolate;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  min-height: clamp(14rem, 27vw, 20rem);
  padding: clamp(1.25rem, 4vw, 3rem);
  background: #332a22;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
h1 {
  position: relative;
  color: #fff1d2;
  font: 700 clamp(2.65rem, 6.6vw, 5.3rem)/0.94 var(--font-display);
  letter-spacing: -0.035em;
}
h1 span {
  display: block;
  font: italic 400 clamp(1.3rem, 2.4vw, 2rem)/1.2 var(--font-display);
  letter-spacing: 0;
  color: var(--lamp-gold-light);
  margin-bottom: var(--space-3);
}
.landscape,
.landscape i,
.landscape::after {
  position: absolute;
  inset: 0;
}
.landscape {
  background:
    repeating-linear-gradient(0deg, transparent 0 4px, #e9c17d18 5px),
    linear-gradient(162deg, #384f50 8%, #a69673 52%, #e4a35c 81%);
}
.landscape .sun {
  inset: 16% 16% auto auto;
  width: clamp(3.5rem, 8vw, 6rem);
  aspect-ratio: 1;
  border-radius: 50%;
  background: #f3d599;
  box-shadow:
    0 0 0 6px #ecd0a030,
    0 0 0 7px #f2d7a858;
}
.ridge {
  clip-path: polygon(
    0 85%,
    16% 61%,
    25% 74%,
    44% 35%,
    50% 49%,
    62% 18%,
    75% 55%,
    84% 40%,
    100% 65%,
    100% 100%,
    0 100%
  );
}
.ridge.far {
  top: 20%;
  background: repeating-linear-gradient(121deg, #756f5c 0 5px, #8d8269 6px 7px);
}
.ridge.near {
  top: 50%;
  background: #3b5150;
  transform: scaleX(-1);
}
.landscape .river {
  top: 75%;
  background: #a58d68;
  clip-path: polygon(
    82% 0,
    76% 16%,
    80% 31%,
    65% 49%,
    72% 60%,
    60% 79%,
    86% 100%,
    64% 100%,
    50% 80%,
    63% 59%,
    59% 50%,
    76% 31%,
    73% 16%
  );
}
.landscape .pines {
  inset: auto -1% 0 auto;
  width: 28%;
  height: 63%;
  background: #243a37;
  clip-path: polygon(
    0 100%,
    16% 85%,
    12% 86%,
    19% 72%,
    15% 74%,
    22% 55%,
    29% 75%,
    26% 74%,
    31% 82%,
    41% 71%,
    36% 73%,
    44% 55%,
    40% 57%,
    49% 33%,
    58% 58%,
    54% 57%,
    62% 73%,
    68% 64%,
    61% 66%,
    72% 47%,
    65% 50%,
    77% 22%,
    71% 27%,
    82% 0,
    95% 34%,
    89% 31%,
    100% 55%,
    100% 100%
  );
}
.landscape::after {
  content: "";
  background: linear-gradient(90deg, #241c17 0%, #29211bd9 31%, transparent 75%);
}
.doors {
  display: grid;
  border: 1px solid var(--lamp-line);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  overflow: hidden;
}
.doors a,
.features a {
  display: block;
  color: var(--lamp-text);
  text-decoration: none;
}
.doors a {
  padding: var(--space-3) var(--space-4);
  background: var(--lamp-surface);
}
.doors a + a {
  border-top: 1px solid var(--lamp-line);
}
.doors strong {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font: 700 var(--text-xl)/1.2 var(--font-display);
}
.doors strong span {
  color: var(--lamp-gold);
  font: 500 var(--text-lg) var(--font-ui);
}
small {
  font: 500 var(--text-sm)/1.4 var(--font-ui);
  color: var(--lamp-muted);
}
.features {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0 var(--space-6);
}
.features a {
  padding: var(--space-4) 0;
  border-top: 1px solid var(--lamp-line-soft);
}
.features h3 {
  font: 700 var(--text-xl)/1.15 var(--font-display);
  margin: var(--space-2) 0;
}
.features small {
  color: var(--lamp-gold);
}
.features p {
  color: var(--lamp-muted);
  margin: 0;
}
.doors a:hover strong,
.features a:hover h3 {
  color: var(--lamp-gold-light);
  text-decoration: underline;
}
.doors a:focus-visible {
  outline: 2px solid var(--lamp-gold-light);
  outline-offset: -4px;
}
.addon-note {
  margin-top: var(--space-7);
  color: var(--lamp-muted);
}
@media (min-width: 640px) {
  .doors {
    grid-template-columns: repeat(3, 1fr);
  }
  .doors a {
    padding: var(--space-5);
  }
  .doors a + a {
    border-top: 0;
    border-left: 1px solid var(--lamp-line);
  }
  .features {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
