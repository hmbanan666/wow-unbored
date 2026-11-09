import {
  calloutSchema,
  tableSchema,
  faqSchema,
  type GuideTable,
  type GuideFaq,
  type Callout,
} from "@unbored/contracts/guide";
import { cleanFigure, inlineMedia, type Figure } from "@unbored/contracts/game-media";
/** Authored page body. Structured blocks in Postgres, never a markdown file. */

const MAX_TEXT = 2_000;
const MAX_BLOCKS = 40;
const MAX_ITEMS = 30;

export type Block =
  | Figure
  | Callout
  | GuideTable
  | GuideFaq
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; label: string; href: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A page on this site (home, an index, install, a Path or a Collection) or https. */
export function allowedHref(href: string): boolean {
  const value = href.trim();
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (["/", "/paths", "/collections", "/guides", "/forever", "/install"].includes(value))
      return true;
    const match = /^\/(paths|collections|guides)\/([^/]+)$/.exec(value);
    return Boolean(match && match[2]!.length <= 80 && SLUG.test(match[2]!));
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}

/** Drops unknown blocks and any link that is not a public page or https URL. */
export function cleanBlocks(body: unknown): Block[] {
  const raw = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { blocks?: unknown }).blocks)
      ? (body as { blocks: unknown[] }).blocks
      : [];
  const out: Block[] = [];
  let inlineCount = 0;
  for (const block of raw) {
    if (out.length >= MAX_BLOCKS || !block || typeof block !== "object") continue;
    const row = block as Record<string, unknown>;
    const lines =
      row.type === "paragraph"
        ? [row.text]
        : row.type === "list" && Array.isArray(row.items)
          ? row.items
          : [];
    try {
      const count = lines.reduce<number>(
        (sum, line) => sum + (typeof line === "string" ? inlineMedia(line).length : 0),
        0,
      );
      if (inlineCount + count > 20) continue;
      inlineCount += count;
    } catch {
      continue;
    }
    if (row.type === "table") {
      const table = tableSchema.safeParse(row);
      if (table.success) out.push(table.data);
    } else if (row.type === "faq") {
      const faq = faqSchema.safeParse(row);
      if (faq.success && !out.some((block) => block.type === "faq")) out.push(faq.data);
    } else if (row.type === "callout") {
      const callout = calloutSchema.safeParse(row);
      if (callout.success) out.push(callout.data);
    } else if (row.type === "figure") {
      const figure = cleanFigure(row);
      if (figure) out.push(figure);
    } else if (row.type === "heading") {
      const heading = text(row.text).slice(0, 120);
      if (heading) out.push({ type: "heading", text: heading });
    } else if (row.type === "paragraph") {
      const paragraph = text(row.text);
      if (paragraph) out.push({ type: "paragraph", text: paragraph });
    } else if (row.type === "list" && Array.isArray(row.items)) {
      const items = row.items
        .map((item) => text(item))
        .filter(Boolean)
        .slice(0, MAX_ITEMS);
      if (items.length) out.push({ type: "list", items });
    } else if (row.type === "link") {
      const label = text(row.label).slice(0, 80);
      const href = typeof row.href === "string" ? row.href.trim() : "";
      if (label && allowedHref(href)) out.push({ type: "link", label, href });
    }
  }
  return out;
}
