import { isCatalogKind, PUBLIC_COPY } from "#shared/catalog";
import { listPublished } from "../../utils/content.ts";
import { db } from "../../utils/db.ts";

/** Published Paths and Collections, optionally of one kind (?kind=collection). */
export default defineEventHandler(async (event) => {
  const kind = getQuery(event).kind;
  const sql = db();
  if (!sql) {
    setResponseStatus(event, 503);
    return { error: "unavailable" as const, message: PUBLIC_COPY.unavailable };
  }
  return { pages: await listPublished(sql, isCatalogKind(kind) ? kind : undefined) };
});
