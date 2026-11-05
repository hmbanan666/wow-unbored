<script setup lang="ts">
import type { PageMedia } from "@unbored/contracts/game-media";
import type { CatalogItem } from "#shared/catalog";
/** One pick of a Collection: rank, name, chips, why it is worth it, how to get it, source. */
defineProps<{
  item?: CatalogItem;
  media?: PageMedia[string];
  rank: number;
  name: string;
  chips: { label: string; tone?: "neutral" | "gold" | "chance" }[];
  note?: string;
  how: string[];
  source?: string;
}>();
</script>

<template>
  <article class="ds-item">
    <DsGameArt
      v-if="media?.render && (item?.kind === 'mount' || item?.kind === 'pet')"
      class="ds-item__render"
      :media="media.render"
      :alt="media.render.alt"
      render
      desktop-only
      :max-width="320"
      sizes="160px"
    />
    <header class="ds-item__head">
      <span class="ds-item__rank" aria-hidden="true">{{ rank }}</span>
      <DsHeading :level="3" tag="h2">
        <DsTooltip v-if="item">
          <DsGameIcon class="ds-item__icon" :kind="item.kind" :media="media?.icon" size="md" />
          <span>{{ name }}</span>
          <template #panel="{ open }"
            ><DsGameTooltip :name="name" :kind="item.kind" :media="media" :item="item" :open="open"
          /></template>
        </DsTooltip>
        <template v-else>{{ name }}</template>
      </DsHeading>
    </header>
    <DsChipRow>
      <DsChip v-for="chip in chips" :key="chip.label" :tone="chip.tone">{{ chip.label }}</DsChip>
    </DsChipRow>
    <slot />
    <p v-if="note" class="ds-item__note">{{ note }}</p>
    <div v-if="how.length" class="ds-item__how">
      <span class="ds-item__how-label">How to get it</span>
      <ul>
        <li v-for="line in how" :key="line">{{ line }}</li>
      </ul>
    </div>
    <a v-if="source" class="ds-item__source" :href="source" rel="nofollow noopener" target="_blank"
      >Check the source <span aria-hidden="true">↗</span></a
    >
  </article>
</template>

<style scoped>
.ds-item {
  position: relative;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-lg);
  background: var(--lamp-surface);
  box-shadow: var(--shadow-card);
}

@media (min-width: 640px) {
  .ds-item {
    padding: var(--space-5) var(--space-5) var(--space-4);
  }
}

.ds-item__render {
  display: none;
}
@media (min-width: 768px) {
  .ds-item:has(.ds-item__render) {
    padding-right: calc(160px + var(--space-6));
  }
  .ds-item__render {
    display: block;
    position: absolute;
    right: var(--space-4);
    top: var(--space-5);
    width: 160px;
    height: 120px;
  }
  .ds-item__icon {
    --game-icon-size: 56px;
  }
}
.ds-item__head > :deep(.ds-heading) {
  min-width: 0;
}
.ds-item__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ds-item__rank {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-pill);
  color: var(--lamp-gold);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 700;
}

.ds-item__note {
  color: var(--lamp-text);
}

.ds-item__how {
  padding: var(--space-3) var(--space-4);
  border-left: 2px solid var(--lamp-gold);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: rgb(20 13 10 / 0.45);
}

.ds-item__how-label {
  color: var(--lamp-gold-light);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ds-item__how ul {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}

.ds-item__how li + li {
  margin-top: var(--space-1);
}

.ds-item__source {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  justify-self: start;
  min-height: var(--tap);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 500;
}
</style>
