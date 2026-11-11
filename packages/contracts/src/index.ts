import { createHash } from "node:crypto";

import { z } from "zod";

import type { Entities } from "./markup.ts";

/** Targets only; progress is read live from the game. Collectible ids match markup ids. */
const outcomeID = z.number().int().positive().max(2_147_483_647);
export const planOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rep"),
    factionID: outcomeID,
    standing: z.number().int().min(1).max(8),
  }),
  z.object({ kind: z.literal("renown"), factionID: outcomeID, level: outcomeID }),
  z.object({ kind: z.literal("level"), level: outcomeID }),
  z.object({ kind: z.literal("achievement"), achievementID: outcomeID }),
  z.object({ kind: z.literal("currency"), currencyID: outcomeID, amount: outcomeID }),
  ...(["mount", "pet", "toy", "item"] as const).map((kind) =>
    z.object({ kind: z.literal(kind), id: outcomeID }),
  ),
]);
export type PlanOutcome = z.infer<typeof planOutcomeSchema>;

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
  /** Required for new planner submissions; optional only for legacy delivery. */
  outcome?: PlanOutcome;
  /** Up to three chance rewards; never the promised outcome. */
  bonus?: string[];
  /** Facts and state ("you have 3,200 badges"); shown under Show more. */
  details?: string;
  /** Up to 6 single link tokens, such as "{mount:183}". */
  rewards?: string[];
  /** Reward contents (ADR 0055): a container reward token like "{item:ID}" to the 1-6 tokens it may hold. */
  contains?: Record<string, string[]>;
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
  /** One short reason, at most 80 bytes; may carry tokens. */
  why?: string;
  /** Up to 3 single link tokens. */
  rewards?: string[];
  condition?: TaskCondition;
  waypoints?: Waypoint[];
  complete?: Record<string, unknown>;
  /** Step group (ADR 0056): consecutive steps with the same group are done in any order. */
  group?: string;
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

/** Published content identity carried by a Path Idea and its Request. */
export const pathReferenceSchema = z
  .object({
    kind: z.enum(["path", "collection"]),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    locale: z.enum(["en", "ru"]),
    version: z.number().int().positive(),
  })
  .strict();
export type PathReference = z.infer<typeof pathReferenceSchema>;

