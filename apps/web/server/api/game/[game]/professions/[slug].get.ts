import { publicCatalog } from "../../../../utils/public-catalog";
import { professionGuides } from "../../../../utils/profession-guides";
import { isGame, professionHref } from "#shared/public-professions";
export default defineEventHandler(async (event) => {
  const game = getRouterParam(event, "game");
  if (!isGame(game)) throw createError({ statusCode: 404 });
  const profession = (await publicCatalog(game)).find(
    (p) => p.slug === getRouterParam(event, "slug"),
  );
  if (!profession) throw createError({ statusCode: 404, message: "Profession not found." });
  const { byPage } = await professionGuides(game);
  return {
    ...profession,
    guides: (byPage[professionHref(game, profession.slug)] ?? []).slice(0, 2),
  };
});
