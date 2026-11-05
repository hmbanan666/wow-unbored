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
