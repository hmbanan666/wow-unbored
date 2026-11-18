<script setup lang="ts">
import {
  gameName,
  isGame,
  professionHref,
  professionTrail,
  type PublicProfession,
  type ProfessionOverlay,
} from "#shared/public-professions";
import type { GuideLink } from "#shared/guide-references";
import { albumFilter } from "#shared/profession-album";
import { useProfessionOverlay } from "../../../composables/useProfessionOverlay";
const route = useRoute();
const router = useRouter();
const game = String(route.params.game);
if (!isGame(game)) throw createError({ statusCode: 404 });
const slug = String(route.params.slug);
const { data: base, error } = await useFetch<PublicProfession & { guides: GuideLink[] }>(
  `/api/game/${game}/professions/${encodeURIComponent(slug)}`,
);
if (error.value || !base.value)
  throw createError({
    statusCode: error.value?.statusCode || 503,
    message: "Profession not found.",
  });
const {
  data: overlay,
  status,
  otherGame,
  refresh,
} = useProfessionOverlay<ProfessionOverlay>(
  "professions",
  () => game,
  () => slug,
);
const filter = computed(() => {
  const value = albumFilter(route.query.f);
  return !overlay.value && ["missing", "now"].includes(value) ? "all" : value;
});
function selectFilter(value: string) {
  const query = { ...route.query };
  if (value === "all") delete query.f;
  else query.f = value;
  return router.push({ query });
}
const title = `${base.value.name} recipes · ${gameName(game)}`;
const description = `Find ${base.value.name} recipes in ${gameName(game)} by name, skill or recipe type. Check materials and see where players have found a trainer or vendor.`;
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
defineOgImage("Unbored", { title, description, game });
useHead({
  link: [{ rel: "canonical", href: `${useSiteConfig().url}${professionHref(game, slug)}` }],
});
</script>
<template>
  <DsPage v-if="base" width="wide">
    <DsBreadcrumbs :trail="professionTrail(game, base)" />
    <CraftHeader :title="base.name + ' recipes'" :eyebrow="gameName(game)" />
    <ProfessionGuideLinks :guides="base.guides" />
    <ProfessionAlbum
      :base="base"
      :overlay="overlay"
      :game="game"
      :filter="filter"
      @filter="selectFilter"
    />
    <OverlayStatus :game="game" :other-game="otherGame" :status="status" @retry="refresh" />
    <TodayGoals
      v-if="overlay"
      :set="overlay.today ?? undefined"
      :name="base.name"
      :unavailable="overlay.todayUnavailable"
      @retry="refresh"
    />
  </DsPage>
</template>
