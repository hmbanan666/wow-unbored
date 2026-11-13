import { listPublished } from "../../utils/content.ts";
import { publicCatalog } from "../../utils/public-catalog";
import { db } from "../../utils/db.ts";

/** Index pages and every published Guide, Path and Collection (docs/site-structure.md). */
export default defineSitemapEventHandler(async () => {
  const fixed = ["/forever", "/guides", "/collections", "/paths", "/install", "/about"].map(
    (loc) => ({
      loc,
    }),
  );
  const sql = db();
  if (!sql) return fixed;
  const pages = await listPublished(sql);
  return [
    ...fixed,
    ...(
      await Promise.all(
        (["forever", "retail"] as const).map(async (game) => {
          const professions = await publicCatalog(game);
          return professions.length
            ? [
                { loc: `/${game}/professions` },
                ...professions.flatMap((p) => [
                  { loc: `/${game}/professions/${p.slug}` },
                  ...p.album.map((r) => ({ loc: `/${game}/recipes/${r.slug}` })),
                ]),
              ]
            : [];
        }),
      )
    ).flat(),
    ...pages.map((page) => ({
      loc: page.href,
      ...(page.updatedAt ? { lastmod: new Date(page.updatedAt * 1000).toISOString() } : {}),
    })),
  ];
});
