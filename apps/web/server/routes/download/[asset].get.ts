import { downloads } from "../../utils/downloads";

export default defineEventHandler((event) =>
  downloads.respond(getRouterParam(event, "asset") || "", getHeader(event, "referer")),
);
