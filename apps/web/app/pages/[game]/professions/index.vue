<script setup lang="ts">
import {
  gameName,
  isGame,
  professionHref,
  professionTrail,
  type PublicProfession,
} from "#shared/public-professions";
const route = useRoute();
const game = String(route.params.game);
if (!isGame(game)) throw createError({ statusCode: 404 });
const { data, error } = await useFetch<(Omit<PublicProfession, "album"> & { total: number })[]>(
  `/api/game/${game}/professions`,
);
if (error.value || !data.value)
  throw createError({
    statusCode: error.value?.statusCode || 503,
    message: "Profession catalog unavailable.",
  });
const title = `${gameName(game)} professions`;
const description = `Browse ${gameName(game)} profession recipes, formula facts, reagents and observed sources. Look up a craft by name and see which materials to bring.`;
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
defineOgImage("Unbored", { title, description, game });
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}/${game}/professions` }] });
</script>
<template>
  <DsPage width="wide">
    <DsBreadcrumbs :trail="professionTrail(game)" />
    <DsPageHeader
      :title="title"
      lead="Choose a profession to find a recipe, check its materials or look for a trainer."
    />
    <DsCardGrid
      ><DsCard v-for="p in data" :key="p.slug" :title="p.name">
        <p>{{ p.total }} named recipes</p>
        <DsButton :to="professionHref(game, p.slug)">Open {{ p.name }}</DsButton>
      </DsCard></DsCardGrid
    >
  </DsPage>
</template>
