import {
  CONDITION_KINDS,
  cleanEntities,
  cleanMarkup,
  markupIds,
  MAX_TOKENS,
  parseMarkup,
  type ConditionKind,
  type Entities,
  type TaskCondition,
} from "@unbored/contracts";
import type {
  Plan,
  PlanRequestInput,
  PlayerContext,
  RequestItem,
  RequestSuggestion,
  RequestType,
  Task,
  Waypoint,
} from "@unbored/contracts";

export type {
  Plan,
  PlanRequestInput,
  PlayerContext,
  RequestItem,
  RequestSuggestion,
  RequestType,
  Task,
  Waypoint,
};

const MODES = new Set(["roam", "quests", "events", "fun", "farm", "custom"]);
const REQUEST_MODES = new Set(["roam", "quests", "events", "fun", "farm"]);

export const MAX_WAYPOINTS = 10;

export class PlanError extends Error {}

/** How markup is checked while a plan or answer is cleaned (packages/contracts/markup.md). */
export type MarkupCheck = {
  /** `type:id` the Blizzard Game Data API says do not exist. */
  missing?: ReadonlySet<string>;
  /** Filled with one line per token or entity that was changed. */
  warnings?: string[];
  /** The Request's wish, so a title that only repeats it is flagged. */
  wish?: string | null;
};

/** Card limits (ADR 0038): short on purpose, the card is for casual players. */
export const CARD_LIMITS = {
  titleMin: 3,
  titleMax: 40,
  goal: 160,
  details: 600,
  rewards: 6,
  why: 120,
  stepRewards: 3,
  condition: 160,
} as const;

const PRESET_KEYS = [
  "roam",
  "quests",
  "events",
  "fun",
  "farm",
  "custom",
  "surprise",
  "nearby",
  "mount",
  "collect",
  "grind",
  "gold",
  "plan",
  "request",
  "mode",
];

/** Cut at the last word boundary that fits, without an ellipsis (D94). */
function cutWords(text: string, fits: (value: string) => boolean): string {
  if (fits(text)) return text;
  const words = text.split(/\s+/);
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (!fits(next)) break;
    out = next;
  }
  if (!out) {
    out = text;
    while (out && !fits(out)) out = out.slice(0, -1);
  }
  return out.replace(/[\s,;:.-]+$/, "");
}

/** The Plan title: a human name like a quest title. Problems are warnings, never errors (D94). */
export function cleanTitle(raw: unknown, check: MarkupCheck = {}): string | undefined {
  const warn = (line: string) => check.warnings?.push(`Plan title: ${line}`);
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    warn("add a short human title, like a quest name; Bory shows the preset name meanwhile");
    return undefined;
  }
  if (typeof raw !== "string") throw new PlanError("The plan title must be a string.");
  let title = raw.replace(/\s+/g, " ").trim();
  if (title.includes("{")) {
    warn("no link tokens in the title; they were made plain. Put links in goal or rewards");
    title = parseMarkup(title)
      .map((part) => (typeof part === "string" ? part : (part.label ?? "")))
      .join("")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const chars = (value: string) => [...value].length;
  if (chars(title) > CARD_LIMITS.titleMax) {
    warn(`longer than ${CARD_LIMITS.titleMax} characters; cut at a word. Keep it short and catchy`);
    title = cutWords(title, (value) => chars(value) <= CARD_LIMITS.titleMax);
  }
  if (chars(title) < CARD_LIMITS.titleMin) {
    warn(`shorter than ${CARD_LIMITS.titleMin} characters; dropped`);
    return undefined;
  }
  if ((title.match(/\d+(?:[.,]\d+)*/g) ?? []).length > 1) {
    warn("more than one number; state facts go in details, not the title");
  }
  const first = title.toLowerCase().split(/[^a-z]+/)[0] ?? "";
  if (PRESET_KEYS.includes(first)) {
    warn(`starts with "${first}"; name the goal like a quest title instead`);
  }
  if (/\byou have\b/i.test(title)) {
    warn('"you have" is a fact; state facts go in details');
  }
  const wish = check.wish?.replace(/\s+/g, " ").trim().toLowerCase();
  if (wish && wish === title.toLowerCase()) {
    warn("repeats the wish word for word; give it a name of its own");
  }
  return title;
}

