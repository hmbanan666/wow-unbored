<script setup lang="ts">
import { questTrail, type PublicQuest, type PublicQuestChain } from "#shared/quests";
if (useRoute().params.game !== "forever") throw createError({ statusCode: 404 });
const { data, error } = await useFetch<{ quests: PublicQuest[]; chains: PublicQuestChain[] }>(
  "/api/game/forever/quests",
);
if (error.value || !data.value)
  throw createError({
    statusCode: error.value?.statusCode || 503,
    message: "Quest observations are resting. Try again soon.",
  });
const title = "Quests in WoW Forever";
const description =
  "Explore quests by zone, observed quest givers and turn-in places, and verified quest chains in WoW Forever.";
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}/forever/quests` }] });
</script>
<template>
  <DsPage v-if="data"
    ><DsBreadcrumbs :trail="questTrail" /><QuestIndex :quests="data.quests" :chains="data.chains"
  /></DsPage>
</template>
