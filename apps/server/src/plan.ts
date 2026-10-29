import type {
  Plan,
  PlanRequestInput,
  PlayerContext,
  RequestItem,
  RequestType,
  Task,
  Waypoint,
} from "@unbored/contracts";

export type { Plan, PlanRequestInput, PlayerContext, RequestItem, RequestType, Task, Waypoint };

const MODES = new Set(["roam", "quests", "events", "fun", "farm", "custom"]);
const REQUEST_MODES = new Set(["roam", "quests", "events", "fun", "farm"]);

export const MAX_WAYPOINTS = 10;

export class PlanError extends Error {}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function integer(value: unknown, lo: number, hi: number): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < lo || value > hi) return undefined;
  return value;
}

function fraction(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 1) return undefined;
  return value;
}

function cleanComplete(raw: unknown, index: number, depth: number): Record<string, unknown> {
  if (raw === undefined || raw === null) {
    return { kind: "manual" };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new PlanError(`Task ${index} has a completion that is not an object.`);
  }
  const record = raw as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : "manual";
  const need = (field: string, lo = 1, hi = 100_000_000) => {
    const value = integer(record[field], lo, hi);
    if (value === undefined) {
      throw new PlanError(`Task ${index} completion ${kind} needs ${field}.`);
    }
    return value;
  };

  if (kind === "manual") return { kind: "manual" };
  if (kind === "achievement") {
    return { kind, achievementID: need("achievementID") };
  }
  if (kind === "criteria") {
    const achievementID = need("achievementID");
    const criteriaID = integer(record.criteriaID, 1, 100_000_000);
    const criteriaIndex = integer(record.criteriaIndex, 1, 10_000);
    if (criteriaID === undefined && criteriaIndex === undefined) {
      throw new PlanError(`Task ${index} criteria completion needs criteriaID or criteriaIndex.`);
    }
    const out: Record<string, unknown> = { kind, achievementID };
    if (criteriaID !== undefined) out.criteriaID = criteriaID;
    if (criteriaIndex !== undefined) out.criteriaIndex = criteriaIndex;
    return out;
  }
  if (kind === "quest") return { kind, questID: need("questID") };
  if (kind === "toy") return { kind, itemID: need("itemID") };
  if (kind === "pet") return { kind, speciesID: need("speciesID") };
  if (kind === "zone") return { kind, mapID: need("mapID", 1, 10_000_000) };
  if (kind === "mount") {
    const mountID = integer(record.mountID, 1, 100_000_000);
    let mountIDs: number[] | undefined;
    if (record.mountIDs !== undefined) {
      if (
        !Array.isArray(record.mountIDs) ||
        record.mountIDs.length < 1 ||
        record.mountIDs.length > 8
      ) {
        throw new PlanError(`Task ${index} mount completion has a bad mountIDs list.`);
      }
      mountIDs = record.mountIDs.map((item) => {
        const id = integer(item, 1, 100_000_000);
        if (id === undefined) {
          throw new PlanError(`Task ${index} mount completion has a bad mount id.`);
        }
        return id;
      });
    }
    if (mountID === undefined && !mountIDs) {
      throw new PlanError(`Task ${index} mount completion needs mountID or mountIDs.`);
    }
    const out: Record<string, unknown> = { kind };
    if (mountID !== undefined) out.mountID = mountID;
    if (mountIDs) out.mountIDs = mountIDs;
    return out;
  }
  if (kind === "currency") {
    const out: Record<string, unknown> = { kind, currencyID: need("currencyID") };
    if (record.minQuantity !== undefined) {
      const minQuantity = integer(record.minQuantity, 1, 1_000_000_000);
      if (minQuantity === undefined) {
        throw new PlanError(`Task ${index} currency completion has a bad minQuantity.`);
      }
      out.minQuantity = minQuantity;
    }
    return out;
  }
  if (kind === "proximity") {
    const mapID = need("mapID", 1, 10_000_000);
    const x = fraction(record.x);
    const y = fraction(record.y);
    if (x === undefined || y === undefined) {
      throw new PlanError(`Task ${index} proximity completion needs x and y from 0 to 1.`);
    }
    let radiusYards = 40;
    if (record.radiusYards !== undefined) {
      const radius = integer(record.radiusYards, 5, 500);
      if (radius === undefined) {
        throw new PlanError(`Task ${index} proximity radius must be 5 to 500 yards.`);
      }
      radiusYards = radius;
    }
    return { kind, mapID, x, y, radiusYards };
  }
  if (kind === "vignette") {
    const vignetteID = integer(record.vignetteID, 1, 100_000_000);
    const questID = integer(record.questID, 1, 100_000_000);
    if (vignetteID === undefined && questID === undefined) {
      throw new PlanError(`Task ${index} vignette completion needs vignetteID or questID.`);
    }
    const out: Record<string, unknown> = { kind };
    if (vignetteID !== undefined) out.vignetteID = vignetteID;
    if (questID !== undefined) out.questID = questID;
    if (record.mapID !== undefined) out.mapID = need("mapID", 1, 10_000_000);
    if (record.x !== undefined || record.y !== undefined) {
      const x = fraction(record.x);
      const y = fraction(record.y);
      if (x === undefined || y === undefined) {
        throw new PlanError(`Task ${index} vignette pin needs x and y from 0 to 1.`);
      }
      out.x = x;
      out.y = y;
    }
    return out;
  }
  if (kind === "any") {
    if (depth > 1) {
      throw new PlanError(`Task ${index} cannot nest an any completion.`);
    }
    if (!Array.isArray(record.any) || record.any.length < 1 || record.any.length > 4) {
      throw new PlanError(`Task ${index} any completion needs 1 to 4 children.`);
    }
    return {
      kind,
      any: record.any.map((child) => cleanComplete(child, index, depth + 1)),
    };
  }
  throw new PlanError(`Task ${index} has an unknown completion kind ${kind}.`);
}

