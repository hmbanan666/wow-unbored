<script setup lang="ts">
import { ITEM_KIND_LABEL, SOURCE_LABEL, type CatalogItem } from "#shared/catalog";

defineProps<{ items: CatalogItem[] }>();
</script>

<template>
  <ol class="items">
    <li
      v-for="(item, index) in items"
      :id="`${item.kind}-${item.id}`"
      :key="`${item.kind}:${item.id}`"
      class="item"
    >
      <span class="item-rank" aria-hidden="true">{{ index + 1 }}</span>
      <div class="item-body">
        <h2>{{ item.name }}</h2>
        <p class="item-tags">
          <span>{{ ITEM_KIND_LABEL[item.kind] }}</span>
          <span>{{ SOURCE_LABEL[item.source.type] }}</span>
          <span v-if="item.chance" class="tag-chance">Chance drop</span>
          <span v-else class="tag-sure">Guaranteed</span>
        </p>
        <p>{{ item.note }}</p>
        <div class="item-how">
          <span class="item-how-label">How to get it</span>
          <ul>
            <li v-for="line in item.source.lines" :key="line">{{ line }}</li>
          </ul>
        </div>
        <a
          v-if="item.url"
          class="item-source"
          :href="item.url"
          rel="nofollow noopener"
          target="_blank"
          >Check the source</a
        >
      </div>
    </li>
  </ol>
</template>
