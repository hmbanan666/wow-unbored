import { publicCatalog } from "../../../../utils/public-catalog";
import { professionGuides } from "../../../../utils/profession-guides";
import { byRecipeSkill } from "#shared/recipe-editorial";
import { isGame, recipeHref, professionHref } from "#shared/public-professions";
export default defineEventHandler(async (event) => {
  const game = getRouterParam(event, "game");
  if (!isGame(game)) throw createError({ statusCode: 404 });
  for (const { album, ...profession } of await publicCatalog(game)) {
    const recipe = album.find((r) => r.slug === getRouterParam(event, "slug"));
    if (recipe) {
      const ordered = [...album].sort(byRecipeSkill);
      const index = ordered.indexOf(recipe);
      const related = [ordered[index - 1], ordered[index + 1]].flatMap((r) =>
        r ? [{ name: r.name!, slug: r.slug, skill: r.difficulty.requiredSkill }] : [],
      );
      const { byPage } = await professionGuides(game);
      const professionLinks = byPage[professionHref(game, profession.slug)] ?? [];
      const exact = byPage[recipeHref(game, recipe.slug)] ?? [];
      const trainer = recipe.sources.flatMap(
        (s) =>
          byPage[
            professionHref(game, profession.slug) + "?f=" + encodeURIComponent("npc:" + s.npcName)
          ] ?? [],
      );
      const guides = [
        ...new Map(
          [...exact, ...trainer, ...professionLinks].map((link) => [link.href, link]),
        ).values(),
      ].slice(0, 2);
      return { profession, recipe, related, guides };
    }
  }
  throw createError({ statusCode: 404, message: "Recipe not found." });
});