export function cleanPlan(raw: unknown, nowSeconds: number): Plan {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError("The plan must be a JSON object.");
  }
  const body = raw as Record<string, unknown>;
  if (body.kind !== undefined && body.kind !== "plan") {
    throw new PlanError('The JSON kind must be "plan".');
  }
  if (body.v !== undefined && body.v !== 1) {
    throw new PlanError("Unsupported plan version. v must be 1.");
  }
  const mode = body.mode === undefined ? "custom" : body.mode;
  if (typeof mode !== "string" || !MODES.has(mode)) {
    throw new PlanError("Mode must be roam, quests, events, fun, farm, or custom.");
  }
  const budget = body.budget === undefined ? 60 : integer(body.budget, 5, 240);
  if (budget === undefined) {
    throw new PlanError("Budget must be a whole number of minutes from 5 to 240.");
  }
  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") {
      throw new PlanError("The plan note must be a string.");
    }
    if (byteLength(body.note) > 400) {
      throw new PlanError("The plan note is longer than 400 bytes.");
    }
    note = body.note;
  }
  if (!Array.isArray(body.tasks) || body.tasks.length < 1) {
    throw new PlanError("The plan has no tasks.");
  }
  if (body.tasks.length > 40) {
    throw new PlanError("Too many tasks (max 40).");
  }
  const tasks = body.tasks.map((item, index) => cleanTask(item, index + 1));
  const generatedAt =
    body.generatedAt === undefined ? nowSeconds : integer(body.generatedAt, 0, 4_000_000_000);
  if (generatedAt === undefined) {
    throw new PlanError("generatedAt must be a unix timestamp.");
  }
  return { v: 1, kind: "plan", mode, budget, note, generatedAt, tasks };
}

