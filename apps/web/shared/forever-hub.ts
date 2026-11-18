import { GUIDE_GROUPS, type GuideGroup } from "@unbored/contracts/guide";
import type { CatalogSummary } from "./catalog";

export const FOREVER_TITLE = "WoW Forever Guides: Classes, Systems and Gold";
export const FOREVER_DESCRIPTION =
  "Find your first steps in WoW Forever, choose a leveling or solo class, learn camping and Legacy talents, and get started with professions and gold.";

const topicTitles: Record<GuideGroup, string> = {
  "first-steps": "First steps",
  systems: "Systems",
  classes: "Classes",
  "professions-gold": "Professions and gold",
  "dungeons-raids": "Dungeons and raids",
  "mounts-riding": "Mounts and riding",
  addons: "Addons",
  comparisons: "Game comparisons",
};

export const FOREVER_START_SLUGS = [
  "wow-forever-beginners-guide",
  "wow-forever-enhanced-vs-classic-preset",
  "wow-forever-faq",
] as const;

export function foreverHub(pages: CatalogSummary[]) {
  const guides = pages.filter((page) => page.kind === "guide" && page.game === "forever");
  const start = FOREVER_START_SLUGS.flatMap((slug) => guides.filter((page) => page.slug === slug));
  const groups = GUIDE_GROUPS.map((group) => ({
    group,
    title: topicTitles[group],
    pages: guides.filter((page) => page.group === group && !start.includes(page)),
  })).filter((group) => group.pages.length);
  const ungrouped = guides.filter((page) => !page.group && !start.includes(page));
  const recent = [...guides]
    .filter((page) => page.updatedAt !== null)
    .sort((a, b) => b.updatedAt! - a.updatedAt! || a.slug.localeCompare(b.slug))
    .slice(0, 5);
  const listed = [...start, ...groups.flatMap((g) => g.pages), ...ungrouped];
  return { start, groups, ungrouped, recent, listed };
}

export function moreGuides(
  pages: CatalogSummary[],
  page: { slug: string; game: string; group?: GuideGroup },
) {
  return pages
    .filter(
      (entry) => entry.kind === "guide" && entry.game === page.game && entry.slug !== page.slug,
    )
    .sort(
      (a, b) =>
        Number(!!page.group && b.group === page.group) -
        Number(!!page.group && a.group === page.group),
    )
    .slice(0, 3);
}

export function publicationDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
export function displayPublicationDate(seconds: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(seconds * 1000);
}