/** Optional short text with tokens; over the limit it is cut at a word with a warning. */
function cardText(
  raw: unknown,
  max: number,
  scope: MarkupScope,
  where: string,
  used: { count: number },
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new PlanError(`${where} must be a string.`);
  let text = raw.trim();
  if (!text) return undefined;
  if (byteLength(text) > max) {
    scope.check.warnings?.push(`${where}: longer than ${max} bytes; cut at a word. Keep it short`);
    text = cutWords(text, (value) => byteLength(value) <= max && !/\{[^}]*$/.test(value));
  }
  return cleanText(text, scope, where, used) || undefined;
}

const REWARD_TYPES = new Set(["item", "ach", "currency", "mount", "toy", "pet"]);

/** Reward tokens: each entry one whole link token, at most max (D93). */
function cleanRewards(
  raw: unknown,
  max: number,
  scope: MarkupScope,
  where: string,
): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new PlanError(`${where} must be an array of link tokens.`);
  const out: string[] = [];
  for (const [n, item] of raw.entries()) {
    const label = `${where} ${n + 1}`;
    if (out.length >= max) {
      scope.check.warnings?.push(`${where}: more than ${max}; the rest are dropped`);
      break;
    }
    const text = typeof item === "string" ? item.trim() : "";
    const parts = text ? parseMarkup(text) : [];
    const token = parts.length === 1 && typeof parts[0] !== "string" ? parts[0] : undefined;
    if (!token || token.raw !== text || !REWARD_TYPES.has(token.type)) {
      scope.check.warnings?.push(
        `${label}: must be one link token like {mount:ID} or {ach:ID}; dropped`,
      );
      continue;
    }
    const kept = cleanText(text, scope, label, { count: 0 });
    if (kept === text && !out.includes(text)) out.push(text);
  }
  return out.length > 0 ? out : undefined;
}

function cleanCondition(
  raw: unknown,
  index: number,
  scope: MarkupScope,
  used: { count: number },
): TaskCondition | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new PlanError(`Task ${index} condition must be an object with text.`);
  }
  const body = raw as Record<string, unknown>;
  const where = `Task ${index} condition`;
  const text = cardText(body.text, CARD_LIMITS.condition, scope, where, used);
  if (!text) throw new PlanError(`${where} needs text, such as "If you have 5,000 badges".`);
  const out: TaskCondition = { text };
  if (body.check !== undefined && body.check !== null) {
    const check = body.check as Record<string, unknown>;
    const kind = typeof check?.kind === "string" ? check.kind : "";
    const id = integer(check?.id, 1, 2_147_483_647);
    const atLeast =
      check?.atLeast === undefined ? undefined : integer(check.atLeast, 1, 2_000_000_000);
    if (!(CONDITION_KINDS as readonly string[]).includes(kind) || id === undefined) {
      throw new PlanError(
        `${where} check needs kind currency, item, level, quest or ach and a whole-number id.`,
      );
    }
    if (check?.atLeast !== undefined && atLeast === undefined) {
      throw new PlanError(`${where} check atLeast must be a positive whole number.`);
    }
    out.check = { kind: kind as ConditionKind, id };
    if (atLeast !== undefined) out.check.atLeast = atLeast;
  }
  return out;
}

type MarkupScope = {
  entities: Entities;
  npcs: Set<string>;
  check: MarkupCheck;
};

function markupScope(raw: unknown, check: MarkupCheck, where: string): MarkupScope {
  const { entities, issues } = cleanEntities(raw);
  for (const issue of issues) check.warnings?.push(`${where}: ${issue}`);
  return { entities, npcs: new Set(), check };
}

function cleanText(
  text: string,
  scope: MarkupScope,
  where: string,
  used: { count: number },
): string {
  const result = cleanMarkup(text, {
    entities: scope.entities,
    used,
    missing: scope.check.missing,
    npcs: scope.npcs,
  });
  for (const issue of result.issues) {
    scope.check.warnings?.push(`${where}: ${issue.raw} ${issue.problem}; kept the label only`);
  }
  return result.text;
}

/** Only the npcs some kept token links to. */
function usedEntities(scope: MarkupScope): Entities | undefined {
  const npc = scope.entities.npc;
  if (!npc) return undefined;
  const kept = Object.fromEntries(Object.entries(npc).filter(([id]) => scope.npcs.has(id)));
  return Object.keys(kept).length > 0 ? { npc: kept } : undefined;
}

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

/** Every `type:id` a raw plan's text links to, for the existence check before cleaning. */
export function planMarkupIds(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) return [];
  const body = raw as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const texts: unknown[] = [body.note, body.goal, body.details, ...list(body.rewards)];
  if (typeof body.contains === "object" && body.contains !== null) {
    for (const [key, values] of Object.entries(body.contains)) texts.push(key, ...list(values));
  }
  for (const item of list(body.tasks)) {
    const task = (item ?? {}) as Record<string, unknown>;
    const condition = (task.condition ?? {}) as Record<string, unknown>;
    texts.push(task.title, task.note, task.why, condition.text, ...list(task.rewards));
  }
  return texts.flatMap((item) => (typeof item === "string" ? markupIds(item) : []));
}

