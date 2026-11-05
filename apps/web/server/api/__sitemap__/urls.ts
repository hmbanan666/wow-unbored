import { listPublished } from "../../utils/content.ts";
import { db } from "../../utils/db.ts";

/** Index pages and every published Guide, Path and Collection (docs/site-structure.md). */
export default defineSitemapEventHandler(async () => {
  const fixed = ["/forever", "/guides", "/collections", "/paths", "/install"].map((loc) => ({
    loc,
  }));
  const sql = db();
  if (!sql) return fixed;
  const pages = await listPublished(sql);
  return [
    ...fixed,
    ...pages.map((page) => ({
      loc: page.href,
      ...(page.updatedAt ? { lastmod: new Date(page.updatedAt * 1000).toISOString() } : {}),
    })),
  ];
});
