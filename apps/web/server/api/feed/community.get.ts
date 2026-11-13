import { readCommunityFeed } from "../../utils/character-feed";
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const sql = db();
  if (!sql) throw createError({ statusCode: 503, message: "The feed is resting. Try again soon." });
  const cursor = getQuery(event).cursor;
  if (cursor && (typeof cursor !== "string" || !/^(\d{1,12}):(e\d+|s[0-9a-f-]{36})$/.test(cursor)))
    throw createError({ statusCode: 400 });
  return readCommunityFeed(sql, cursor as string | undefined);
});
