import { professionHref, recipeHref, type Game } from "#shared/public-professions";
import {
  guideLines,
  referencePattern,
  type GuideLink,
  type References,
} from "#shared/guide-references";
import { cleanBlocks } from "#shared/blocks";
import { publicCatalog } from "./public-catalog";
import { db } from "./db";

export const professionGuides = defineCachedFunction(
  async (game: Game) => {
    const sql = db();
    const byGuide: Record<string, References> = {};
    const byPage: Record<string, GuideLink[]> = {};
    if (!sql || game !== "forever") return { byGuide, byPage };
    const [professions, guides] = await Promise.all([
      publicCatalog(game),
      sql<{ slug: string; title: string; blocks: unknown }[]>`
      SELECT slug, title, body->'blocks' AS blocks FROM content.paths
      WHERE kind = 'guide' AND locale = 'en' AND game = ${game} AND status = 'published' ORDER BY slug`,
    ]);
    const names = new Map<string, string | null>();
    function register(name: string | null, href: string) {
      if (name) names.set(name, names.has(name) && names.get(name) !== href ? null : href);
    }
    for (const p of professions) {
      const href = professionHref(game, p.slug);
      for (const r of p.album) {
        register(r.name, recipeHref(game, r.slug));
        for (const s of r.sources)
          register(s.npcName, href + "?f=" + encodeURIComponent("npc:" + s.npcName));
      }
    }
    for (const p of professions) names.set(p.name, professionHref(game, p.slug));
    const pattern = referencePattern([...names.keys()].filter((name) => names.get(name)));
    for (const guide of guides) {
      const refs: References = {};
      if (pattern) {
        for (const line of cleanBlocks(guide.blocks).flatMap(guideLines)) {
          const plain = line.replace(/\{\{term:[^|]+\|([^}]+)\}\}/g, "$1");
          for (const [name] of plain.matchAll(pattern)) refs[name] = names.get(name)!;
        }
      }
      byGuide[guide.slug] = refs;
      for (const path of new Set(Object.values(refs))) {
        (byPage[path] ??= []).push({ title: guide.title, href: `/guides/${guide.slug}` });
      }
    }
    // Start every profession with its specialist guide or the published profession-pairing guide.
    for (const p of professions) {
      const href = professionHref(game, p.slug);
      const specialist = guides.find((g) => g.slug === `wow-forever-${p.slug}-guide`);
      const pairing = guides.find((g) => g.slug === "wow-forever-best-professions-for-each-class");
      const primary = specialist ?? pairing;
      if (primary) {
        const link = { title: primary.title, href: "/guides/" + primary.slug };
        const next = (byPage[href] ?? []).find(
          (g) =>
            g.href === "/guides/wow-forever-camping-guide" ||
            g.href === "/guides/how-to-make-gold-early-in-wow-forever",
        );
        byPage[href] = next ? [link, next] : [link];
      }
    }
    return { byPage, byGuide };
  },
  { name: "profession-guide-links", maxAge: 300, swr: false, getKey: (game: Game) => game },
);
