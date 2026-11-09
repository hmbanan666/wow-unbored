import type { GuideGroup, Game, GuideSource, GuideAsOf, GuideTerm } from "@unbored/contracts/guide";
import {
  cleanMediaOverrides,
  type MediaOverrides,
  type Hero,
  type PageMedia,
  type MediaRef,
  type MediaAsset,
} from "@unbored/contracts/game-media";
import type { Block } from "./blocks";

/** A Collection is a Path with kind `collection` (ADR 0072); a Guide is an authored article. */
export const CATALOG_KINDS = ["path", "collection", "guide"] as const;
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
  { name: "paths", pattern: "/paths" },
  { name: "path", pattern: "/paths/:slug" },
  { name: "collections", pattern: "/collections" },
  { name: "collection", pattern: "/collections/:slug" },
  { name: "forever", pattern: "/forever" },
  { name: "guides", pattern: "/guides" },
  { name: "guide", pattern: "/guides/:slug" },
  { name: "install", pattern: "/install" },
  { name: "about", pattern: "/about" },
] as const;

/** Header and footer links (docs/site-structure.md). */
export const SITE_NAV = [
  { label: "Guides", to: "/guides" },
  { label: "WoW Forever", to: "/forever" },
  { label: "Collections", to: "/collections" },
  { label: "Paths", to: "/paths" },
  { label: "Get Bory", to: "/install" },
  { label: "My page", to: "/my" },
] as const;

export const RELEASES_URL = "https://github.com/hmbanan666/wow-unbored/releases/latest";
export const TELEGRAM_URL = "https://t.me/playunbored";
export const REPO_URL = "https://github.com/hmbanan666/wow-unbored";
export const PRIVACY_URL = "https://github.com/hmbanan666/wow-unbored#what-bory-knows-about-you";

/** Where each kind lives and what it is called in breadcrumbs and cards. */
export const CATALOG_SECTION: Record<CatalogKind, { label: string; to: string; one: string }> = {
  path: { label: "Paths", to: "/paths", one: "Path" },
  collection: { label: "Collections", to: "/collections", one: "Collection" },
  guide: { label: "Guides", to: "/guides", one: "Guide" },
};

export const ITEM_KINDS = [
  "mount",
  "pet",
  "toy",
  "achievement",
  "item",
  "rep",
  "renown",
  "level",
  "currency",
  "quest",
  "questLine",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  mount: "Mount",
  pet: "Battle pet",
  toy: "Toy",
  achievement: "Achievement",
  item: "Item",
  rep: "Reputation",
  renown: "Renown",
  level: "Level",
  currency: "Currency",
  quest: "Quest",
  questLine: "Chain",
};

export const SOURCE_TYPES = [
  "vendor",
  "drop",
  "quest",
  "achievement",
  "reputation",
  "renown",
  "profession",
  "pvp",
  "event",
  "treasure",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_LABEL: Record<SourceType, string> = {
  vendor: "Vendor",
  drop: "Drop",
  quest: "Quest",
  achievement: "Achievement",
  reputation: "Reputation",
  renown: "Renown",
  profession: "Profession",
  pvp: "PvP",
  event: "Event",
  treasure: "Treasure",
  other: "Other",
};

/** One authored list item: a verified game target and exactly how to get it. */
export type CatalogItem = {
  media?: MediaOverrides;
  kind: ItemKind;
  id?: number;
  level?: number;
  name: string;
  source: { type: SourceType; lines: string[] };
  chance: boolean;
  note: string;
  url?: string;
};

export type PublicPage = {
  group?: GuideGroup;
  game: Game;
  terms?: GuideTerm[];
  sources?: GuideSource[];
  asOf?: GuideAsOf;
  hero?: Hero;
  media: PageMedia;
  version?: number;
  kind: "page" | CatalogKind;
  slug: string;
  title: string;
  description: string;
  headline: string;
  tier: Tier | null;
  blocks: Block[];
  items: CatalogItem[];
  build: string | null;
  /** First publication across all versions, absent on static pages and older API responses. */
  publishedAt?: number | null;
  updatedAt: number | null;
};

/** A card on the home and index pages. */
export type CatalogSummary = {
  group?: GuideGroup;
  game: Game;
  icons: (MediaRef & { icon: MediaAsset })[];
  kind: CatalogKind;
  slug: string;
  href: string;
  title: string;
  description: string;
  tier: Tier | null;
  count: number;
  updatedAt: number | null;
};

function line(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Items from a published body; anything malformed is left out, never guessed. */
export function cleanItems(body: unknown): CatalogItem[] {
  const raw =
    body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : [];
  const out: CatalogItem[] = [];
  for (const value of raw.slice(0, 100)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const source = (row.source ?? {}) as Record<string, unknown>;
    const kind = row.kind as ItemKind;
    const type = source.type as SourceType;
    const name = line(row.name, 120);
    const note = line(row.note, 600);
    const lines = line(source.text, 400)
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean);
    if (
      !ITEM_KINDS.includes(kind) ||
      !SOURCE_TYPES.includes(type) ||
      (kind === "level"
        ? !Number.isInteger(row.level) || Number(row.level) <= 0
        : !Number.isInteger(row.id)) ||
      !name ||
      !note ||
      !lines.length ||
      typeof row.chance !== "boolean"
    )
      continue;
    let url: string | undefined;
    if (typeof row.url === "string") {
      try {
        url = new URL(row.url).protocol === "https:" ? row.url : undefined;
      } catch {
        url = undefined;
      }
    }
    const media = cleanMediaOverrides(row.media);
    out.push({
      ...(media ? { media } : {}),
      kind,
      ...(kind === "level" ? { level: row.level as number } : { id: row.id as number }),
      name,
      source: { type, lines },
      chance: row.chance,
      note,
      ...(url ? { url } : {}),
    });
  }
  return out;
}

export const PUBLIC_COPY = {
  unavailable: "Bory can't open this page just now. Try again in a minute.",
  notPublished: "Nothing is published here yet.",
  notFound: "Bory looked, and this page isn't here.",
} as const;

export function isCatalogKind(value: unknown): value is CatalogKind {
  return value === "path" || value === "collection" || value === "guide";
}

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && SLUG.test(value);
}

export function cleanTier(value: unknown): Tier | null {
  return TIERS.includes(value as Tier) ? (value as Tier) : null;
}

export function catalogHref(kind: CatalogKind, slug: string): string | undefined {
  if (!isSlug(slug)) return undefined;
  return `/${CATALOG_SECTION[kind].to.slice(1)}/${slug}`;
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
