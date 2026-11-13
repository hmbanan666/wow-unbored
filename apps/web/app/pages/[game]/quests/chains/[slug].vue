<script setup lang="ts">
import { chainHref, questTrail, type PublicQuestChain, type QuestOverlay } from "#shared/quests";
import { useProfessionOverlay } from "../../../../composables/useProfessionOverlay";
const route = useRoute();
if (route.params.game !== "forever") throw createError({ statusCode: 404 });
const slug = String(route.params.slug);
const { data, error } = await useFetch<PublicQuestChain>(
  `/api/game/forever/quests/chains/${encodeURIComponent(slug)}`,
);
if (error.value || !data.value)
  throw createError({ statusCode: error.value?.statusCode || 503, message: "Chain not found." });
const {
  data: overlay,
  status,
  otherGame,
  refresh,
} = useProfessionOverlay<QuestOverlay>(
  "quest-chains",
  () => "forever",
  () => slug,
);
const title = `${data.value.title} · WoW Forever quest chain`;
const description = `Follow ${data.value.title} in ${data.value.zone}: ${data.value.steps.length} verified quest steps in order.`;
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}${chainHref(slug)}` }] });
</script>
<template>
  <DsPage v-if="data">
    <DsBreadcrumbs :trail="[...questTrail, { label: data.title, to: chainHref(slug) }]" />
    <OverlayStatus
      game="forever"
      subject="quests"
      :other-game="otherGame"
      :status="status"
      @retry="refresh"
    />
    <QuestChainDetail :chain="data" :overlay="overlay" />
    <DsButton to="/forever/quests" variant="secondary">All Forever quests</DsButton>
  </DsPage>
</template>