function cleanTask(raw: unknown, index: number): Task {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError(`Task ${index} must be an object.`);
  }
  const task = raw as Record<string, unknown>;
  if (typeof task.id !== "string" || task.id.length < 1 || task.id.length > 80) {
    throw new PlanError(`Task ${index} has a bad id.`);
  }
  if (!/^[A-Za-z0-9:._-]+$/.test(task.id)) {
    throw new PlanError(`Task ${index} has a bad id.`);
  }
  if (typeof task.title !== "string" || task.title.trim() === "" || byteLength(task.title) > 240) {
    throw new PlanError(`Task ${index} needs a title.`);
  }
  const estMinutes = task.estMinutes === undefined ? 15 : integer(task.estMinutes, 1, 240);
  if (estMinutes === undefined) {
    throw new PlanError(`Task ${index} has a bad time estimate.`);
  }
  let mapID: number | undefined;
  if (task.mapID !== undefined) {
    mapID = integer(task.mapID, 1, 10_000_000);
    if (mapID === undefined) throw new PlanError(`Task ${index} has a bad map id.`);
  }
  let x: number | undefined;
  let y: number | undefined;
  if (task.x !== undefined || task.y !== undefined) {
    x = fraction(task.x);
    y = fraction(task.y);
    if (x === undefined || y === undefined) {
      throw new PlanError(`Task ${index} coordinates must be fractions from 0 to 1, not 0 to 100.`);
    }
  }
  let note: string | undefined;
  if (task.note !== undefined && task.note !== null) {
    if (typeof task.note !== "string" || byteLength(task.note) > 400) {
      throw new PlanError(`Task ${index} note must be a string of at most 400 bytes.`);
    }
    note = task.note;
  }
  const waypoints = cleanWaypoints(task.waypoints, index);
  const complete = cleanComplete(task.complete, index, 1);
  const cleaned: Task = {
    id: task.id,
    title: task.title.trim(),
    estMinutes,
    complete,
  };
  if (mapID !== undefined) cleaned.mapID = mapID;
  if (x !== undefined && y !== undefined) {
    cleaned.x = x;
    cleaned.y = y;
  }
  if (note !== undefined) cleaned.note = note;
  if (waypoints) cleaned.waypoints = waypoints;
  return cleaned;
}

export function cleanWaypoints(raw: unknown, index: number | string): Waypoint[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_WAYPOINTS) {
    throw new PlanError(
      `${prefix(index)} waypoints must be an array of at most ${MAX_WAYPOINTS} points.`,
    );
  }
  if (raw.length === 0) return undefined;
  return raw.map((item, n) => {
    const label = `${prefix(index)} waypoint ${n + 1}`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new PlanError(`${label} must be an object.`);
    }
    const point = item as Record<string, unknown>;
    const mapID = integer(point.mapID, 1, 10_000_000);
    if (mapID === undefined) throw new PlanError(`${label} needs a mapID.`);
    const x = fraction(point.x);
    const y = fraction(point.y);
    if (x === undefined || y === undefined) {
      throw new PlanError(`${label} needs x and y from 0 to 1, not 0 to 100.`);
    }
    const out: Waypoint = { mapID, x, y };
    if (point.label !== undefined && point.label !== null) {
      if (typeof point.label !== "string" || byteLength(point.label) > 80) {
        throw new PlanError(`${label} label must be a string of at most 80 bytes.`);
      }
      if (point.label.trim()) out.label = point.label.trim();
    }
    return out;
  });
}

