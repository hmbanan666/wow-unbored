import { GUIDE_GROUPS, type GuideGroup } from "@unbored/contracts/guide";
import type { CatalogSummary } from "./catalog";

export const FOREVER_TITLE = "WoW Forever Guides: Classes, Systems and Gold";
export const FOREVER_DESCRIPTION =
  "Find your first steps in WoW Forever, choose a leveling or solo class, learn camping and Legacy talents, and get started with professions and gold.";

export const FOREVER_TOPICS: Record<GuideGroup, { title: string; intro: string }> = {
  "first-steps": {
    title: "First steps",
    intro:
      "For questing without constant opposing-player attacks, choose Normal. Choose PvP if you want that danger while travelling. Roleplay and Roleplay PvP also ask you to follow naming and behaviour rules. Check the FAQ for access and release dates. The beginner guide covers rulesets and your first character, so start there before looking for a leveling route.",
  },
  systems: {
    title: "Systems",
    intro:
      "Planning an evening of questing? Open camping for the campsite setup, the Cozy Sleeping Bag for its quest route, or Legacy talents for the points you want to spend. Choose the activity you can finish from your current position. If a sleeping-bag step needs a long journey, save that route for an evening when you want to travel.",
  },
  classes: {
    title: "Classes",
    intro:
      "Picking a class starts with how you expect to play. Use the leveling comparison when your main question is the journey to 60. Use the solo comparison when you want to handle quests on your own. Read the opening recommendation and its tradeoff before committing to a character; a leveling preference and a solo-play preference can lead you to different choices.",
  },
  "professions-gold": {
    title: "Professions and gold",
    intro:
      "Making gold starts with deciding what to keep, use or sell. Open early gold before spending your starting money, choose a profession pair for your class, or check Merchant's Favor for crate bundles and faction hand-ins. Enchanting covers that profession's materials and crafts. Check the quantities for the action you choose, then look at the prices available to your character before buying supplies. Leave expensive experiments until you can afford the materials.",
  },
  "dungeons-raids": {
    title: "Dungeons and raids",
    intro: "Choose a dungeon or raid guide for the place your group plans to visit.",
  },
  "mounts-riding": {
    title: "Mounts and riding",
    intro:
      "Choose the mount you want to work toward and check its riding requirements before setting out.",
  },
  addons: {
    title: "Addons",
    intro: "Start with the change you want on screen, then check the setup steps for that addon.",
  },
  comparisons: {
    title: "Comparisons",
    intro:
      "Choose the decision you are facing and follow the option that fits how you want to play.",
  },
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
    ...FOREVER_TOPICS[group],
    pages: guides.filter((page) => page.group === group),
  })).filter((group) => group.pages.length);
  const ungrouped = guides.filter((page) => !page.group);
  const recent = [...guides]
    .filter((page) => page.updatedAt !== null)
    .sort((a, b) => b.updatedAt! - a.updatedAt! || a.slug.localeCompare(b.slug))
    .slice(0, 5);
  // A guide linked in two rows occurs once in the index, at its first visible position.
  const listed = [
    ...new Map(
      [...start, ...groups.flatMap((g) => g.pages), ...ungrouped].map((page) => [page.slug, page]),
    ).values(),
  ];
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
