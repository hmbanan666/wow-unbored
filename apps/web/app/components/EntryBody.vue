<script setup lang="ts">
import { termParts, type GuideTerm } from "@unbored/contracts/guide";
import { gameText } from "#shared/game-media";
import type { PageMedia } from "@unbored/contracts/game-media";
import type { CatalogItem } from "#shared/catalog";
import type { Block } from "#shared/blocks";

const props = defineProps<{
  blocks: Block[];
  media?: PageMedia;
  items?: CatalogItem[];
  terms?: GuideTerm[];
}>();

function pieces(text: string) {
  return termParts(text, props.terms ?? [], false).flatMap((part) =>
    part.term ? [part] : gameText(part.text, props.media, props.items),
  );
}

type LinkBlock = Extract<Block, { type: "link" }>;
type Part =
  | { type: "text"; block: Exclude<Block, LinkBlock> }
  | { type: "links"; links: LinkBlock[] };

/** Consecutive link blocks share one row of buttons; the first is the primary one. */
const parts = computed(() => {
  const out: Part[] = [];
  for (const block of props.blocks) {
    const last = out.at(-1);
    if (block.type === "link") {
      if (last?.type === "links") last.links.push(block);
      else out.push({ type: "links", links: [block] });
    } else out.push({ type: "text", block });
  }
  return out;
});
</script>

<template>
  <DsProse>
    <template v-for="(part, index) in parts" :key="index">
      <DsActions v-if="part.type === 'links'">
        <DsButton
          v-for="(link, n) in part.links"
          :key="link.href"
          :to="link.href"
          :variant="n === 0 ? 'primary' : 'secondary'"
          >{{ link.label }}</DsButton
        >
      </DsActions>
      <DsCard
        v-else-if="part.block.type === 'callout'"
        :title="part.block.tone === 'forecast' ? 'Early forecast' : 'Note'"
        :text="part.block.text"
      />
      <DsGameFigure v-else-if="part.block.type === 'figure'" :figure="part.block" :media="media" />
      <h2 v-else-if="part.block.type === 'heading'">{{ part.block.text }}</h2>
      <p v-else-if="part.block.type === 'paragraph'">
        <DsGameRef
          v-for="(piece, n) in pieces(part.block.text)"
          :key="n"
          :part="piece"
          :media="media"
        />
      </p>
      <ul v-else-if="part.block.type === 'list'">
        <li v-for="item in part.block.items" :key="item">
          <DsGameRef v-for="(piece, n) in pieces(item)" :key="n" :part="piece" :media="media" />
        </li>
      </ul>
    </template>
    <section v-if="terms?.length" aria-label="Game terms" class="guide-terms">
      <h2>Game terms in this guide</h2>
      <dl>
        <template v-for="term in terms" :key="term.key">
          <dt :id="`guide-term-${term.key}`" tabindex="-1">{{ term.name }}</dt>
          <dd>
            {{ term.text }}
            <a :href="term.source" target="_blank" rel="nofollow noopener noreferrer"
              >Source for {{ term.name }}</a
            >
          </dd>
        </template>
      </dl>
    </section>
  </DsProse>
</template>

<style scoped>
.guide-terms {
  margin-top: var(--space-7);
  border-top: 1px solid var(--lamp-line);
  padding-top: var(--space-5);
}
dt {
  color: var(--lamp-gold);
  font-weight: 700;
  scroll-margin-top: var(--space-5);
}
dd {
  margin: var(--space-1) 0 var(--space-4);
}
</style>
