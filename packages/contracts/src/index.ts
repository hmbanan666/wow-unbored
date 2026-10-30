import { createHash } from "node:crypto";

import { z } from "zod";

import type { Entities } from "./markup.ts";

/** A Plan the Server stores and the Companion writes into the game. */
export type Plan = {
  v: 1;
  kind: "plan";
  mode: string;
  /** Minutes the player typed in the custom form; Plans are never cut to it (ADR 0037). */
  budget?: number;
  note?: string;
  /** A short human name like a quest title, 3 to 40 characters, no tokens (ADR 0038). */
  title?: string;
  /** One sentence: what you do and why it is worth it; may carry tokens. */
  goal?: string;
  /** Facts and state ("you have 3,200 badges"); shown under Show more. */
  details?: string;
  /** Up to 6 single link tokens, such as "{mount:183}". */
  rewards?: string[];
  generatedAt: number;
  tasks: Task[];
  /** Npc names and places for `{npc:ID}` tokens (markup.md). */
  entities?: Entities;
};

export type Waypoint = {
  mapID: number;
  x: number;
  y: number;
  label?: string;
};

export type Task = {
  id: string;
  title: string;
  estMinutes: number;
  mapID?: number;
  x?: number;
  y?: number;
  note?: string;
  /** One short reason, at most 120 bytes; may carry tokens. */
  why?: string;
  /** Up to 3 single link tokens. */
  rewards?: string[];
  condition?: TaskCondition;
  waypoints?: Waypoint[];
  complete?: Record<string, unknown>;
};

export const CONDITION_KINDS = ["currency", "item", "level", "quest", "ach"] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

/** "If you have 5,000 {currency:1166}": the text is shown, the check is run live in the game (D95). */
export type TaskCondition = {
  text: string;
  check?: { kind: ConditionKind; id: number; atLeast?: number };
};

export type RequestType = "plan" | "item" | "question";

export type RequestItem = {
  itemID: number;
  link?: string;
  name?: string;
  bag?: number;
  slot?: number;
  count?: number;
};

/** What the Companion posts for one Request. Item and question bodies omit mode and budget; plan bodies carry budget only when the player set it (ADR 0037). */
export type RequestBody = {
  id: string;
  createdAt?: number;
  character: string;
  realm: string;
  type: RequestType;
  mode?: string;
  budget?: number;
  wish?: string;
  question?: string;
  topic?: string;
  lang?: string;
  account?: string;
  item?: RequestItem;
  context?: PlayerContext;
  /** Set with topic "suggestion": the picked Suggestion's id and a copy of it (ground truth for ids). */
  suggestionId?: string;
  suggestion?: RequestSuggestion;
};

/** The Suggestion a player picked, as copied into the Request. */
export type RequestSuggestion = {
  id: string;
  kind: string;
  title: string;
  goal: string;
  why?: string;
  rewards: string[];
  mapID?: number;
  expiresAt?: number;
};

/** The cleaned Request the Server stores. */
export type PlanRequestInput = {
  id: string;
  type: RequestType;
  character: string;
  realm: string;
  mode: string;
  budget: number | null;
  wish: string | null;
  question: string | null;
  topic: string | null;
  item: RequestItem | null;
  createdAt: number | null;
  context: PlayerContext | null;
  lang: string | null;
  account: string | null;
  suggestionId: string | null;
  suggestion: RequestSuggestion | null;
};

export type PlayerContext = {
  mapID?: number;
  zone?: string;
  subzone?: string;
  x?: number;
  y?: number;
  level?: number;
  faction?: string;
  class?: string;
  classFile?: string;
  spec?: string;
  specID?: number;
  ilvl?: number;
  gold?: number;
  skyriding?: boolean;
  canFly?: boolean;
  inInstance?: boolean;
  instanceType?: string;
  hearth?: string;
  trackedQuests?: { questID: number; title?: string }[];
  plan?: {
    title?: string;
    currentId?: string;
    currentTitle?: string;
    step?: number;
    steps?: number;
    done?: number;
    skipped?: number;
    remaining?: number;
  };
};

/** One character's Player profile upload. An empty field must not wipe a good one. */
export type PlayerProfile = {
  character: string;
  realm: string;
  account: string;
  savedAt: number | null;
  profile: Record<string, unknown>;
};

