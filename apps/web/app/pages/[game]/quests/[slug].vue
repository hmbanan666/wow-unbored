<script setup lang="ts">
import {
  questHref,
  questTitle,
  questTrail,
  type PublicQuest,
  type QuestOverlay,
} from "#shared/quests";
import { useProfessionOverlay } from "../../../composables/useProfessionOverlay";
const route = useRoute();
if (route.params.game !== "forever") throw createError({ statusCode: 404 });
const slug = String(route.params.slug);
const { data, error } = await useFetch<PublicQuest>(
  `/api/game/forever/quests/${encodeURIComponent(slug)}`,
);
if (error.value || !data.value)
  throw createError({ statusCode: error.value?.statusCode || 503, message: "Quest not found." });
const {
  data: overlay,
  status,
  otherGame,
  refresh,
} = useProfessionOverlay<QuestOverlay>(
  "quests",
  () => "forever",
  () => slug,
);
const title = `${questTitle(data.value)} · WoW Forever`;
const description = `${questTitle(data.value)} in WoW Forever: observed quest givers, turn-in places, zones and coordinates.`;
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}${questHref(slug)}` }] });
</script>
<template>
  <DsPage v-if="data">
    <DsBreadcrumbs :trail="[...questTrail, { label: questTitle(data), to: questHref(slug) }]" />
    <OverlayStatus
      game="forever"
      subject="quests"
      :other-game="otherGame"
      :status="status"
      @retry="refresh"
    />
    <QuestDetail :quest="data" :overlay="overlay" />
    <DsButton to="/forever/quests" variant="secondary">All Forever quests</DsButton>
  </DsPage>
</template>
