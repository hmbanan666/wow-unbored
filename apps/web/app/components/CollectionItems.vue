<script setup lang="ts">
import type { PageMedia } from "@unbored/contracts/game-media";
import { ITEM_KIND_LABEL, SOURCE_LABEL, type CatalogItem } from "#shared/catalog";

import { PATH_COPY, type PathProgress } from "#shared/personal-paths";

defineProps<{
  items: CatalogItem[];
  media?: PageMedia;
  progress?: PathProgress;
  copy?: typeof PATH_COPY;
}>();

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
        :item="item"
        :media="media?.[`${item.kind}:${item.id}`]"
        :rank="index + 1"
        :name="item.name"
        :chips="chips(item)"
        :note="item.note"
        :how="item.source.lines"
        :source="item.url"
      >
        <DsChipRow v-if="progress && copy">
          <DsChip :tone="progress.goals[index]?.done ? 'gold' : 'neutral'">{{
            progress.goals[index]?.done ? copy.done : copy.notDone
          }}</DsChip>
          <DsChip v-if="progress.goals[index]?.required === false">{{ copy.optional }}</DsChip>
        </DsChipRow>
      </DsItemCard>
    </li>
  </DsItemList>
</template>
