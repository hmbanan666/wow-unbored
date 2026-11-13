import { servePlayerMedia } from "../../../utils/player-media";
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const sql = db();
  if (!sql) throw createError({ statusCode: 503 });
  return servePlayerMedia(
    sql,
    process.env.UNBORED_MEDIA_DIR || useRuntimeConfig(event).mediaDir,
    getRouterParam(event, "id") ?? "",
    getRouterParam(event, "file") ?? "",
  );
});
