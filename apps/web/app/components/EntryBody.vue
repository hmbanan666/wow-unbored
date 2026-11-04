<script setup lang="ts">
import { gameText } from "#shared/game-media";
import type { PageMedia } from "@unbored/contracts/game-media";
import type { CatalogItem } from "#shared/catalog";
import type { Block } from "#shared/blocks";

const props = defineProps<{ blocks: Block[]; media?: PageMedia; items?: CatalogItem[] }>();

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
      <DsGameFigure v-else-if="part.block.type === 'figure'" :figure="part.block" :media="media" />
      <h2 v-else-if="part.block.type === 'heading'">{{ part.block.text }}</h2>
      <p v-else-if="part.block.type === 'paragraph'">
        <DsGameRef
          v-for="(piece, n) in gameText(part.block.text, media, items)"
          :key="n"
          :part="piece"
        />
      </p>
      <ul v-else-if="part.block.type === 'list'">
        <li v-for="item in part.block.items" :key="item">
          <DsGameRef v-for="(piece, n) in gameText(item, media, items)" :key="n" :part="piece" />
        </li>
      </ul>
    </template>
  </DsProse>
</template>
