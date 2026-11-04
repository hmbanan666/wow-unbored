import type { Block } from "./blocks";

/** A Collection is a Path with kind `collection` (ADR 0072). */
export const CATALOG_KINDS = ["path", "collection"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const TIERS = ["basic", "deeper", "complete"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  basic: "Basic",
  deeper: "Deeper",
  complete: "Complete",
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Pages a player can open. There is no route for an item, mount or NPC. */
export const PUBLIC_ROUTES = [
  { name: "home", pattern: "/" },
  { name: "path", pattern: "/paths/:slug" },
  { name: "collection", pattern: "/collections/:slug" },
] as const;

export type PublicPage = {
  kind: "page" | CatalogKind;
  slug: string;
  title: string;
  description: string;
  headline: string;
  tier: Tier | null;
  blocks: Block[];
};

export const PUBLIC_COPY = {
  unavailable: "Bory can't open this page just now. Try again in a minute.",
  notPublished: "Nothing is published here yet.",
  notFound: "Bory looked, and this page isn't here.",
} as const;

export function isCatalogKind(value: unknown): value is CatalogKind {
  return value === "path" || value === "collection";
}

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && SLUG.test(value);
}

export function cleanTier(value: unknown): Tier | null {
  return TIERS.includes(value as Tier) ? (value as Tier) : null;
}

export function catalogHref(kind: CatalogKind, slug: string): string | undefined {
  if (!isSlug(slug)) return undefined;
  return kind === "path" ? `/paths/${slug}` : `/collections/${slug}`;
}

/** Wowhead-style object pages are not part of the site. */
export function isEntityPath(path: string): boolean {
  return /^\/(items|mounts|npcs|achievements|quests|spells|pets|toys|factions)(\/|$)/.test(path);
}

/** The line to show when a fetch missed, from our JSON or a fixed sentence. */
export function pageMessage(data: unknown, error: unknown, fallback: string): string {
  const from = (value: unknown) => {
    if (!value || typeof value !== "object" || !("message" in value)) return "";
    return typeof value.message === "string" ? value.message : "";
  };
  return (
    from(data) ||
    from(error && typeof error === "object" && "data" in error ? error.data : undefined) ||
    fallback
  );
}
