import { z } from "zod";

export const GAMES = ["retail", "forever"] as const;
export type Game = (typeof GAMES)[number];
export const guideSourcesSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(120),
      url: z.url({ protocol: /^https$/ }).regex(/^https:\/\//),
      accessed: z.iso.date(),
    }),
  )
  .max(20);
export const guideAsOfSchema = z.object({
  date: z.iso.date(),
  build: z.string().trim().min(1).max(60),
  note: z.string().trim().max(200).optional(),
});
export const calloutSchema = z.object({
  type: z.literal("callout"),
  tone: z.enum(["note", "forecast"]),
  text: z.string().trim().min(1).max(600),
});
export type GuideSource = z.infer<typeof guideSourcesSchema>[number];
export type GuideAsOf = z.infer<typeof guideAsOfSchema>;
export type Callout = z.infer<typeof calloutSchema>;

const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[{}]|\[\[|\]\]/.test(s), "Use plain text");
/** Game-scoped editorial definitions; ids are provenance, never Retail media requests. */
export const guideTermsSchema = z
  .array(
    z
      .strictObject({
        key: z
          .string()
          .max(60)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        name: plain(80),
        text: plain(400),
        source: z.url({ protocol: /^https$/ }).regex(/^https:\/\//),
        kind: z.enum(["concept", "item", "spell"]).optional(),
        id: z
          .number()
          .int()
          .positive()
          .max(2 ** 31 - 1)
          .optional(),
        icon: z
          .string()
          .regex(/^[0-9a-f]{16}$/)
          .optional(),
      })
      .refine(
        (t) => t.id === undefined || t.kind === "item" || t.kind === "spell",
        "Only items and spells have ids",
      ),
  )
  .max(12)
  .refine(
    (terms) => new Set(terms.map((t) => t.key)).size === terms.length,
    "Term keys must be unique",
  );
export type GuideTerm = z.infer<typeof guideTermsSchema>[number];
export type TermPart = { text: string; term?: GuideTerm };

/** Labels keep the sentence meaningful even when an older definition is unavailable. */
export function termParts(text: string, terms: GuideTerm[], strict = true): TermPart[] {
  const parts: TermPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\{\{term:([a-z0-9]+(?:-[a-z0-9]+)*)\|([^{}|\n]{1,80})\}\}/g)) {
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    if (
      strict &&
      (!match[2]!.trim() ||
        /\[\[|\]\]/.test(match[2]!) ||
        text[match.index - 1] === "{" ||
        text[match.index + match[0].length] === "}")
    )
      throw new Error("Invalid term label or delimiters");
    const term = terms.find((t) => t.key === match[1]);
    if (!term && strict) throw new Error(`Unknown term: ${match[1]}`);
    parts.push({ text: match[2]!, ...(term ? { term } : {}) });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  if (strict && parts.some((p) => !p.term && /\{\{|\}\}/.test(p.text)))
    throw new Error("Malformed term reference");
  return parts;
}
