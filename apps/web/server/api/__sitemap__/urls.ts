import { listPublished } from "../../utils/content.ts";
import { db } from "../../utils/db.ts";

export default defineSitemapEventHandler(async () => {
  const sql = db();
  if (!sql) return [];
  const pages = await listPublished(sql);
  return pages.map((page) => ({ loc: page.loc }));
});
