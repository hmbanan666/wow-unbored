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

function pageFrom(row: PageRow): PublicPage {
  return {
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
  return {
    kind: row.kind,
    version: row.version,
    slug: row.slug,
    title: row.title,
    description: row.description,
    headline: row.title,
    tier: cleanTier(row.tier),
    blocks: cleanBlocks(row.body),
    items: cleanItems(row.body),
    build: buildOf(row.body),
    updatedAt: seconds(row.published_at),
  };
}

/** The English home page. Public pages stay English (ADR 0073). */
export async function readHome(sql: Sql): Promise<PublicPage | undefined> {
  const [row] = await sql<PageRow[]>`
    SELECT title, description, headline, body, updated_at
    FROM web.pages
    WHERE slug = 'home' AND locale = 'en'`;
  return row ? pageFrom(row) : undefined;
}

/** The published English Path or Collection. Drafts are not returned. */
export async function readPublished(
  sql: Sql,
  kind: CatalogKind,
  slug: string,
): Promise<PublicPage | undefined> {
  if (!isSlug(slug)) return undefined;
  const [row] = await sql<CatalogRow[]>`
    SELECT kind, slug, title, description, tier, body, published_at, version
    FROM content.paths
    WHERE kind = ${kind} AND slug = ${slug} AND locale = 'en' AND status = 'published'`;
  return row ? catalogFrom(row) : undefined;
}

/** Every published English Path and Collection, for index pages, the home and the sitemap. */
export async function listPublished(sql: Sql, kind?: CatalogKind): Promise<CatalogSummary[]> {
  const rows = await sql<(Omit<CatalogRow, "body"> & { count: number | string })[]>`
    SELECT kind, slug, title, description, tier, published_at,
      CASE WHEN jsonb_typeof(body -> 'items') = 'array'
        THEN jsonb_array_length(body -> 'items') ELSE 0 END AS count
    FROM content.paths
    WHERE locale = 'en' AND status = 'published'
      AND (${kind ?? null}::text IS NULL OR kind = ${kind ?? null})
    ORDER BY kind, published_at DESC NULLS LAST, slug`;
  const out: CatalogSummary[] = [];
  for (const row of rows) {
    if (!isCatalogKind(row.kind)) continue;
    const href = catalogHref(row.kind, row.slug);
    if (!href) continue;
    out.push({
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
