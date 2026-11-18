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
import { recipeCopy } from "#shared/recipe-editorial";
import type { GuideLink } from "#shared/guide-references";
import { useProfessionOverlay } from "../../../composables/useProfessionOverlay";
const route = useRoute();
const game = String(route.params.game);
if (!isGame(game)) throw createError({ statusCode: 404 });
const slug = String(route.params.slug);
const { data, error } = await useFetch<{
  profession: Omit<PublicProfession, "album">;
  recipe: PublicRecipe;
  related: { name: string; slug: string; skill: number | null }[];
  guides: GuideLink[];
}>(`/api/game/${game}/recipes/${encodeURIComponent(slug)}`);
if (error.value || !data.value)
  throw createError({ statusCode: error.value?.statusCode || 503, message: "Recipe not found." });
const {
  data: overlay,
  status,
  otherGame,
  signedIn,
  refresh,
} = useProfessionOverlay<SingleRecipeOverlay>(
  "recipes",
  () => game,
  () => slug,
);
const fact = computed(() => {
  const check = overlay.value;
  if (!check) return;
  const name = check.character.name;
  if (check.known === true) return `${name} knows this recipe.`;
  if (check.known === null) return `${name} hasn’t checked this recipe yet.`;
  const required = check.difficulty.requiredSkill;
  const gap = required !== null && check.skill !== null && check.skill < required;
  return gap
    ? `${name} hasn’t learned this. Needs ${data.value!.profession.name} ${required}, has ${check.skill}.`
    : `${name} hasn’t learned this recipe yet.`;
});
const action = computed(() => {
  const { related, guides, profession } = data.value!;
  const next = related.at(-1);
  return (
    (guides[0] && { title: "Read the guide", href: guides[0].href }) ??
    (next
      ? { title: next.name, href: recipeHref(game, next.slug) }
      : { title: `Browse ${profession.name} recipes`, href: professionHref(game, profession.slug) })
  );
});
const { title, description, lead } = recipeCopy(
  data.value.recipe,
  data.value.profession.name,
  game,
);
useSeoMeta({ title, description, ogTitle: title, ogDescription: description });
defineOgImage("Unbored", { title, description, game });
useHead({
  titleTemplate: "%s",
  link: [{ rel: "canonical", href: `${useSiteConfig().url}${recipeHref(game, slug)}` }],
});
</script>
<template>
  <DsPage v-if="data">
    <DsBreadcrumbs
      :trail="[
        ...professionTrail(game, data.profession),
        { label: data.recipe.name!, to: recipeHref(game, slug) },
      ]"
    />
    <CraftHeader
      :title="data.recipe.name + ' recipe'"
      :lead="lead"
      :eyebrow="`${gameName(game)} · ${data.profession.name} · ${data.recipe.category.name}`"
    />
    <CharacterCheck
      :game="game"
      :signed-in="signedIn"
      :other-game="otherGame"
      :status="status"
      :fact="fact"
      :action="action"
      @retry="refresh"
    />
    <RecipeDetail :recipe="data.recipe" :game="game" />
    <ProfessionGuideLinks :guides="data.guides" />
    <DsSection v-if="data.related.length" title="Nearby recipes by skill">
      <DsActions
        ><DsButton
          v-for="r in data.related"
          :key="r.slug"
          variant="secondary"
          :to="recipeHref(game, r.slug)"
          >{{ r.name }}<template v-if="r.skill !== null"> · Skill {{ r.skill }}</template></DsButton
        ></DsActions
      >
    </DsSection>
    <DsButton :to="professionHref(game, data.profession.slug)" variant="secondary"
      >All {{ data.profession.name }} recipes</DsButton
    >
  </DsPage>
</template>
