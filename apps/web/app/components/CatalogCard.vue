<script setup lang="ts">
import { CATALOG_SECTION, TIER_LABEL, type CatalogSummary } from "#shared/catalog";

const props = defineProps<{ page: CatalogSummary }>();
const eyebrow = computed(() => {
  const parts: string[] = [CATALOG_SECTION[props.page.kind].one];
  if (props.page.tier) parts.push(TIER_LABEL[props.page.tier]);
  if (props.page.count && props.page.kind !== "guide") {
    parts.push(`${props.page.count} ${props.page.kind === "collection" ? "picks" : "goals"}`);
  }
  return parts.join(" · ");
});
</script>

<template>
  <DsCard :to="page.href" :eyebrow="eyebrow" :title="page.title" :text="page.description" />
</template>
