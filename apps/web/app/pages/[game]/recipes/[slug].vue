<script setup lang="ts">
import {
  gameName,
  isGame,
  professionHref,
  professionTrail,
  recipeHref,
  type PublicRecipe,
  type PublicProfession,
  type SingleRecipeOverlay,
} from "#shared/public-professions";
import { useProfessionOverlay } from "../../../composables/useProfessionOverlay";
const route = useRoute();
const game = String(route.params.game);
if (!isGame(game)) throw createError({ statusCode: 404 });
const slug = String(route.params.slug);
const { data, error } = await useFetch<{
  profession: Omit<PublicProfession, "album">;
  recipe: PublicRecipe;
}>(`/api/game/${game}/recipes/${encodeURIComponent(slug)}`);
if (error.value || !data.value)
  throw createError({ statusCode: error.value?.statusCode || 503, message: "Recipe not found." });
const {
  data: overlay,
  status,
  otherGame,
  refresh,
} = useProfessionOverlay<SingleRecipeOverlay>(
  "recipes",
  () => game,
  () => slug,
);
const title = `${data.value.recipe.name} · ${gameName(game)}`;
const description = `${data.value.recipe.name}: ${data.value.profession.name} recipe in ${gameName(game)}. See required skill, formula, reagents, skill-up thresholds and observed sources.`;
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
defineOgImage("Unbored", { title, description, game });
useHead({ link: [{ rel: "canonical", href: `${useSiteConfig().url}${recipeHref(game, slug)}` }] });
</script>
<template>
  <DsPage v-if="data">
    <DsBreadcrumbs
      :trail="[
        ...professionTrail(game, data.profession),
        { label: data.recipe.name!, to: recipeHref(game, slug) },
      ]"
    />
    <DsPageHeader
      :title="data.recipe.name!"
      :eyebrow="`${gameName(game)} · ${data.profession.name} · ${data.recipe.category.name}`"
    />
    <OverlayStatus :game="game" :other-game="otherGame" :status="status" @retry="refresh" />
    <RecipeDetail :recipe="data.recipe" :overlay="overlay" :game="game" inline />
    <DsButton :to="professionHref(game, data.profession.slug)" variant="secondary"
      >All {{ data.profession.name }} recipes</DsButton
    >
  </DsPage>
</template>