const requestItemSchema = z
  .object({
    itemID: z.number().int().positive(),
    link: z.string().optional(),
    name: z.string().optional(),
    bag: z.number().int().optional(),
    slot: z.number().int().optional(),
    count: z.number().int().optional(),
  })
  .passthrough();

export const requestBodySchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.number().int().optional(),
    character: z.string().min(1),
    realm: z.string(),
    type: z.enum(["plan", "item", "question"]),
    mode: z.string().optional(),
    budget: z.number().int().optional(),
    wish: z.string().optional(),
    question: z.string().optional(),
    topic: z.string().optional(),
    lang: z.string().optional(),
    account: z.string().optional(),
    item: requestItemSchema.optional(),
    context: z.object({}).passthrough().optional(),
    suggestionId: z.string().min(1).optional(),
    suggestion: z
      .object({
        id: z.string().min(1),
        kind: z.string(),
        title: z.string(),
        goal: z.string(),
        why: z.string().optional(),
        rewards: z.array(z.string()).max(3),
        mapID: z.number().int().optional(),
        expiresAt: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    if (body.type === "plan") {
      if (!body.mode)
        ctx.addIssue({ code: "custom", message: "plan Requests need mode", path: ["mode"] });
    } else if (body.mode !== undefined || body.budget !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "item and question Requests carry no mode or budget",
      });
    }
  });