export function cleanPlan(raw: unknown, nowSeconds: number, check: MarkupCheck = {}): Plan {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PlanError("The plan must be a JSON object.");
  }
  const body = raw as Record<string, unknown>;
  const scope = markupScope(body.entities, check, "Plan");
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
  let budget: number | undefined;
  if (body.budget !== undefined && body.budget !== null) {
    budget = integer(body.budget, 5, 240);
    if (budget === undefined) {
      throw new PlanError("Budget must be a whole number of minutes from 5 to 240.");
    }
  }
  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") {
      throw new PlanError("The plan note must be a string.");
    }
    if (byteLength(body.note) > 400) {
      throw new PlanError("The plan note is longer than 400 bytes.");
    }
    note = cleanText(body.note, scope, "Plan note", { count: 0 }) || undefined;
  }
  if (!Array.isArray(body.tasks) || body.tasks.length < 1) {
    throw new PlanError("The plan has no tasks.");
  }
  if (body.tasks.length > 40) {
    throw new PlanError("Too many tasks (max 40).");
  }
  const title = cleanTitle(body.title, check);
  const goal = cardText(body.goal, CARD_LIMITS.goal, scope, "Plan goal", { count: 0 });
  const details = cardText(body.details, CARD_LIMITS.details, scope, "Plan details", {
    count: 0,
  });
  const rewards = cleanRewards(body.rewards, CARD_LIMITS.rewards, scope, "Plan reward");
  const tasks = cleanGroups(
    body.tasks.map((item, index) => cleanTask(item, index + 1, scope)),
    check,
  );
  const contains = cleanContains(body.contains, rewards, tasks, goal, details, scope);
  warnLooseContents(rewards, contains, check);
  const generatedAt =
    body.generatedAt === undefined ? nowSeconds : integer(body.generatedAt, 0, 4_000_000_000);
  if (generatedAt === undefined) {
    throw new PlanError("generatedAt must be a unix timestamp.");
  }
  const plan: Plan = { v: 1, kind: "plan", mode, note, generatedAt, tasks };
  if (budget !== undefined) plan.budget = budget;
  if (title !== undefined) plan.title = title;
  if (goal !== undefined) plan.goal = goal;
  if (details !== undefined) plan.details = details;
  if (rewards !== undefined) plan.rewards = rewards;
  if (contains !== undefined) plan.contains = contains;
  const entities = usedEntities(scope);
  if (entities) plan.entities = entities;
  return plan;
}

export const CONTAINS_MAX = 2;
export const CONTAINS_ITEMS = 6;
const CONTAINS_TYPES = new Set(["mount", "toy", "pet", "item"]);
const GROUP_RE = /^[a-z0-9-]{1,24}$/;

/** `{item:ID}` or `{item:ID|label}` as one token, else undefined. */
function singleToken(text: unknown) {
  if (typeof text !== "string") return undefined;
  const parts = parseMarkup(text.trim());
  const token = parts.length === 1 && typeof parts[0] !== "string" ? parts[0] : undefined;
  return token && token.raw === text.trim() ? token : undefined;
}

/**
 * Reward contents (ADR 0055): a container `{item:ID}` offered as a plan or
 * step reward, to 1-6 mount, toy, pet or item tokens. Values count toward the
 * 12-token limit shared with goal and details; anything invalid is a warning.
 */
