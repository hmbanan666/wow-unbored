/** Entity markup in Step titles, notes and messages (packages/contracts/markup.md, ADR 0034). */

export const MARKUP_TYPES = ["item", "quest", "ach", "spell", "currency", "npc", "pin"] as const;
export type MarkupType = (typeof MARKUP_TYPES)[number];

/** Tokens per Step (title and note together) or per message. */
export const MAX_TOKENS = 12;
export const MAX_LABEL_BYTES = 80;
export const MAX_NPC_ENTITIES = 40;

export type NpcEntity = { name: string; mapID?: number; x?: number; y?: number };
/** The side table on a Plan or an answer: names stay out of the inline syntax. */
export type Entities = { npc?: Record<string, NpcEntity> };

export type MarkupToken = {
  type: MarkupType;
  raw: string;
  id?: number;
  mapID?: number;
  x?: number;
  y?: number;
  label?: string;
};

export type MarkupSegment = string | MarkupToken;

export type MarkupIssue = { raw: string; problem: string };

/** `{type:payload}` or `{type:payload|label}`; anything else is plain text. */
const TOKEN = /\{([a-z]+):([^{}|]*)(?:\|([^{}]*))?\}/g;
const ID = /^[1-9][0-9]{0,9}$/;
const PERCENT = /^[0-9]{1,3}(\.[0-9])?$/;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function positiveId(text: string): number | undefined {
  if (!ID.test(text)) return undefined;
  const id = Number(text);
  return id <= 2_147_483_647 ? id : undefined;
}

function percent(text: string): number | undefined {
  if (!PERCENT.test(text)) return undefined;
  const value = Number(text);
  return value <= 100 ? value : undefined;
}

function isType(value: string): value is MarkupType {
  return (MARKUP_TYPES as readonly string[]).includes(value);
}

/** Read one token. A problem means it must not render as a link. */
export function readToken(
  type: string,
  payload: string,
  label: string | undefined,
  raw: string,
): { token?: MarkupToken; problem?: string; label?: string } {
  const trimmed = label?.trim() || undefined;
  if (trimmed !== undefined && byteLength(trimmed) > MAX_LABEL_BYTES) {
    return { problem: `label longer than ${MAX_LABEL_BYTES} bytes`, label: undefined };
  }
  if (!isType(type)) return { problem: `unknown type ${type}`, label: trimmed };
  if (type === "pin") {
    const parts = payload.split(":");
    const mapID = parts.length === 3 ? positiveId(parts[0]) : undefined;
    const x = parts.length === 3 ? percent(parts[1]) : undefined;
    const y = parts.length === 3 ? percent(parts[2]) : undefined;
    if (mapID === undefined || x === undefined || y === undefined) {
      return { problem: "pin needs MAPID:X:Y with X and Y from 0 to 100", label: trimmed };
    }
    const token: MarkupToken = { type, raw, mapID, x, y };
    if (trimmed) token.label = trimmed;
    return { token };
  }
  const id = positiveId(payload);
  if (id === undefined) return { problem: `${type} needs a whole-number id`, label: trimmed };
  const token: MarkupToken = { type, raw, id };
  if (trimmed) token.label = trimmed;
  return { token };
}

/** Split text into plain strings and tokens; malformed tokens fall back to their label. */
export function parseMarkup(text: string): MarkupSegment[] {
  const out: MarkupSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const read = readToken(match[1], match[2], match[3], match[0]);
    if (read.token) out.push(read.token);
    else if (read.label) out.push(read.label);
    last = start + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The text with every token replaced by its label, for places that cannot show links. */
export function plainText(text: string, entities?: Entities): string {
  return parseMarkup(text)
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.label) return part.label;
      if (part.type === "npc" && part.id !== undefined) {
        return entities?.npc?.[String(part.id)]?.name ?? "";
      }
      return "";
    })
    .join("");
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim();
}

export type CleanMarkupOptions = {
  entities?: Entities;
  /** Tokens already used in the same Step; the shared cap is MAX_TOKENS. */
  used?: { count: number };
  /** Ids the Blizzard Game Data API says do not exist (`type:id`). */
  missing?: ReadonlySet<string>;
  /** Npc ids that kept their link, so unused entities can be dropped. */
  npcs?: Set<string>;
};

