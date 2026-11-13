import { z } from "zod";
import { isPackedIdSet, unpackIds } from "./packed.ts";

const englishText = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (v) => !Array.from(v).some((c) => c === "|" || c.charCodeAt(0) < 32),
    "Plain text required",
  );
const questPlaceSchema = z
  .object({
    uiMapID: z.number().int().positive().optional(),
    x: z.number().min(0).max(100).optional(),
    y: z.number().min(0).max(100).optional(),
    npcId: z.number().int().positive().optional(),
    npcName: z.string().min(1).max(100).optional(),
  })
  .strict();
/** Body of questSeen v1; the shared snapshot schema supplies its envelope. */
export const questSeenBodySchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            questID: z.number().int().positive().max(2147483647),
            seenAt: z.number().int().positive(),
            locale: z.literal("enUS").optional(),
            title: z.string().min(1).max(120).optional(),
            level: z.number().int().min(-1).optional(),
            acceptedAt: z.number().int().positive().optional(),
            turnedInAt: z.number().int().positive().optional(),
            accept: questPlaceSchema.optional(),
            turnIn: questPlaceSchema.optional(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export const questChainSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    title: englishText,
    faction: z.enum(["Alliance", "Horde", "Both"]),
    zone: englishText,
    status: z.enum(["draft", "published"]),
    steps: z
      .array(
        z
          .object({ questID: z.number().int().positive().max(2147483647), title: englishText })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .refine(
    (c) => new Set(c.steps.map((s) => s.questID)).size === c.steps.length,
    "Step ids must be unique",
  );
export type QuestChain = z.infer<typeof questChainSchema>;
function completedBody(body: unknown): number[] | null {
  if (!body || typeof body !== "object") return null;
  const ids = (body as { ids?: unknown }).ids;
  if (
    !isPackedIdSet(ids) ||
    ids[0] !== "ids1" ||
    ids.slice(1).some((c) => !/^[0-9a-z]+(?:,[0-9a-z]+)*$/.test(c))
  )
    return null;
  const decoded = unpackIds(ids);
  return decoded.every((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647)
    ? decoded
    : null;
}
export function completedQuestIds(body: unknown): number[] {
  return completedBody(body) ?? [];
}
export function validateQuestChain(chain: QuestChain, observed: ReadonlySet<number>) {
  const missing = chain.steps.filter((s) => !observed.has(s.questID)).map((s) => s.questID);
  return {
    status:
      chain.status === "published" && !missing.length ? ("published" as const) : ("draft" as const),
    missing,
  };
}
export function questProgress(ids: number[], doneBody: unknown, logBody: unknown) {
  const completed = completedBody(doneBody);
  const done = new Set(completed ?? []);
  const known = completed !== null;
  const quests =
    logBody && typeof logBody === "object" ? (logBody as { quests?: unknown }).quests : null;
  const inLog = new Set(
    Array.isArray(quests)
      ? quests.flatMap((q) => (q && typeof q.questID === "number" ? [q.questID] : []))
      : [],
  );
  const next = known ? (ids.find((id) => !done.has(id)) ?? null) : null;
  return ids.map((questID) => ({
    questID,
    done: known ? done.has(questID) : null,
    inLog: Array.isArray(quests) ? inLog.has(questID) : null,
    next: questID === next,
  }));
}
export const QUEST_SIGHTING_COLUMNS =
  "quest_id, kind, title, level, npc_id, npc_name, ui_map_id, x, y, first_seen, last_seen";
export type QuestSighting = {
  quest_id: number;
  kind: "accept" | "turnIn" | "completed";
  title: string | null;
  level: number | null;
  npc_id: number | null;
  npc_name: string | null;
  ui_map_id: number | null;
  x: number | null;
  y: number | null;
  first_seen: number;
  last_seen: number;
  slug: string;
};
export type QuestPlace = {
  npcId: number | null;
  npcName: string | null;
  uiMapID: number | null;
  zone: string | null;
  x: number | null;
  y: number | null;
};
export type PublicQuest = {
  questID: number;
  slug: string;
  title: string | null;
  level: number | null;
  lastSeen: number;
  accept: QuestPlace[];
  turnIn: QuestPlace[];
};
export function aggregateQuests(
  rows: QuestSighting[],
  zones: ReadonlyMap<number, string> = new Map(),
): PublicQuest[] {
  const quests = new Map<number, PublicQuest>();
  for (const r of [...rows].sort(
    (a, b) =>
      a.last_seen - b.last_seen ||
      a.quest_id - b.quest_id ||
      (a.title ?? "").localeCompare(b.title ?? "", "en"),
  )) {
    const q = quests.get(r.quest_id) ?? {
      questID: r.quest_id,
      slug: r.slug,
      title: null,
      level: null,
      lastSeen: 0,
      accept: [],
      turnIn: [],
    };
    q.title = r.title ?? q.title;
    q.level = r.level ?? q.level;
    q.lastSeen = Math.max(q.lastSeen, r.last_seen);
    const place = {
      npcId: r.npc_id,
      npcName: r.npc_name,
      uiMapID: r.ui_map_id,
      zone: zones.get(r.ui_map_id ?? 0) ?? null,
      x: r.x,
      y: r.y,
    };
    if (
      r.kind !== "completed" &&
      !q[r.kind].some((p) => JSON.stringify(p) === JSON.stringify(place))
    )
      q[r.kind].push(place);
    quests.set(q.questID, q);
  }
  return [...quests.values()].sort((a, b) => b.lastSeen - a.lastSeen || a.questID - b.questID);
}
