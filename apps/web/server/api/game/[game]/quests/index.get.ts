import { db } from "../../../../utils/db";
import { readPublicQuests, readPublicQuestChains } from "../../../../utils/quests";
export default defineEventHandler(async (event) => {
  if (getRouterParam(event, "game") !== "forever") throw createError({ statusCode: 404 });
  const sql = db();
  if (!sql)
    throw createError({
      statusCode: 503,
      message: "Quest observations are resting. Try again soon.",
    });
  const [quests, chains] = await Promise.all([readPublicQuests(sql), readPublicQuestChains(sql)]);
  return { quests, chains };
});