/** What the Server stores: valid tokens kept, every other one replaced by its label or dropped. */
export function cleanMarkup(
  text: string,
  options: CleanMarkupOptions = {},
): { text: string; issues: MarkupIssue[] } {
  const issues: MarkupIssue[] = [];
  const used = options.used ?? { count: 0 };
  let changed = false;
  const result = text.replace(TOKEN, (raw, type: string, payload: string, label?: string) => {
    const read = readToken(type, payload, label, raw);
    let problem = read.problem;
    const token = read.token;
    if (token && token.type === "npc" && !options.entities?.npc?.[String(token.id)]) {
      problem = "npc needs an entry in entities.npc";
    }
    if (token && !problem && token.id !== undefined) {
      const kind = token.type === "npc" ? "npc" : token.type;
      if (options.missing?.has(`${kind}:${token.id}`))
        problem = `${kind} ${token.id} does not exist`;
    }
    if (token && !problem && used.count >= MAX_TOKENS) problem = `more than ${MAX_TOKENS} tokens`;
    if (problem) {
      issues.push({ raw, problem });
      changed = true;
      return read.label ?? token?.label ?? "";
    }
    used.count += 1;
    if (token?.type === "npc") options.npcs?.add(String(token.id));
    return raw;
  });
  return { text: changed ? tidy(result) : result, issues };
}

/** Keep well-formed npc entries; report the rest. */
export function cleanEntities(raw: unknown): { entities: Entities; issues: string[] } {
  const issues: string[] = [];
  const entities: Entities = {};
  if (raw === undefined || raw === null) return { entities, issues };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { entities, issues: ["entities must be an object; dropped"] };
  }
  const npc = (raw as Record<string, unknown>).npc;
  if (npc === undefined || npc === null) return { entities, issues };
  if (typeof npc !== "object" || Array.isArray(npc)) {
    return { entities, issues: ["entities.npc must be an object; dropped"] };
  }
  const out: Record<string, NpcEntity> = {};
  for (const [key, value] of Object.entries(npc as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_NPC_ENTITIES) {
      issues.push(`entities.npc has more than ${MAX_NPC_ENTITIES} entries; the rest are dropped`);
      break;
    }
    const id = positiveId(key);
    const entry = value as Record<string, unknown> | null;
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (id === undefined || !entry || typeof entry !== "object" || !name) {
      issues.push(`entities.npc.${key} needs a whole-number id and a name; dropped`);
      continue;
    }
    if (byteLength(name) > MAX_LABEL_BYTES) {
      issues.push(`entities.npc.${key} name is longer than ${MAX_LABEL_BYTES} bytes; dropped`);
      continue;
    }
    const clean: NpcEntity = { name };
    const mapID = typeof entry.mapID === "number" ? positiveId(String(entry.mapID)) : undefined;
    const x = typeof entry.x === "number" && entry.x >= 0 && entry.x <= 100 ? entry.x : undefined;
    const y = typeof entry.y === "number" && entry.y >= 0 && entry.y <= 100 ? entry.y : undefined;
    if (mapID !== undefined) clean.mapID = mapID;
    if (mapID !== undefined && x !== undefined && y !== undefined) {
      clean.x = Math.round(x * 10) / 10;
      clean.y = Math.round(y * 10) / 10;
    } else if (entry.x !== undefined || entry.y !== undefined) {
      issues.push(`entities.npc.${key} needs mapID with x and y from 0 to 100; place dropped`);
    }
    out[String(id)] = clean;
  }
  if (Object.keys(out).length > 0) entities.npc = out;
  return { entities, issues };
}

/** Every id a text links to, for the existence check (`type:id`; npc ids are creatures). */
export function markupIds(text: string): string[] {
  const out: string[] = [];
  for (const part of parseMarkup(text)) {
    if (typeof part !== "string" && part.id !== undefined) out.push(`${part.type}:${part.id}`);
  }
  return out;
}
