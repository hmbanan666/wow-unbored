<script setup lang="ts">
import type { Block } from "#shared/blocks";

defineProps<{ blocks: Block[] }>();

function external(href: string): boolean {
  return href.startsWith("https:");
}
</script>

<template>
  <div>
    <template v-for="(block, index) in blocks" :key="index">
      <h2 v-if="block.type === 'heading'" class="entry-heading">{{ block.text }}</h2>
      <p v-else-if="block.type === 'paragraph'">{{ block.text }}</p>
      <ul v-else-if="block.type === 'list'">
        <li v-for="item in block.items" :key="item">{{ item }}</li>
      </ul>
      <div v-else class="actions">
        <UButton
          :to="block.href"
          :target="external(block.href) ? '_blank' : undefined"
          :rel="external(block.href) ? 'noopener noreferrer' : undefined"
          class="gold-button"
          color="primary"
          size="lg"
        >
          {{ block.label }}
        </UButton>
      </div>
    </template>
  </div>
</template>
