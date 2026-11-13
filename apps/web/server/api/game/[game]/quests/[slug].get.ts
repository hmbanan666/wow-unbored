import { db } from "../../../../utils/db";
import { readPublicQuests } from "../../../../utils/quests";
export default defineEventHandler(async (event) => {
  if (getRouterParam(event, "game") !== "forever") throw createError({ statusCode: 404 });
  const sql = db();
  if (!sql) throw createError({ statusCode: 503 });
  const quest = (await readPublicQuests(sql, getRouterParam(event, "slug"))).find(
    (q) => q.slug === getRouterParam(event, "slug"),
  );
  if (!quest) throw createError({ statusCode: 404, message: "Quest not found." });
  return quest;
});
