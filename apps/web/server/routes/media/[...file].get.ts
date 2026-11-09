import { serveMedia } from "../../utils/media-file.ts";

export default defineEventHandler((event) =>
  serveMedia(
    getRouterParam(event, "file") ?? "",
    process.env.UNBORED_MEDIA_DIR || useRuntimeConfig(event).mediaDir,
    getQuery(event).format === "png" ? "png" : undefined,
  ),
);
