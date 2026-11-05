import { pageMediaRefs, type PageMedia, type MediaAsset } from "@unbored/contracts/game-media";
import type { Game } from "@unbored/contracts/guide";
import type { Sql } from "./db.ts";

type Row = MediaAsset & {
  ref_kind: string;
  ref_id: number;
  role: "icon" | "render" | "tile" | "image";
  source: "blizzard" | "own";
  hash: string;
};

/** All item, inline, hero and figure assets in one query, including own images. */
export async function readPageMedia(
  sql: Sql,
  page: Parameters<typeof pageMediaRefs>[0] & { game?: Game },
): Promise<PageMedia> {
  const { refs, images } = pageMediaRefs(page);
  const gameRefs = page.game === "forever" ? [] : refs.map((ref) => `${ref.kind}:${ref.id}`);
  if (!gameRefs.length && !images.length) return {};
  const rows = await sql<Row[]>`
    SELECT ref_kind, ref_id, role, source, hash, width, height, variants, alt, name
    FROM content.media
    WHERE (source = 'blizzard' AND (ref_kind || ':' || ref_id::text) = ANY(${gameRefs}::text[]))
       OR (source = 'own' AND hash = ANY(${images}::text[]))`;
  const out: PageMedia = {};
  for (const row of rows) {
    const key = row.source === "own" ? `image:${row.hash}` : `${row.ref_kind}:${row.ref_id}`;
    (out[key] ??= {})[row.role] = {
      variants: row.variants,
      width: row.width,
      height: row.height,
      alt: row.alt,
      name: row.name,
    };
  }
  return out;
}
