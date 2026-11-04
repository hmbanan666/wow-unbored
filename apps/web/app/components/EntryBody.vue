<script setup lang="ts">
import type { Block } from "#shared/blocks";

const props = defineProps<{ blocks: Block[] }>();

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
      <h2 v-else-if="part.block.type === 'heading'">{{ part.block.text }}</h2>
      <p v-else-if="part.block.type === 'paragraph'">{{ part.block.text }}</p>
      <ul v-else-if="part.block.type === 'list'">
        <li v-for="item in part.block.items" :key="item">{{ item }}</li>
      </ul>
    </template>
  </DsProse>
</template>
