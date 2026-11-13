import { publicCatalog } from "../../../../utils/public-catalog";
import { isGame } from "#shared/public-professions";
export default defineEventHandler(async (event) => {
  const game = getRouterParam(event, "game");
  if (!isGame(game)) throw createError({ statusCode: 404 });
  const profession = (await publicCatalog(game)).find(
    (p) => p.slug === getRouterParam(event, "slug"),
  );
  if (!profession) throw createError({ statusCode: 404, message: "Profession not found." });
  return profession;
});
