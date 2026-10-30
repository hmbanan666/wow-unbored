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
  waypoints?: Waypoint[];
  complete?: Record<string, unknown>;
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
    generatedAt: z.number().optional(),
    tasks: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()).min(1),
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

export * from "./markup.ts";
