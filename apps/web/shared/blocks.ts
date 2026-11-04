/** Authored page body. Structured blocks in Postgres, never a markdown file. */

const MAX_TEXT = 2_000;
const MAX_BLOCKS = 40;
const MAX_ITEMS = 30;

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; label: string; href: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A page on this site (home, an index, install, a Path or a Collection) or https. */
export function allowedHref(href: string): boolean {
  const value = href.trim();
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (["/", "/paths", "/collections", "/guides", "/install"].includes(value)) return true;
    const match = /^\/(paths|collections)\/([^/]+)$/.exec(value);
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
  for (const block of raw) {
    if (out.length >= MAX_BLOCKS || !block || typeof block !== "object") continue;
    const row = block as Record<string, unknown>;
    if (row.type === "heading") {
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
