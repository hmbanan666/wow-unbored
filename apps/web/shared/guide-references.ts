import type { Block } from "./blocks";
export type GuideLink = { title: string; href: string };
export type References = Record<string, string>;

/** A complete English name wins over a shorter name inside it. */
export function referencePattern(names: string[]) {
  if (!names.length) return null;
  const alternatives = names
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

export function guideLines(block: Block): string[] {
  switch (block.type) {
    case "paragraph":
      return [block.text];
    case "list":
      return block.items;
    case "table":
      return block.rows.flat();
    case "faq":
      return block.entries.map((entry) => entry.a);
    default:
      return [];
  }
}
