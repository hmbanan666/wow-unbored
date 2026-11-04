import { isCatalogKind, isSlug, PUBLIC_COPY } from "#shared/catalog";
import { readPublished } from "../../../utils/content.ts";
import { db } from "../../../utils/db.ts";

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, "kind");
  const slug = getRouterParam(event, "slug");
  if (!isCatalogKind(kind) || !isSlug(slug)) {
    setResponseStatus(event, 404);
    return { error: "not_found" as const, message: PUBLIC_COPY.notFound };
  }
  const sql = db();
  if (!sql) {
    setResponseStatus(event, 503);
    return { error: "unavailable" as const, message: PUBLIC_COPY.unavailable };
  }
  const page = await readPublished(sql, kind, slug);
  if (!page) {
    setResponseStatus(event, 404);
    return { error: "not_found" as const, message: PUBLIC_COPY.notPublished };
  }
  return page;
});