function cleanContains(
  raw: unknown,
  rewards: string[] | undefined,
  tasks: Task[],
  goal: string | undefined,
  details: string | undefined,
  scope: MarkupScope,
): Record<string, string[]> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const warn = (line: string) => scope.check.warnings?.push(`Plan contains: ${line}`);
  if (typeof raw !== "object" || Array.isArray(raw)) {
    warn("must be an object from a reward token to a list of tokens; dropped");
    return undefined;
  }
  const offered = new Set<string>();
  for (const token of [...(rewards ?? []), ...tasks.flatMap((task) => task.rewards ?? [])]) {
    const parsed = singleToken(token);
    if (parsed?.type === "item") offered.add(`item:${parsed.id}`);
  }
  let room =
    MAX_TOKENS - (goal ? markupIds(goal).length : 0) - (details ? markupIds(details).length : 0);
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(raw as Record<string, unknown>)) {
    const container = singleToken(key);
    const ref = container ? `${container.type}:${container.id}` : "";
    if (!container || container.type !== "item" || !offered.has(ref)) {
      warn(`${key} must be an {item:ID} that is also a plan or step reward; dropped`);
      continue;
    }
    if (Object.keys(out).length >= CONTAINS_MAX) {
      warn(`more than ${CONTAINS_MAX} containers; ${key} dropped`);
      continue;
    }
    if (!Array.isArray(values) || values.length === 0) {
      warn(`${key} needs a list of 1 to ${CONTAINS_ITEMS} tokens; dropped`);
      continue;
    }
    const kept: string[] = [];
    const seen = new Set<string>([ref]);
    for (const value of values) {
      const token = singleToken(value);
      const id = token ? `${token.type}:${token.id}` : "";
      if (!token || !CONTAINS_TYPES.has(token.type)) {
        warn(
          `${key}: ${String(value).slice(0, 40)} must be one mount, toy, pet or item token; dropped`,
        );
        continue;
      }
      if (seen.has(id)) continue;
      if (kept.length >= CONTAINS_ITEMS) {
        warn(`${key}: more than ${CONTAINS_ITEMS} contents; the rest are dropped`);
        break;
      }
      if (room <= 0) {
        warn(`${key}: more than ${MAX_TOKENS} tokens with goal and details; the rest are dropped`);
        break;
      }
      const text = (value as string).trim();
      if (cleanText(text, scope, `Plan contains ${key}`, { count: 0 }) !== text) continue;
      seen.add(id);
      kept.push(text);
      room -= 1;
    }
    if (kept.length) out[container.raw] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/** D202: two or more mounts next to an item reward usually means a cage listed with its contents. */
function warnLooseContents(
  rewards: string[] | undefined,
  contains: Record<string, string[]> | undefined,
  check: MarkupCheck,
): void {
  const kinds = (rewards ?? []).map((token) => singleToken(token));
  const mounts = kinds.filter((token) => token?.type === "mount").length;
  const loose = kinds.some((token) => token?.type === "item" && !contains?.[token.raw]);
  if (mounts >= 2 && loose) {
    check.warnings?.push(
      "Plan rewards: 2+ mounts and an item without contains. If the item is a cage, chest or bag that drops, it is the reward and the mounts go in contains",
    );
  }
}

/** Step groups (ADR 0056): consecutive, at least 2; a lone or split group is dropped with a warning. */
function cleanGroups(tasks: Task[], check: MarkupCheck): Task[] {
  const runs = new Map<string, number>();
  const broken = new Set<string>();
  let previous: string | undefined;
  for (const task of tasks) {
    const group = task.group;
    if (group) {
      if (group !== previous && runs.has(group)) broken.add(group);
      runs.set(group, (runs.get(group) ?? 0) + 1);
    }
    previous = group;
  }
  for (const [group, count] of runs) {
    if (broken.has(group)) {
      check.warnings?.push(
        `Step group ${group}: its steps must be next to each other; group dropped`,
      );
    } else if (count < 2) {
      check.warnings?.push(`Step group ${group}: a group needs at least 2 steps; group dropped`);
    }
  }
  for (const task of tasks) {
    if (task.group && (broken.has(task.group) || (runs.get(task.group) ?? 0) < 2)) {
      delete task.group;
    }
  }
  return tasks;
}

function cleanTask(raw: unknown, index: number, scope: MarkupScope): Task {
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
  const used = { count: 0 };
  const title = cleanText(task.title.trim(), scope, `Task ${index} title`, used);
  if (!title) throw new PlanError(`Task ${index} needs a title.`);
  if (note !== undefined) note = cleanText(note, scope, `Task ${index} note`, used) || undefined;
  const why = cardText(task.why, CARD_LIMITS.why, scope, `Task ${index} why`, used);
  const condition = cleanCondition(task.condition, index, scope, used);
  const rewards = cleanRewards(
    task.rewards,
    CARD_LIMITS.stepRewards,
    scope,
    `Task ${index} reward`,
  );
  const waypoints = cleanWaypoints(task.waypoints, index);
  const complete = cleanComplete(task.complete, index, 1);
  const cleaned: Task = {
    id: task.id,
    title,
    estMinutes,
    complete,
  };
  if (mapID !== undefined) cleaned.mapID = mapID;
  if (x !== undefined && y !== undefined) {
    cleaned.x = x;
    cleaned.y = y;
  }
  if (note !== undefined) cleaned.note = note;
  if (why !== undefined) cleaned.why = why;
  if (rewards !== undefined) cleaned.rewards = rewards;
  if (condition !== undefined) cleaned.condition = condition;
  if (waypoints) cleaned.waypoints = waypoints;
  if (task.group !== undefined && task.group !== null) {
    if (typeof task.group === "string" && GROUP_RE.test(task.group)) cleaned.group = task.group;
    else
      scope.check.warnings?.push(
        `Task ${index} group: 1 to 24 lowercase letters, digits or hyphens; dropped`,
      );
  }
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
    generatedAt: plan.generatedAt,
    tasks: plan.tasks,
  };
  if (plan.budget !== undefined) payload.budget = plan.budget;
  if (plan.note !== undefined) payload.note = plan.note;
  for (const key of ["title", "goal", "details", "rewards", "contains"] as const) {
    if (plan[key] !== undefined) payload[key] = plan[key];
  }
  if (plan.entities !== undefined) payload.entities = plan.entities;
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
  /** The plan's own generatedAt (D190); absent from 0.9 clients. */
  generatedAt?: number;
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
  entities?: Entities;
  answeredAt: number;
};