/** The Suggestion a player picked, as copied into the Request. */
export type RequestSuggestion = {
  path?: PathReference;
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
  game?: "retail" | "forever";
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
    game: z.enum(["retail", "forever"]).optional(),
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
    accountLegacy: z.string().optional(),
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
        path: pathReferenceSchema.optional(),
      })
      .passthrough()
      .refine(
        (idea) => idea.kind !== "path" || idea.path !== undefined,
        "Path Idea needs a published reference",
      )
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
    outcome: planOutcomeSchema.optional(),
    bonus: z.array(z.string()).max(3).optional(),
    details: z
      .string()
      .refine((text) => new TextEncoder().encode(text).length <= 200)
      .optional(),
    rewards: z.array(z.string()).max(6).optional(),
    contains: z.record(z.string(), z.array(z.string()).min(1).max(6)).optional(),
    generatedAt: z.number().optional(),
    tasks: z
      .array(
        z
          .object({
            id: z.string(),
            title: z
              .string()
              .min(1)
              .refine(
                (text) => [...text].length <= 70 && new TextEncoder().encode(text).length <= 240,
              ),
            note: z
              .string()
              .refine((text) => new TextEncoder().encode(text).length <= 400)
              .optional(),
            why: z
              .string()
              .refine((text) => new TextEncoder().encode(text).length <= 80)
              .optional(),
            rewards: z.array(z.string()).max(3).optional(),
            group: z
              .string()
              .regex(/^[a-z0-9-]{1,24}$/)
              .optional(),
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
      .min(1)
      .max(40),
  })
  .passthrough();

/** New planner submissions require a target; delivery still accepts older Plans. */
export const planSubmissionSchema = planSchema.extend({ outcome: planOutcomeSchema });

export const playerProfileSchema = z
  .object({
    character: z.string().min(1),
    realm: z.string().optional(),
    account: z.string().optional(),
    accountLegacy: z.string().optional(),
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

export {
  PACKED_TAG,
  PACKED_VALUES_TAG,
  PACKED_CHUNK,
  isPackedIdSet,
  unpackRows,
  unpackIds,
  unpackCounts,
  packIds,
  type PackedIdSet,
} from "./packed.ts";

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

export const gameSchema = z.enum(["retail", "forever"]);
export type Game = z.infer<typeof gameSchema>;

export const snapshotBodySchema = z
  .object({
    schema: z.literal(2),
    game: gameSchema.optional(),
    account: z.string().min(1),
    /** Old folder key, once, so the Server can rename rows (docs/adr/0044). */
    accountLegacy: z.string().optional(),
    character: z.string().min(1),
    realm: z.string().optional(),
    savedAt: z.number().int().nullable().optional(),
    sections: z.record(z.string(), sectionSchema),
    dropped: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

/** Shared fields of a synchronous snapshot answer and an async upload's result (ADR 0063). */
export const snapshotResultSchema = z.object({
  stored: z.array(z.string()),
  unchanged: z.array(z.string()),
  unknown: z.array(z.string()),
  stale: z.boolean(),
  sections: z.record(
    z.string().regex(/^(char|account):[A-Za-z][A-Za-z0-9_]{0,39}$/),
    z.enum(["stored", "unchanged", "stale"]),
  ),
});

export type SnapshotIngestResult = z.infer<typeof snapshotResultSchema>;

export const SUGGESTION_KINDS = [
  "event",
  "achievement",
  "rare",
  "collection",
  "chain",
  "path",
] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** Why an idea fits, as data, so the addon can say it in the player's language. */
export type SuggestionReason =
  | { kind: "ends"; at: number }
  | { kind: "alts"; count: number }
  | { kind: "near"; mapID: number }
  /** An event that has not started yet (D130). */
  | { kind: "starts"; at: number; count?: number }
  /** A chain with no progress since `at` (D137). */
  | { kind: "stopped"; at: number }
  /** Another Character on the Account finished this chain (D135). */
  | { kind: "altDone"; name: string };

/** A quest chain idea's ground truth (D135, D138): ids from the client only. */
export type SuggestionChain = {
  questLineID: number;
  nextQuestID?: number;
  done: number;
  total: number;
};

/** One idea for the choice Bubble (D106). */
export type Suggestion = {
  path?: PathReference;
  id: string;
  kind: SuggestionKind;
  /** Display label only; ranking and Taste still use kind. */
  displayKind?: SuggestionKind | "mount";
  /** Plain text in the Character's language, at most 60 UTF-8 bytes. */
  action?: string;
  /** Known criteria, quests or collected rewards; absent when unknown. */
  progress?: { done: number; total: number };
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
  /** Set with kind "chain". */
  chain?: SuggestionChain;
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
    displayKind: z.enum([...SUGGESTION_KINDS, "mount"]).optional(),
    action: z
      .string()
      .min(1)
      .refine((action) => new TextEncoder().encode(action).length <= 60, "action is over 60 bytes")
      .refine((action) => !/[{}\r\n|]/.test(action), "action must be plain text on one line")
      .optional(),
    progress: z
      .object({ done: z.number().nonnegative(), total: z.number().positive() })
      .refine((progress) => progress.done <= progress.total, "progress exceeds total")
      .optional(),
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
        z.object({
          kind: z.literal("starts"),
          at: z.number().int(),
          count: z.number().int().positive().optional(),
        }),
        z.object({ kind: z.literal("stopped"), at: z.number().int() }),
        z.object({ kind: z.literal("altDone"), name: z.string().min(1).max(60) }),
      ])
      .optional(),
    rewards: z.array(z.string()).max(3),
    mapID: z.number().int().positive().optional(),
    expiresAt: z.number().int().optional(),
    path: pathReferenceSchema.optional(),
    chain: z
      .object({
        questLineID: z.number().int().positive(),
        nextQuestID: z.number().int().positive().optional(),
        done: z.number().int().min(0),
        total: z.number().int().positive(),
      })
      .optional(),
    request: z.object({
      topic: z.literal("suggestion"),
      suggestionId: z.string().min(1),
      wish: z.string().min(1),
    }),
  })
  .passthrough()
  .refine(
    (idea) => idea.kind !== "path" || idea.path !== undefined,
    "Path Idea needs a published reference",
  );

export const suggestionsBodySchema = z
  .object({
    v: z.literal(1),
    computedAt: z.number().int(),
    characters: z.record(z.string(), z.array(suggestionSchema).max(10)),
  })
  .passthrough();

export * from "./markup.ts";

export { WEB_SESSION_DAYS } from "./web-session.ts";