export function encodeUnb1(plan: Plan): string {
  const payload: Record<string, unknown> = {
    v: plan.v,
    kind: plan.kind,
    mode: plan.mode,
    budget: plan.budget,
    generatedAt: plan.generatedAt,
    tasks: plan.tasks,
  };
  if (plan.note !== undefined) payload.note = plan.note;
  const text = `UNB1:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
  if (text.length > 20_000) {
    throw new PlanError("The encoded plan is longer than 20000 characters.");
  }
  return text;
}

export type ProgressBody = {
  v: 1;
  kind: "progress";
  mode: string | null;
  budget: number | null;
  source: string | null;
  currentId: string | null;
  done: Stamp[];
  skipped: Stamp[];
  remaining: string[];
};

export type Stamp = { id: string; at: number | null };

export type ProgressPost = {
  account: string;
  realm: string;
  character: string;
  savedAt: number | null;
  progress: ProgressBody;
};

function stamps(value: unknown, label: string): Stamp[] {
  if (!Array.isArray(value)) {
    throw new PlanError(`${label} must be an array.`);
  }
  if (value.length > 40) throw new PlanError(`${label} has too many entries.`);
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new PlanError(`${label} entry ${index + 1} must be an object.`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.length < 1 || row.id.length > 80) {
      throw new PlanError(`${label} entry ${index + 1} has a bad id.`);
    }
    let at: number | null = null;
    if (row.at !== undefined && row.at !== null) {
      const parsed = integer(row.at, 0, 4_000_000_000);
      if (parsed === undefined)
        throw new PlanError(`${label} entry ${index + 1} has a bad timestamp.`);
      at = parsed;
    }
    return { id: row.id, at };
  });
}

function prefix(index: number | string): string {
  return typeof index === "number" ? `Task ${index}` : index;
}

export const REQUEST_TYPES = new Set<RequestType>(["plan", "item", "question"]);

export type Answer = {
  message: string;
  waypoints?: Waypoint[];
  answeredAt: number;
};

export const ANSWER_MAX_BYTES = 1000;

export function cleanAnswer(message: unknown, waypoints: unknown, nowSeconds: number): Answer {
  if (typeof message !== "string" || !message.trim()) {
    throw new PlanError("message must be a non-empty string.");
  }
  const text = message.trim();
  if (byteLength(text) > ANSWER_MAX_BYTES) {
    throw new PlanError(`message must be at most ${ANSWER_MAX_BYTES} bytes.`);
  }
  const answer: Answer = { message: text, answeredAt: nowSeconds };
  const points = cleanWaypoints(waypoints, "Answer");
  if (points) answer.waypoints = points;
  return answer;
}

function cleanItem(raw: unknown): RequestItem {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError("item must be an object with an itemID.");
  }
  const body = raw as Record<string, unknown>;
  const itemID = integer(body.itemID, 1, 10_000_000);
  if (itemID === undefined) throw new PlanError("item.itemID must be a whole number.");
  const item: RequestItem = { itemID };
  const link = shortText(body.link, 400);
  if (link) item.link = link;
  const name = shortText(body.name, 120);
  if (name) item.name = name;
  const bag = integer(body.bag, -10, 20);
  if (bag !== undefined) item.bag = bag;
  const slot = integer(body.slot, 0, 400);
  if (slot !== undefined) item.slot = slot;
  const stack = integer(body.count, 0, 1_000_000);
  if (stack !== undefined) item.count = stack;
  return item;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || byteLength(value) > max) {
    throw new PlanError(`${field} must be a string of at most ${max} bytes.`);
  }
  return value.trim() || null;
}

const CONTEXT_MAX_BYTES = 8_000;

function shortText(value: unknown, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let out = trimmed;
  while (byteLength(out) > max) out = out.slice(0, -1);
  return out;
}

function count(value: unknown, hi = 100_000_000): number | undefined {
  return integer(value, 0, hi);
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function compact<T extends Record<string, unknown>>(record: T): T | undefined {
  const out = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/**
 * The game snapshot is advisory. Fields with the wrong type are dropped instead
 * of failing the whole request, because a patch can change what an API returns.
 */
export function cleanContext(raw: unknown): PlayerContext | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new PlanError("context must be an object.");
  }
  if (byteLength(JSON.stringify(raw)) > CONTEXT_MAX_BYTES) {
    throw new PlanError(`context is larger than ${CONTEXT_MAX_BYTES} bytes.`);
  }
  const body = raw as Record<string, unknown>;
  const ilvl =
    typeof body.ilvl === "number" &&
    Number.isFinite(body.ilvl) &&
    body.ilvl >= 0 &&
    body.ilvl < 10_000
      ? Math.round(body.ilvl * 10) / 10
      : undefined;
  let trackedQuests: PlayerContext["trackedQuests"];
  if (Array.isArray(body.trackedQuests)) {
    trackedQuests = body.trackedQuests
      .slice(0, 25)
      .map((item) => {
        if (typeof item !== "object" || item === null) return undefined;
        const row = item as Record<string, unknown>;
        const questID = integer(row.questID, 1, 100_000_000);
        if (questID === undefined) return undefined;
        const title = shortText(row.title);
        return title ? { questID, title } : { questID };
      })
      .filter((row): row is { questID: number; title?: string } => row !== undefined);
    if (!trackedQuests.length) trackedQuests = undefined;
  }
  let plan: PlayerContext["plan"];
  if (typeof body.plan === "object" && body.plan !== null && !Array.isArray(body.plan)) {
    const row = body.plan as Record<string, unknown>;
    plan = compact({
      title: shortText(row.title, 240),
      currentId: shortText(row.currentId, 80),
      currentTitle: shortText(row.currentTitle, 240),
      step: count(row.step, 1000),
      steps: count(row.steps, 1000),
      done: count(row.done, 1000),
      skipped: count(row.skipped, 1000),
      remaining: count(row.remaining, 1000),
    });
  }
  const context = compact<PlayerContext>({
    mapID: integer(body.mapID, 1, 10_000_000),
    zone: shortText(body.zone),
    subzone: shortText(body.subzone),
    x: fraction(body.x),
    y: fraction(body.y),
    level: integer(body.level, 1, 1000),
    faction: shortText(body.faction, 40),
    class: shortText(body.class, 40),
    classFile: shortText(body.classFile, 40),
    spec: shortText(body.spec, 40),
    specID: integer(body.specID, 1, 100_000),
    ilvl,
    gold: count(body.gold, 10_000_000_000),
    skyriding: flag(body.skyriding),
    canFly: flag(body.canFly),
    inInstance: flag(body.inInstance),
    instanceType: shortText(body.instanceType, 40),
    hearth: shortText(body.hearth),
    trackedQuests,
    plan,
  });
  return context ?? null;
}

export function cleanPlanRequest(raw: unknown): PlanRequestInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError("The request must be a JSON object.");
  }
  const body = raw as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!/^[A-Za-z0-9:._-]{1,80}$/.test(id)) {
    throw new PlanError(
      "Request id must be 1 to 80 letters, digits, colon, dot, underscore, or hyphen.",
    );
  }
  const character = typeof body.character === "string" ? body.character.trim() : "";
  const realm = typeof body.realm === "string" ? body.realm.trim() : "";
  if (!character || character.length > 80 || realm.length > 80) {
    throw new PlanError("character is required, and realm must be at most 80 characters.");
  }
  const type = (body.type ?? "plan") as RequestType;
  if (typeof type !== "string" || !REQUEST_TYPES.has(type)) {
    throw new PlanError("type must be plan, item, or question.");
  }
  let mode = "";
  let budget = 0;
  // Item and question Requests carry no mode; older Companions sent "" and 60.
  const hasMode =
    type === "plan" || (body.mode !== undefined && body.mode !== null && body.mode !== "");
  if (hasMode) {
    if (typeof body.mode !== "string" || !REQUEST_MODES.has(body.mode)) {
      throw new PlanError("mode must be roam, quests, events, fun, or farm.");
    }
    mode = body.mode;
  }
  if (type === "plan" || (body.budget !== undefined && body.budget !== null)) {
    const minutes = integer(body.budget, 5, 240);
    if (minutes === undefined) {
      throw new PlanError("budget must be a whole number of minutes from 5 to 240.");
    }
    budget = minutes;
  }
  const wish = optionalText(body.wish, "wish", 600);
  const question = optionalText(body.question, "question", 600);
  const topic = optionalText(body.topic, "topic", 40);
  if (topic && !/^[a-z_-]+$/.test(topic)) throw new PlanError("topic must be lowercase letters.");
  if (type === "question" && !question)
    throw new PlanError("A question request needs question text.");
  const item = type === "item" ? cleanItem(body.item) : null;
  let createdAt: number | null = null;
  if (body.createdAt !== undefined && body.createdAt !== null) {
    createdAt = integer(body.createdAt, 0, 4_000_000_000) ?? null;
    if (body.createdAt !== null && createdAt === null) {
      throw new PlanError("createdAt must be a unix timestamp.");
    }
  }
  const context = cleanContext(body.context);
  const lang = optionalText(body.lang, "lang", 8);
  if (lang && !/^[a-z]{2}$/.test(lang))
    throw new PlanError("lang must be a two-letter language code.");
  const account = optionalText(body.account, "account", 80);
  return {
    id,
    type,
    character,
    realm,
    mode,
    budget,
    wish,
    question,
    topic,
    item,
    createdAt,
    context,
    lang,
    account,
  };
}

export function cleanProgress(raw: unknown): ProgressPost {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError("Progress must be a JSON object.");
  }
  const body = raw as Record<string, unknown>;
  const account = typeof body.account === "string" ? body.account : "";
  const realm = typeof body.realm === "string" ? body.realm : "";
  const character = typeof body.character === "string" ? body.character : "";
  if (!account || account.length > 80 || realm.length > 80 || !character || character.length > 80) {
    throw new PlanError("account, realm, and character are required.");
  }
  let savedAt: number | null = null;
  if (body.savedAt !== undefined && body.savedAt !== null) {
    const parsed = integer(body.savedAt, 0, 4_000_000_000);
    if (parsed === undefined) throw new PlanError("savedAt must be a unix timestamp or null.");
    savedAt = parsed;
  }
  if (typeof body.progress !== "object" || body.progress === null || Array.isArray(body.progress)) {
    throw new PlanError("progress must be an object.");
  }
  const progress = body.progress as Record<string, unknown>;
  if (progress.kind !== undefined && progress.kind !== "progress") {
    throw new PlanError('progress.kind must be "progress".');
  }
  if (progress.v !== undefined && progress.v !== 1) {
    throw new PlanError("progress.v must be 1.");
  }
  const mode = progress.mode === undefined || progress.mode === null ? null : progress.mode;
  if (mode !== null && (typeof mode !== "string" || !MODES.has(mode))) {
    throw new PlanError("progress.mode is not a known mode.");
  }
  let budget: number | null = null;
  if (progress.budget !== undefined && progress.budget !== null) {
    const parsed = integer(progress.budget, 5, 240);
    if (parsed === undefined) throw new PlanError("progress.budget is out of range.");
    budget = parsed;
  }
  const source = progress.source === undefined || progress.source === null ? null : progress.source;
  if (source !== null && (typeof source !== "string" || source.length > 40)) {
    throw new PlanError("progress.source must be a short string.");
  }
  let currentId: string | null = null;
  if (progress.currentId !== undefined && progress.currentId !== null) {
    if (typeof progress.currentId !== "string" || progress.currentId.length > 80) {
      throw new PlanError("progress.currentId is too long.");
    }
    currentId = progress.currentId;
  }
  const remainingRaw = progress.remaining ?? [];
  if (!Array.isArray(remainingRaw) || remainingRaw.length > 40) {
    throw new PlanError("progress.remaining must be an array.");
  }
  const remaining = remainingRaw.map((item, index) => {
    if (typeof item !== "string" || item.length < 1 || item.length > 80) {
      throw new PlanError(`remaining entry ${index + 1} has a bad id.`);
    }
    return item;
  });
  return {
    account,
    realm,
    character,
    savedAt,
    progress: {
      v: 1,
      kind: "progress",
      mode,
      budget,
      source,
      currentId,
      done: stamps(progress.done ?? [], "done"),
      skipped: stamps(progress.skipped ?? [], "skipped"),
      remaining,
    },
  };
}
