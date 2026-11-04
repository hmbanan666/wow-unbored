<script setup lang="ts">
import type { PublicPage } from "#shared/catalog";
import { PUBLIC_COPY, TIER_LABEL } from "#shared/catalog";

const props = defineProps<{
  page: PublicPage | null;
  message?: string;
}>();

const tier = computed(() => (props.page?.tier ? TIER_LABEL[props.page.tier] : ""));

useSeoMeta({
  title: () => props.page?.title || "Unbored",
  description: () => props.page?.description || "",
});

defineOgImage("Unbored", {
  title: props.page?.headline || "Unbored",
  description: props.page?.description || "Bory gives you one step at a time.",
});
</script>

<template>
  <main class="page">
    <div class="portrait" aria-hidden="true">
      <img class="bory" src="/bory.png" alt="" />
      <img src="/bory-frame.png" alt="" />
    </div>
    <p v-if="!page">{{ message || PUBLIC_COPY.unavailable }}</p>
    <template v-else>
      <h1>{{ page.headline }}</h1>
      <p v-if="tier" class="tier">{{ tier }}</p>
      <p v-if="page.kind !== 'page'" class="lead">{{ page.description }}</p>
      <EntryBody :blocks="page.blocks" />
    </template>
  </main>
</template>
