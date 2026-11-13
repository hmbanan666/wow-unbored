import { db } from "../../../../../utils/db";
import { readPublicQuestChains } from "../../../../../utils/quests";
export default defineEventHandler(async (event) => {
  if (getRouterParam(event, "game") !== "forever") throw createError({ statusCode: 404 });
  const sql = db();
  if (!sql) throw createError({ statusCode: 503 });
  const chain = (await readPublicQuestChains(sql)).find(
    (c) => c.slug === getRouterParam(event, "slug"),
  );
  if (!chain) throw createError({ statusCode: 404, message: "Chain not found." });
  return chain;
});
