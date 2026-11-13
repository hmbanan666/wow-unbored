import { publicCatalog } from "../../../../utils/public-catalog";
import { isGame } from "#shared/public-professions";
export default defineEventHandler(async (event) => {
  const game = getRouterParam(event, "game");
  if (!isGame(game)) throw createError({ statusCode: 404 });
  for (const { album, ...profession } of await publicCatalog(game)) {
    const recipe = album.find((r) => r.slug === getRouterParam(event, "slug"));
    if (recipe) return { profession, recipe };
  }
  throw createError({ statusCode: 404, message: "Recipe not found." });
});
