const MODES = new Set(["roam", "quests", "events", "fun", "farm", "custom"]);
const REQUEST_MODES = new Set(["roam", "quests", "events", "fun", "farm"]);

export type Plan = {
  v: 1;
  kind: "plan";
  mode: string;
  budget: number;
  note?: string;
  generatedAt: number;
  tasks: Task[];
};

export type Task = {
  id: string;
  title: string;
  estMinutes: number;
  mapID?: number;
  x?: number;
  y?: number;
  note?: string;
  complete?: Record<string, unknown>;
};

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

function cleanComplete(
  raw: unknown,
  index: number,
  depth: number,
): Record<string, unknown> {
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
      if (!Array.isArray(record.mountIDs) || record.mountIDs.length < 1 || record.mountIDs.length > 8) {
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
      throw new PlanError(
        `Task ${index} coordinates must be fractions from 0 to 1, not 0 to 100.`,
      );
    }
  }
  let note: string | undefined;
  if (task.note !== undefined && task.note !== null) {
    if (typeof task.note !== "string" || byteLength(task.note) > 400) {
      throw new PlanError(`Task ${index} note must be a string of at most 400 bytes.`);
    }
    note = task.note;
  }
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
  return cleaned;
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
      if (parsed === undefined) throw new PlanError(`${label} entry ${index + 1} has a bad timestamp.`);
      at = parsed;
    }
    return { id: row.id, at };
  });
}

export type PlanRequestInput = {
  id: string;
  character: string;
  realm: string;
  mode: string;
  budget: number;
  wish: string | null;
  createdAt: number | null;
};

export function cleanPlanRequest(raw: unknown): PlanRequestInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError("The request must be a JSON object.");
  }
  const body = raw as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!/^[A-Za-z0-9:._-]{1,80}$/.test(id)) {
    throw new PlanError("Request id must be 1 to 80 letters, digits, colon, dot, underscore, or hyphen.");
  }
  const character = typeof body.character === "string" ? body.character.trim() : "";
  const realm = typeof body.realm === "string" ? body.realm.trim() : "";
  if (!character || character.length > 80 || realm.length > 80) {
    throw new PlanError("character is required, and realm must be at most 80 characters.");
  }
  if (typeof body.mode !== "string" || !REQUEST_MODES.has(body.mode)) {
    throw new PlanError("mode must be roam, quests, events, fun, or farm.");
  }
  const budget = integer(body.budget, 5, 240);
  if (budget === undefined) {
    throw new PlanError("budget must be a whole number of minutes from 5 to 240.");
  }
  let wish: string | null = null;
  if (body.wish !== undefined && body.wish !== null && body.wish !== "") {
    if (typeof body.wish !== "string" || Buffer.byteLength(body.wish, "utf8") > 200) {
      throw new PlanError("wish must be a string of at most 200 bytes.");
    }
    wish = body.wish.trim();
  }
  let createdAt: number | null = null;
  if (body.createdAt !== undefined && body.createdAt !== null) {
    createdAt = integer(body.createdAt, 0, 4_000_000_000) ?? null;
    if (body.createdAt !== null && createdAt === null) {
      throw new PlanError("createdAt must be a unix timestamp.");
    }
  }
  return { id, character, realm, mode: body.mode, budget, wish, createdAt };
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
  const source =
    progress.source === undefined || progress.source === null
      ? null
      : progress.source;
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
