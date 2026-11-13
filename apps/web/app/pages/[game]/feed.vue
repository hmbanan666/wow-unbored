<script setup lang="ts">
import type { FeedPage } from "#shared/character-feed";
const route = useRoute();
if (route.params.game !== "forever") throw createError({ statusCode: 404 });
const { data, error } = await useFetch<FeedPage>("/api/feed/community", {
  query: computed(() => ({ cursor: route.query.cursor })),
});
if (error.value || !data.value)
  throw createError({
    statusCode: error.value?.statusCode || 503,
    message: "The community feed is resting. Try again soon.",
  });
useSeoMeta({
  title: "WoW Forever community feed",
  description:
    "Player milestones and screenshots from WoW Forever, shared by the people who were there.",
});
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}/forever/feed` }] });
</script>
<template>
  <DsPage><PlayerFeed v-if="data" :feed="data" community base="/forever/feed" /></DsPage>
</template>