export const ANSWER_MAX_BYTES = 1000;

export function cleanAnswer(
  message: unknown,
  waypoints: unknown,
  nowSeconds: number,
  entities?: unknown,
  check: MarkupCheck = {},
): Answer {
  if (typeof message !== "string" || !message.trim()) {
    throw new PlanError("message must be a non-empty string.");
  }
  if (byteLength(message.trim()) > ANSWER_MAX_BYTES) {
    throw new PlanError(`message must be at most ${ANSWER_MAX_BYTES} bytes.`);
  }
  const scope = markupScope(entities, check, "Answer");
  const text = cleanText(message.trim(), scope, "Answer", { count: 0 });
  if (!text) throw new PlanError("message must be a non-empty string.");
  const answer: Answer = { message: text, answeredAt: nowSeconds };
  const kept = usedEntities(scope);
  if (kept) answer.entities = kept;
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

const SUGGESTION_MAX_BYTES = 2_000;
const TOKEN_RE = /^\{[a-z]+:\d+(?:\|[^{}]*)?\}$/;

/** The Suggestion copied into a Request (D109). Advisory: a malformed copy is dropped, not refused. */
export function cleanSuggestion(raw: unknown): RequestSuggestion | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  if (byteLength(JSON.stringify(raw)) > SUGGESTION_MAX_BYTES) return null;
  const body = raw as Record<string, unknown>;
  const id = shortText(body.id, 120);
  const kind = shortText(body.kind, 20);
  const title = shortText(body.title, 160);
  const goal = shortText(body.goal, 400);
  if (!id || !kind || !title || !goal) return null;
  const rewards = Array.isArray(body.rewards)
    ? body.rewards.filter(
        (token): token is string => typeof token === "string" && TOKEN_RE.test(token),
      )
    : [];
  const out: RequestSuggestion = { id, kind, title, goal, rewards: rewards.slice(0, 3) };
  const why = shortText(body.why, 200);
  if (why) out.why = why;
  const mapID = integer(body.mapID, 1, 10_000_000);
  if (mapID !== undefined) out.mapID = mapID;
  const expiresAt = integer(body.expiresAt, 0, 4_000_000_000);
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  return out;
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
  let budget: number | null = null;
  // Item and question Requests carry no mode; older Companions sent "" and 60.
  const hasMode =
    type === "plan" || (body.mode !== undefined && body.mode !== null && body.mode !== "");
  if (hasMode) {
    if (typeof body.mode !== "string" || !REQUEST_MODES.has(body.mode)) {
      throw new PlanError("mode must be roam, quests, events, fun, or farm.");
    }
    mode = body.mode;
  }
  // Plans carry budget only when the player typed it in the custom form (ADR 0037).
  if (body.budget !== undefined && body.budget !== null) {
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
  const suggestionId = optionalText(body.suggestionId, "suggestionId", 120);
  const suggestion = cleanSuggestion(body.suggestion);
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
    suggestionId: suggestionId ?? suggestion?.id ?? null,
    suggestion,
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
  const out: ProgressPost = {
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
  if (progress.generatedAt !== undefined && progress.generatedAt !== null) {
    const stamp = integer(progress.generatedAt, 0, 4_000_000_000);
    if (stamp === undefined) throw new PlanError("progress.generatedAt must be a unix timestamp.");
    out.progress.generatedAt = stamp;
  }
  return out;
}
