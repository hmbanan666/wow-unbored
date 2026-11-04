import { cleanBlocks } from "#shared/blocks";
import {
  catalogHref,
  cleanTier,
  isCatalogKind,
  isSlug,
  type CatalogKind,
  type PublicPage,
} from "#shared/catalog";
import type { Sql } from "./db.ts";

type PageRow = {
  title: string;
  description: string;
  headline: string;
  body: unknown;
};

type CatalogRow = {
  kind: string;
  slug: string;
  title: string;
  description: string;
  tier: string | null;
  body: unknown;
};

function pageFrom(row: PageRow): PublicPage {
  return {
    kind: "page",
    slug: "home",
    title: row.title,
    description: row.description,
    headline: row.headline,
    tier: null,
    blocks: cleanBlocks(row.body),
  };
}

function catalogFrom(row: CatalogRow): PublicPage | undefined {
  if (!isCatalogKind(row.kind) || !isSlug(row.slug)) return undefined;
  return {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    description: row.description,
    headline: row.title,
    tier: cleanTier(row.tier),
    blocks: cleanBlocks(row.body),
  };
}

/** The English home page. Public pages stay English (ADR 0073). */
export async function readHome(sql: Sql): Promise<PublicPage | undefined> {
  const [row] = await sql<PageRow[]>`
    SELECT title, description, headline, body
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
    SELECT kind, slug, title, description, tier, body
    FROM content.paths
    WHERE kind = ${kind} AND slug = ${slug} AND locale = 'en' AND status = 'published'`;
  return row ? catalogFrom(row) : undefined;
}

/** Sitemap entries for published Paths and Collections. */
export async function listPublished(
  sql: Sql,
): Promise<{ loc: string; kind: CatalogKind; slug: string }[]> {
  const rows = await sql<{ kind: string; slug: string }[]>`
    SELECT kind, slug FROM content.paths
    WHERE locale = 'en' AND status = 'published'
    ORDER BY kind, slug`;
  const out: { loc: string; kind: CatalogKind; slug: string }[] = [];
  for (const row of rows) {
    if (!isCatalogKind(row.kind)) continue;
    const loc = catalogHref(row.kind, row.slug);
    if (loc) out.push({ loc, kind: row.kind, slug: row.slug });
  }
  return out;
}
