import { publicCatalog } from "../../../../utils/public-catalog";
import { isGame } from "#shared/public-professions";
export default defineEventHandler(async (event) => {
  const game = getRouterParam(event, "game");
  if (!isGame(game)) throw createError({ statusCode: 404 });
  const professions = await publicCatalog(game);
  if (!professions.length)
    throw createError({ statusCode: 404, message: "No profession catalog yet." });
  return professions.map(({ album, ...p }) => ({ ...p, total: album.length }));
});
