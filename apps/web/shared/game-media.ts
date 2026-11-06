import {
  inlineMedia,
  type Figure,
  type Hero,
  type MediaAsset,
  type PageMedia,
} from "@unbored/contracts/game-media";
import type { CatalogItem, PublicPage } from "./catalog";

import type { GuideTerm } from "@unbored/contracts/guide";

export type GameText = {
  term?: GuideTerm;
  text: string;
  kind?: string;
  media?: PageMedia[string];
  item?: CatalogItem;
};

/** Missing or old malformed references disappear; authored names remain useful without art. */
export function gameText(
  text: string,
  media: PageMedia = {},
  items: CatalogItem[] = [],
): GameText[] {
  const out: GameText[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\[\[[\s\S]*?(?:\]\]|$)|\]\]/g)) {
    if (match.index > offset) out.push({ text: text.slice(offset, match.index) });
    offset = match.index + match[0].length;
    try {
      const ref = inlineMedia(match[0])[0];
      if (!ref) continue;
      const item = items.find((item) => item.kind === ref.kind && item.id === ref.id);
      const art = media[`${ref.kind}:${ref.id}`];
      const name = item?.name || art?.icon?.name || art?.render?.name;
      if (!name) continue;
      out.push(
        art && Object.values(art).some((asset) => asset.variants.length)
          ? { text: name, kind: ref.kind, media: art, item }
          : { text: name },
      );
    } catch {
      /* Old invalid references have no player-facing representation. */
    }
  }
  if (offset < text.length) out.push({ text: text.slice(offset) });
  return out;
}

export type GameArt = { media: MediaAsset; alt: string; render: boolean };
function artFor(key: string, media: PageMedia, alt?: string): GameArt | undefined {
  const assets = media[key];
  const asset = assets?.render || assets?.tile || assets?.image || assets?.icon;
  if (!asset?.variants.length) return;
  return { media: asset, alt: alt || asset.alt, render: asset === assets?.render };
}
export function heroArt(hero: Hero | undefined, media: PageMedia = {}): GameArt | undefined {
  if (!hero) return;
  const key = "image" in hero ? `image:${hero.image}` : `${hero.kind}:${hero.id}`;
  const assets = media[key];
  if (!assets?.render && !assets?.tile && !assets?.image) return;
  return artFor(key, media, hero.alt);
}
export function figureArt(figure: Figure, media: PageMedia = {}): GameArt | undefined {
  return artFor(
    figure.ref ? `${figure.ref.kind}:${figure.ref.id}` : `image:${figure.image}`,
    media,
    figure.alt,
  );
}
export function articleImage(
  page: Pick<PublicPage, "hero" | "media" | "items">,
  origin: string,
): string | undefined {
  const asset =
    heroArt(page.hero, page.media)?.media ||
    page.items.map((item) => page.media[`${item.kind}:${item.id}`]?.icon).find(Boolean);
  const variant = asset?.variants.find((v) => v.format === "webp") || asset?.variants[0];
  return variant ? new URL(`/media/${variant.file}`, origin).href : undefined;
}
