<script setup lang="ts">
import { feedHref, type FeedPage } from "#shared/character-feed";
const route = useRoute();
if (route.params.game !== "forever") throw createError({ statusCode: 404 });
const href = computed(() => feedHref(String(route.params.realm), String(route.params.name)));
const { data, error, refresh } = await useFetch<FeedPage>("/api/feed/character", {
  query: computed(() => ({
    realm: route.params.realm,
    name: route.params.name,
    cursor: route.query.cursor,
  })),
});
if (error.value || !data.value)
  throw createError({
    statusCode: error.value?.statusCode || 503,
    message: "The character feed is resting. Try again soon.",
  });
useSeoMeta({
  title: () =>
    data.value?.shared
      ? `${data.value.name}’s WoW Forever story`
      : "This character has not shared a feed",
  description:
    "Recorded milestones and player screenshots from WoW Forever. Sharing is always the player’s choice.",
});
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}${href.value}` }] });
</script>
<template>
  <DsPage
    ><FeedControls :href="href" @changed="refresh()" /><PlayerFeed
      v-if="data"
      :feed="data"
      :base="href"
  /></DsPage>
</template>
