import { sharedFeedPaths } from "../../utils/character-feed";
import { readPublicQuests, readPublicQuestChains } from "../../utils/quests";
import { listPublished } from "../../utils/content.ts";
import { publicCatalog } from "../../utils/public-catalog";
import { db } from "../../utils/db.ts";

/** Index pages and every published Guide, Path and Collection (docs/site-structure.md). */
export default defineSitemapEventHandler(async () => {
  const fixed = [
    "/forever",
    "/forever/quests",
    "/forever/feed",
    "/guides",
    "/collections",
    "/paths",
    "/install",
    "/about",
  ].map((loc) => ({
    loc,
  }));
  const sql = db();
  if (!sql) return fixed;
  const pages = await listPublished(sql);
  return [
    ...fixed,
    ...(await sharedFeedPaths(sql)).map((loc) => ({ loc })),
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
    ...(await readPublicQuests(sql)).map((q) => ({ loc: `/forever/quests/${q.slug}` })),
    ...(await readPublicQuestChains(sql)).map((c) => ({ loc: `/forever/quests/chains/${c.slug}` })),
    ...pages.map((page) => ({
      loc: page.href,
      ...(page.updatedAt ? { lastmod: new Date(page.updatedAt * 1000).toISOString() } : {}),
    })),
  ];
});
