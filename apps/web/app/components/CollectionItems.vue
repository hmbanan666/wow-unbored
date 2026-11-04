<script setup lang="ts">
import { ITEM_KIND_LABEL, SOURCE_LABEL, type CatalogItem } from "#shared/catalog";

defineProps<{ items: CatalogItem[] }>();

function chips(item: CatalogItem) {
  return [
    { label: ITEM_KIND_LABEL[item.kind] },
    { label: SOURCE_LABEL[item.source.type], tone: "gold" as const },
    item.chance
      ? { label: "Chance drop", tone: "chance" as const }
      : { label: "Guaranteed", tone: "gold" as const },
  ];
}
</script>

<template>
  <DsItemList>
    <li
      v-for="(item, index) in items"
      :id="`${item.kind}-${item.id ?? item.level}`"
      :key="`${item.kind}:${item.id ?? item.level}`"
    >
      <DsItemCard
        :rank="index + 1"
        :name="item.name"
        :chips="chips(item)"
        :note="item.note"
        :how="item.source.lines"
        :source="item.url"
      />
    </li>
  </DsItemList>
</template>
