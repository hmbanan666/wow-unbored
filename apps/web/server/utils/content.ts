import { guideSourcesSchema, guideAsOfSchema, type Game } from "@unbored/contracts/guide";
import { cleanHero, cleanMediaRef, type MediaAsset } from "@unbored/contracts/game-media";
import { readPageMedia } from "./media.ts";
import { cleanBlocks } from "#shared/blocks";
import {
  catalogHref,
  cleanItems,
  cleanTier,
  isCatalogKind,
  isSlug,
  type CatalogKind,
  type CatalogSummary,
  type PublicPage,
} from "#shared/catalog";
import type { Sql } from "./db.ts";

type PageRow = {
  title: string;
  description: string;
  headline: string;
  body: unknown;
  updated_at: number | string | null;
};

type CatalogRow = {
  game: Game;
  version: number;
  kind: string;
  slug: string;
  title: string;
  description: string;
  tier: string | null;
  body: unknown;
  published_at: number | string | null;
};

function seconds(value: number | string | null | undefined): number | null {
  const out = Number(value);
  return Number.isFinite(out) && out > 0 ? out : null;
}

function buildOf(body: unknown): string | null {
  const build = body && typeof body === "object" ? (body as { build?: unknown }).build : undefined;
  return typeof build === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(build) ? build : null;
}

function heroOf(body: unknown) {
  return cleanHero(
    body && typeof body === "object" ? (body as { hero?: unknown }).hero : undefined,
  );
}

function pageFrom(row: PageRow): PublicPage {
  return {
    game: "retail",
    media: {},
    ...(heroOf(row.body) ? { hero: heroOf(row.body) } : {}),
    kind: "page",
    slug: "home",
    title: row.title,
    description: row.description,
    headline: row.headline,
    tier: null,
    blocks: cleanBlocks(row.body),
    items: [],
    build: null,
    updatedAt: seconds(row.updated_at),
  };
}

function catalogFrom(row: CatalogRow): PublicPage | undefined {
  if (!isCatalogKind(row.kind) || !isSlug(row.slug)) return undefined;
  const body = (row.body ?? {}) as Record<string, unknown>;
  const sources = guideSourcesSchema.safeParse(body.sources);
  const asOf = guideAsOfSchema.safeParse(body.asOf);
  const hero = heroOf(row.body);
  return {
    game: row.game,
    ...(row.kind === "guide" && sources.success ? { sources: sources.data } : {}),
    ...(row.kind === "guide" && asOf.success ? { asOf: asOf.data } : {}),
    media: {},
    ...(hero && (row.game === "retail" || "image" in hero) ? { hero } : {}),
    kind: row.kind,
    version: row.version,
    slug: row.slug,
    title: row.title,
    description: row.description,
    headline: row.title,
    tier: cleanTier(row.tier),
    blocks: cleanBlocks(row.body),
    items: row.game === "forever" ? [] : cleanItems(row.body),
    build: row.game === "forever" ? null : buildOf(row.body),
    updatedAt: seconds(row.published_at),
  };
}

/** The English home page. Public pages stay English (ADR 0073). */
export async function readHome(sql: Sql): Promise<PublicPage | undefined> {
  const [row] = await sql<PageRow[]>`
    SELECT title, description, headline, body, updated_at
    FROM web.pages
    WHERE slug = 'home' AND locale = 'en'`;
  const page = row ? pageFrom(row) : undefined;
  if (page && page.game === "retail") page.media = await readPageMedia(sql, page);
  return page;
}

/** The published English Path or Collection. Drafts are not returned. */
export async function readPublished(
  sql: Sql,
  kind: CatalogKind,
  slug: string,
): Promise<PublicPage | undefined> {
  if (!isSlug(slug)) return undefined;
  const [row] = await sql<CatalogRow[]>`
    SELECT game, kind, slug, title, description, tier, body, published_at, version
    FROM content.paths
    WHERE kind = ${kind} AND slug = ${slug} AND locale = 'en' AND status = 'published'`;
  const page = row ? catalogFrom(row) : undefined;
  if (page) page.media = await readPageMedia(sql, page);
  return page;
}

/** Every published English Path and Collection, for index pages, the home and the sitemap. */
export async function listPublished(
  sql: Sql,
  kind?: CatalogKind,
  game?: Game,
): Promise<CatalogSummary[]> {
  const rows = await sql<
    (Omit<CatalogRow, "body"> & { count: number | string; icons: unknown[] })[]
  >`
    SELECT game, kind, slug, title, description, tier, published_at,
      COALESCE((SELECT jsonb_agg(icons.entry) FROM (
        SELECT jsonb_build_object('kind', item->>'kind', 'id', (item->>'id')::integer,
          'icon', jsonb_build_object('variants', m.variants, 'width', m.width, 'height', m.height, 'alt', m.alt, 'name', m.name)) AS entry
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(body->'items') = 'array' THEN body->'items' ELSE '[]'::jsonb END)
          WITH ORDINALITY AS items(item, position)
        JOIN content.media m ON game = 'retail' AND m.source = 'blizzard' AND m.role = 'icon'
          AND m.ref_kind = item->>'kind' AND m.ref_id::text = item->>'id'
        ORDER BY position LIMIT 6
      ) icons), '[]'::jsonb) AS icons,
      CASE WHEN jsonb_typeof(body -> 'items') = 'array'
        THEN jsonb_array_length(body -> 'items') ELSE 0 END AS count
    FROM content.paths
    WHERE locale = 'en' AND status = 'published'
      AND (${kind ?? null}::text IS NULL OR kind = ${kind ?? null})
      AND (${game ?? null}::text IS NULL OR game = ${game ?? null})
    ORDER BY kind, published_at DESC NULLS LAST, slug`;
  const out: CatalogSummary[] = [];
  for (const row of rows) {
    if (!isCatalogKind(row.kind)) continue;
    const href = catalogHref(row.kind, row.slug);
    if (!href) continue;
    const icons = (row.icons ?? [])
      .flatMap((value) => {
        const ref = cleanMediaRef(value);
        const icon =
          value && typeof value === "object" ? (value as { icon?: MediaAsset }).icon : undefined;
        return ref && icon ? [{ ...ref, icon }] : [];
      })
      .slice(0, 6);
    out.push({
      game: row.game,
      icons,
      kind: row.kind,
      slug: row.slug,
      href,
      title: row.title,
      description: row.description,
      tier: cleanTier(row.tier),
      count: Number(row.count) || 0,
      updatedAt: seconds(row.published_at),
    });
  }
  return out;
}
