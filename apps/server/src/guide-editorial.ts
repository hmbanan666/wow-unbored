import { parseContent, ContentError, type ContentDoc } from "./content.ts";

/** An editorial release check, separate from Retail id validation and draft storage. */
export function validateGuide(
  input: unknown,
  today = new Date().toISOString().slice(0, 10),
): ContentDoc {
  const doc = parseContent(input);
  const problems: string[] = [];
  if (doc.kind !== "guide") problems.push("expected a guide");
  if (doc.locale !== "en") problems.push("public guides are English");
  if (!doc.sources?.length) problems.push("a guide needs verifiable sources");
  if (!doc.asOf) problems.push("a guide needs an evidence date and source build or scope");
  if (doc.asOf && doc.asOf.date > today) problems.push("evidence date is in the future");
  if (doc.sources?.some((s) => s.accessed > today))
    problems.push("source access date is in the future");
  if (doc.sources && new Set(doc.sources.map((s) => s.url)).size !== doc.sources.length)
    problems.push("source URLs must be unique");
  if (doc.blocks[0]?.type !== "paragraph") problems.push("start with a direct answer paragraph");
  if (!doc.blocks.some((b) => b.type === "heading"))
    problems.push("a guide needs useful section headings");
  if (!doc.blocks.some((b) => b.type === "link" && b.href.startsWith("/")))
    problems.push("a guide needs an internal next step");
  if (/\{\{|\[\[|<[^>]+>/.test(doc.title + doc.description))
    problems.push("metadata must be plain text");
  if (problems.length)
    throw new ContentError("Guide is not ready for editorial publication.", problems);
  return doc;
}

/** The migration is the delivery artifact, not a parallel flat-file content store. */
export function guidesFromMigration(sql: string): unknown[] {
  const json = /\$guides\$([\s\S]*?)\$guides\$/.exec(sql)?.[1];
  if (!json) throw new Error("No $guides$ document bundle in this migration");
  const documents: unknown = JSON.parse(json);
  if (!Array.isArray(documents)) throw new Error("Expected a guide list");
  return documents;
}

export function validateGuideBundle(inputs: unknown[]): ContentDoc[] {
  const docs = inputs.map((input) => validateGuide(input));
  for (const field of ["slug", "title", "description"] as const) {
    if (new Set(docs.map((d) => d[field])).size !== docs.length)
      throw new ContentError(`Guide ${field} values must be unique`);
  }
  const routes = new Set(docs.map((d) => `/guides/${d.slug}`));
  for (const doc of docs) {
    for (const block of doc.blocks) {
      if (block.type === "link" && block.href.startsWith("/guides/") && !routes.has(block.href))
        throw new ContentError(`Unresolved bundle link: ${block.href}`);
    }
  }
  return docs;
}