export const planSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("plan"),
    mode: z.string(),
    budget: z.number().int().optional(),
    note: z.string().optional(),
    title: z.string().optional(),
    goal: z.string().optional(),
    details: z.string().optional(),
    rewards: z.array(z.string()).max(6).optional(),
    generatedAt: z.number().optional(),
    tasks: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            why: z.string().optional(),
            rewards: z.array(z.string()).max(3).optional(),
            condition: z
              .object({
                text: z.string(),
                check: z
                  .object({
                    kind: z.enum(["currency", "item", "level", "quest", "ach"]),
                    id: z.number().int(),
                    atLeast: z.number().int().optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export const playerProfileSchema = z
  .object({
    character: z.string().min(1),
    realm: z.string().optional(),
    account: z.string().optional(),
    savedAt: z.number().int().nullable().optional(),
    profile: z.object({}).passthrough(),
  })
  .passthrough();

/** Section scopes: one Character's file, or the Account file (docs/adr/0028). */
export type SectionScope = "char" | "account";

/** One Section as uploaded: the addon's `{ v, at, src, body }` plus scope and hash. */
export type SnapshotSection = {
  scope: SectionScope;
  v: number;
  at?: number | null;
  src?: string;
  hash?: string;
  body: Record<string, unknown>;
};

/** What the Companion posts to `POST /v1/snapshot`: only the Sections that changed. */
export type SnapshotBody = {
  schema: 2;
  account: string;
  character: string;
  realm?: string;
  savedAt?: number | null;
  sections: Record<string, SnapshotSection>;
  dropped?: Partial<Record<SectionScope, Record<string, { at?: number; bytes?: number }>>>;
};

/** `{ "ids1", "<chunk>", ... }` (docs/contract/README.md#packed-id-sets). */
export type PackedIdSet = string[];

export const PACKED_TAG = "ids1";
/** The same with whole-number values after each id: `"<gap>:<value>:<value>"`. */
export const PACKED_VALUES_TAG = "idv1";
export const PACKED_CHUNK = 4000;

export function isPackedIdSet(value: unknown): value is PackedIdSet {
  return (
    Array.isArray(value) &&
    (value[0] === PACKED_TAG || value[0] === PACKED_VALUES_TAG) &&
    value.every((v) => typeof v === "string")
  );
}

/** Every row of a packed set: the id and, for `idv1`, its values. */
export function unpackRows(packed: unknown): { id: number; values: number[] }[] {
  if (!isPackedIdSet(packed)) return [];
  const out: { id: number; values: number[] }[] = [];
  let previous = 0;
  for (const chunk of packed.slice(1)) {
    for (const word of chunk.split(",")) {
      if (!word) continue;
      const [gapWord, ...rest] = word.split(":");
      const gap = Number.parseInt(gapWord, 36);
      if (!Number.isFinite(gap)) continue;
      previous += gap;
      out.push({ id: previous, values: rest.map((part) => Number.parseInt(part, 36)) });
    }
  }
  return out;
}

export function unpackIds(packed: unknown): number[] {
  return unpackRows(packed).map((row) => row.id);
}

/** `{ [id]: firstValue }` of an `idv1` set, such as item counts. */
export function unpackCounts(packed: unknown): Map<number, number> {
  return new Map(unpackRows(packed).map((row) => [row.id, row.values[0] ?? 0]));
}

export function packIds(ids: Iterable<number>): PackedIdSet {
  const list = [...new Set([...ids].filter((id) => Number.isInteger(id) && id >= 0))].sort(
    (a, b) => a - b,
  );
  const out: PackedIdSet = [PACKED_TAG];
  let chunk: string[] = [];
  let length = 0;
  let previous = 0;
  for (const id of list) {
    const word = (id - previous).toString(36);
    previous = id;
    let extra = word.length + (chunk.length > 0 ? 1 : 0);
    if (chunk.length > 0 && length + extra > PACKED_CHUNK) {
      out.push(chunk.join(","));
      chunk = [];
      length = 0;
      extra = word.length;
    }
    chunk.push(word);
    length += extra;
  }
  if (chunk.length > 0) out.push(chunk.join(","));
  return out;
}

/** JSON with object keys sorted and no whitespace: the input to a Section hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

/** sha256 hex of the canonical JSON of a Section body; the same in Rust and Python. */
export function sectionHash(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

const sectionSchema = z
  .object({
    scope: z.enum(["char", "account"]),
    v: z.number().int().min(1),
    at: z.number().int().nullable().optional(),
    src: z.string().optional(),
    hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    body: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const snapshotBodySchema = z
  .object({
    schema: z.literal(2),
    account: z.string().min(1),
    character: z.string().min(1),
    realm: z.string().optional(),
    savedAt: z.number().int().nullable().optional(),
    sections: z.record(z.string(), sectionSchema),
    dropped: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

export const SUGGESTION_KINDS = ["event", "achievement", "rare", "collection"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** Why an idea fits, as data, so the addon can say it in the player's language. */
export type SuggestionReason =
  | { kind: "ends"; at: number }
  | { kind: "alts"; count: number }
  | { kind: "near"; mapID: number };

/** One idea for the choice Bubble (D106). */
export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  /** At most 40 characters, human. */
  title: string;
  /** When set, the addon shows the game's own name of this token as the title. */
  titleToken?: string;
  /** At most 140 bytes, may carry tokens. */
  goal: string;
  /** At most 100 bytes, English; the addon prefers `reason`. */
  why?: string;
  reason?: SuggestionReason;
  /** Up to 3 single link tokens. */
  rewards: string[];
  mapID?: number;
  expiresAt?: number;
  request: { topic: "suggestion"; suggestionId: string; wish: string };
};

/** `GET /v1/suggestions` and `UnboredSuggestions`: keyed by "Realm-Name". */
export type SuggestionsBody = {
  v: 1;
  computedAt: number;
  characters: Record<string, Suggestion[]>;
};

const suggestionSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: z.enum(SUGGESTION_KINDS),
    title: z.string().min(1).max(40),
    titleToken: z.string().optional(),
    goal: z
      .string()
      .min(1)
      .refine((goal) => new TextEncoder().encode(goal).length <= 140, "goal is over 140 bytes"),
    why: z
      .string()
      .refine((why) => new TextEncoder().encode(why).length <= 100, "why is over 100 bytes")
      .optional(),
    reason: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("ends"), at: z.number().int() }),
        z.object({ kind: z.literal("alts"), count: z.number().int().min(2) }),
        z.object({ kind: z.literal("near"), mapID: z.number().int().positive() }),
      ])
      .optional(),
    rewards: z.array(z.string()).max(3),
    mapID: z.number().int().positive().optional(),
    expiresAt: z.number().int().optional(),
    request: z.object({
      topic: z.literal("suggestion"),
      suggestionId: z.string().min(1),
      wish: z.string().min(1),
    }),
  })
  .passthrough();

export const suggestionsBodySchema = z
  .object({
    v: z.literal(1),
    computedAt: z.number().int(),
    characters: z.record(z.string(), z.array(suggestionSchema).max(6)),
  })
  .passthrough();

export * from "./markup.ts";
