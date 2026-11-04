import { PUBLIC_COPY, type PublicPage } from "#shared/catalog";
import { db } from "../utils/db.ts";
import { readHome } from "../utils/content.ts";

export default defineEventHandler(async (event) => {
  const sql = db();
  const page = sql ? await readHome(sql) : undefined;
  if (!page) {
    setResponseStatus(event, 503);
    return { error: "unavailable" as const, message: PUBLIC_COPY.unavailable };
  }
  return page satisfies PublicPage;
});
