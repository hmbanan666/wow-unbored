import { z } from "zod";

/** A Plan the Server stores and the Companion writes into the game. */
export type Plan = {
  v: 1;
  kind: "plan";
  mode: string;
  budget: number;
  note?: string;
  generatedAt: number;
  tasks: Task[];
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

/** What the Companion posts for one Request. Item and question bodies omit mode and budget. */
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
  budget: number;
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
      if (body.budget === undefined) {
        ctx.addIssue({ code: "custom", message: "plan Requests need budget", path: ["budget"] });
      }
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
    budget: z.number().int(),
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
