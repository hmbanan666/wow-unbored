import {
  GAMES,
  guideTermsSchema,
  termParts,
  type GuideTerm,
  guideSourcesSchema,
  guideAsOfSchema,
  calloutSchema,
  tableSchema,
  faqSchema,
  structuredGuideBlocksSchema,
  type GuideTable,
  type GuideFaq,
  type Game,
  type GuideSource,
  type GuideAsOf,
  type Callout,
} from "@unbored/contracts/guide";
import {
  cleanHero,
  cleanFigure,
  cleanMediaOverrides,
  inlineMedia,
  type Hero,
  type Figure,
  type MediaOverrides,
} from "@unbored/contracts/game-media";
import type { BlizzardIds } from "./blizzard.ts";
import { planOutcomeSchema, type PlanOutcome } from "@unbored/contracts";
import { createHash } from "node:crypto";
import type { Db } from "./db.ts";
import { fromJson } from "./db.ts";
import type { GameDb } from "./game-db.ts";

/**
 * Authored site content: Paths, Collections and Guides in `content.paths` (ADR 0072,
 * 0074). Owners save a draft and publish it; every game id, zone and cost id
 * must exist in the Game DB build the draft was checked against. A published
 * version is never edited: a change is a new draft version.
 */

export const CONTENT_KINDS = ["path", "collection", "guide"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const ITEM_KINDS = ["mount", "pet", "toy", "achievement", "item"] as const;
export const PATH_GOAL_KINDS = [
  ...ITEM_KINDS,
  "rep",
  "renown",
  "level",
  "currency",
  "quest",
  "questLine",
] as const;
export type ItemKind = (typeof PATH_GOAL_KINDS)[number];
export type ContentTopic = { slug: string; title: string };
export const SOURCE_TYPES = [
  "vendor",
  "drop",
  "quest",
  "achievement",
  "reputation",
  "renown",
  "profession",
  "pvp",
  "event",
  "treasure",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
const TIERS = ["basic", "deeper", "complete"] as const;

export type ContentCost = { amount: number; currency?: number; item?: number; gold?: true };
export type ContentItem = {
  media?: MediaOverrides;
  kind: ItemKind;
  id?: number;
  standing?: number;
  level?: number;
  amount?: number;
  name: string;
  required: boolean;
  topic?: string;
  source: {
    type: SourceType;
    text: string;
    zone?: number;
    cost?: ContentCost[];
    achievement?: number;
  };
  chance: boolean;
  note: string;
  url?: string;
};
export type ContentBlock =
  | Figure
  | Callout
  | GuideTable
  | GuideFaq
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; label: string; href: string };
export type ContentDoc = {
  game: Game;
  terms?: GuideTerm[];
  sources?: GuideSource[];
  asOf?: GuideAsOf;
  hero?: Hero;
  kind: ContentKind;
  slug: string;
  locale: "en" | "ru";
  title: string;
  description: string;
  tier: (typeof TIERS)[number] | null;
  prerequisite: string | null;
  blocks: ContentBlock[];
  topics: ContentTopic[];
  items: ContentItem[];
};

export class ContentError extends Error {
  readonly problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(message);
    this.problems = problems;
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ITEMS = 100;
const MAX_BLOCKS = 40;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const out = value.trim();
  return out && out.length <= max ? out : undefined;
}

function positiveId(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) < 2 ** 31
    ? (value as number)
    : undefined;
}

function https(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 300 ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function localHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (
    ["/", "/paths", "/collections", "/guides", "/forever", "/install"].includes(value) ||
    /^\/(paths|collections|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  )
    return value;
  return https(value);
}

/** Inspect authored strings, not JSON delimiters such as a table row's closing brackets. */
function containsGameReference(value: unknown): boolean {
  if (typeof value === "string") return /\[\[|\]\]/.test(value);
  if (value && typeof value === "object") return Object.values(value).some(containsGameReference);
  return false;
}

/** The document's shape; game ids are checked separately against a build. */
export function parseContent(input: unknown): ContentDoc {
  const problems: string[] = [];
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = CONTENT_KINDS.includes(raw.kind as ContentKind)
    ? (raw.kind as ContentKind)
    : (problems.push("kind must be path, collection or guide"), "collection");
  const game =
    raw.game === undefined
      ? "retail"
      : GAMES.includes(raw.game as Game)
        ? (raw.game as Game)
        : (problems.push("game must be retail or forever"), "retail");
  const terms = raw.terms === undefined ? undefined : guideTermsSchema.safeParse(raw.terms);
  if (terms && !terms.success) problems.push("terms: invalid definitions or duplicate keys");
  if (terms && kind !== "guide") problems.push("terms belong to guides");
  const sources = raw.sources === undefined ? undefined : guideSourcesSchema.safeParse(raw.sources);
  const asOf = raw.asOf === undefined ? undefined : guideAsOfSchema.safeParse(raw.asOf);
  if (sources && !sources.success)
    problems.push(
      "sources: at most 20 entries with label (1-120 characters), absolute https url and accessed date (YYYY-MM-DD)",
    );
  if (asOf && !asOf.success)
    problems.push(
      "asOf: date (YYYY-MM-DD), build (1-60 characters), optional note (at most 200 characters)",
    );
  if (kind !== "guide" && (sources || asOf)) problems.push("sources and asOf belong to guides");
  if (game === "forever") {
    if (kind !== "guide") problems.push("WoW Forever supports guides only");
    if (raw.items !== undefined && (!Array.isArray(raw.items) || raw.items.length))
      problems.push("WoW Forever guides cannot have items");
    if (containsGameReference(raw))
      problems.push("WoW Forever guides cannot have inline game references");
  }
  if (terms?.success && terms.data.length) {
    if (!asOf?.success || !sources?.success || !sources.data.length)
      problems.push("terms need sources and asOf evidence");
    for (const term of terms.data) {
      if (!sources?.success || !sources.data.some((s) => s.url === term.source))
        problems.push(`term ${term.key}: source must be listed in sources`);
    }
  }
  const slug =
    typeof raw.slug === "string" && raw.slug.length <= 80 && SLUG.test(raw.slug)
      ? raw.slug
      : (problems.push("slug must be lowercase words joined by hyphens"), "x");
  const locale =
    raw.locale === undefined || raw.locale === "en"
      ? "en"
      : raw.locale === "ru"
        ? "ru"
        : (problems.push("locale must be en or ru"), "en");
  const title = text(raw.title, 120) ?? (problems.push("title: 1-120 characters"), "");
  const description =
    text(raw.description, 300) ?? (problems.push("description: 1-300 characters"), "");
  const tier =
    raw.tier === undefined || raw.tier === null
      ? null
      : TIERS.includes(raw.tier as (typeof TIERS)[number])
        ? (raw.tier as (typeof TIERS)[number])
        : (problems.push("tier must be basic, deeper or complete"), null);
  if (kind !== "path" && tier) problems.push(`a ${kind} has no tier`);
  if (kind === "path" && !tier) problems.push("a Path needs a tier");
  const prerequisite =
    raw.prerequisite === undefined || raw.prerequisite === null
      ? null
      : typeof raw.prerequisite === "string" &&
          raw.prerequisite.length <= 80 &&
          SLUG.test(raw.prerequisite)
        ? raw.prerequisite
        : (problems.push("prerequisite must be a slug"), null);
  if (kind !== "path" && prerequisite) problems.push(`a ${kind} has no prerequisite`);

  if (kind === "path") {
    if (tier === "basic" && prerequisite) problems.push("a Basic Path has no prerequisite");
    if ((tier === "deeper" || tier === "complete") && !prerequisite)
      problems.push("a deeper tier needs the previous tier as prerequisite");
    if (prerequisite === slug) problems.push("a Path cannot require itself");
  }

  const topics: ContentTopic[] = [];
  if (raw.topics !== undefined && !Array.isArray(raw.topics))
    problems.push("topics must be a list");
  const rawTopics = Array.isArray(raw.topics) ? raw.topics : [];
  if (rawTopics.length > 30) problems.push("at most 30 Topics");
  for (const value of rawTopics) {
    const row = (value ?? {}) as Record<string, unknown>;
    const title = text(row.title, 120);
    if (typeof row.slug !== "string" || row.slug.length > 80 || !SLUG.test(row.slug) || !title)
      problems.push("each Topic needs a slug and title");
    else if (topics.some((topic) => topic.slug === row.slug))
      problems.push(`repeated Topic ${row.slug}`);
    else topics.push({ slug: row.slug, title });
  }
  if (kind !== "path" && topics.length) problems.push("Topics belong to Paths");

  const hero = cleanHero(raw.hero);
  if (raw.hero !== undefined && !hero) problems.push("hero is not valid");
  if (game === "forever" && hero && !("image" in hero))
    problems.push("WoW Forever heroes must use own images");
  let inlineCount = 0;
  let termCount = 0;
  const usedTerms = new Set<string>();
  const blocks: ContentBlock[] = [];
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (rawBlocks.length > MAX_BLOCKS) problems.push(`at most ${MAX_BLOCKS} blocks`);
  rawBlocks.forEach((block, index) => {
    const row = (block ?? {}) as Record<string, unknown>;
    if (game === "forever" && row.type === "figure" && row.ref !== undefined)
      problems.push("WoW Forever figures must use own images");
    const structured =
      row.type === "table"
        ? tableSchema.safeParse(row)
        : row.type === "faq"
          ? faqSchema.safeParse(row)
          : undefined;
    if (structured && !structured.success) {
      for (const issue of structured.error.issues)
        problems.push(`blocks[${index}].${issue.path.join(".")}: ${issue.message}`);
      return;
    }
    if (structured && kind !== "guide")
      problems.push(`blocks[${index}]: tables and FAQ belong to guides`);
    const lines = structured?.success
      ? structured.data.type === "table"
        ? structured.data.rows.flat()
        : structured.data.entries.map((entry) => entry.a)
      : row.type === "paragraph"
        ? [row.text]
        : row.type === "list" && Array.isArray(row.items)
          ? row.items
          : [];
    const otherText =
      row.type === "heading" || row.type === "callout"
        ? row.text
        : row.type === "link"
          ? row.label
          : undefined;
    if (typeof otherText === "string" && /\{\{|\}\}/.test(otherText))
      problems.push(
        `blocks[${index}]: terms belong in paragraphs, lists, table cells or FAQ answers`,
      );
    for (const line of lines) {
      if (typeof line !== "string") continue;
      try {
        inlineCount += inlineMedia(line).length;
        const parts = termParts(line, terms?.success ? terms.data : []);
        for (const part of parts)
          if (part.term) {
            termCount++;
            usedTerms.add(part.term.key);
          }
      } catch {
        problems.push(`blocks[${index}]: invalid inline reference or term`);
      }
    }
    if (structured?.success) blocks.push(structured.data);
    else if (row.type === "callout" && calloutSchema.safeParse(row).success)
      blocks.push(calloutSchema.parse(row));
    else if (row.type === "figure" && cleanFigure(row)) blocks.push(cleanFigure(row)!);
    else if (row.type === "heading" && text(row.text, 120))
      blocks.push({ type: "heading", text: text(row.text, 120)! });
    else if (row.type === "paragraph" && text(row.text, 2000))
      blocks.push({ type: "paragraph", text: text(row.text, 2000)! });
    else if (
      row.type === "list" &&
      Array.isArray(row.items) &&
      row.items.length > 0 &&
      row.items.length <= 30 &&
      row.items.every((item) => text(item, 400))
    )
      blocks.push({ type: "list", items: row.items.map((item) => text(item, 400)!) });
    else if (row.type === "link" && text(row.label, 80) && localHref(row.href))
      blocks.push({ type: "link", label: text(row.label, 80)!, href: localHref(row.href)! });
    else
      problems.push(
        `blocks[${index}] is not a heading, paragraph, list, link, figure, callout, table or faq`,
      );
  });

  const structuredBlocks = structuredGuideBlocksSchema.safeParse(
    blocks.filter((block) => block.type === "table" || block.type === "faq"),
  );
  if (!structuredBlocks.success)
    problems.push(...structuredBlocks.error.issues.map((issue) => issue.message));
  if (termCount > 20) problems.push("at most 20 term mentions per page");
  if (terms?.success && terms.data.some((t) => !usedTerms.has(t.key)))
    problems.push("every term must be used in the guide");
  if (inlineCount > 20) problems.push("at most 20 inline references per page");
  const items: ContentItem[] = [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (rawItems.length > MAX_ITEMS) problems.push(`at most ${MAX_ITEMS} items`);
  const seen = new Set<string>();
  rawItems.forEach((value, index) => {
    const at = `items[${index}]`;
    const row = (value ?? {}) as Record<string, unknown>;
    const media = cleanMediaOverrides(row.media);
    if (row.media !== undefined && !media) problems.push(`${at}.media is not valid`);
    const source = (row.source ?? {}) as Record<string, unknown>;
    const allowedKinds: readonly string[] = kind === "path" ? PATH_GOAL_KINDS : ITEM_KINDS;
    const itemKind = allowedKinds.includes(String(row.kind)) ? (row.kind as ItemKind) : undefined;
    const required = row.required === undefined ? true : row.required;
    if (typeof required !== "boolean") problems.push(`${at}.required must be true or false`);
    const topic = typeof row.topic === "string" ? row.topic : undefined;
    if (row.topic !== undefined && !topics.some((entry) => entry.slug === topic))
      problems.push(`${at}.topic must name a Topic in this Path`);
    const id = positiveId(row.id);
    const name = text(row.name, 120);
    const type = SOURCE_TYPES.includes(source.type as SourceType)
      ? (source.type as SourceType)
      : undefined;
    const sourceText = text(source.text, 400);
    const note = text(row.note, 600);
    if (!itemKind) problems.push(`${at}.kind must be one of ${allowedKinds.join(", ")}`);
    if (itemKind === "level") {
      if (row.id !== undefined) problems.push(`${at}.level has no game id`);
    } else if (!id) problems.push(`${at}.id must be a positive integer`);
    if (!name) problems.push(`${at}.name is required`);
    if (!type) problems.push(`${at}.source.type must be one of ${SOURCE_TYPES.join(", ")}`);
    if (!sourceText) problems.push(`${at}.source.text is required`);
    if (!note) problems.push(`${at}.note is required (at most 600 characters)`);
    if (typeof row.chance !== "boolean") problems.push(`${at}.chance must be true or false`);
    const zone = source.zone === undefined ? undefined : positiveId(source.zone);
    if (source.zone !== undefined && !zone) problems.push(`${at}.source.zone must be a UiMap id`);
    const achievement =
      source.achievement === undefined ? undefined : positiveId(source.achievement);
    if (source.achievement !== undefined && !achievement)
      problems.push(`${at}.source.achievement must be an achievement id`);
    const cost: ContentCost[] = [];
    if (source.cost !== undefined) {
      if (!Array.isArray(source.cost) || source.cost.length > 4)
        problems.push(`${at}.source.cost must be a list of at most 4 parts`);
      else
        source.cost.forEach((part, partIndex) => {
          const p = (part ?? {}) as Record<string, unknown>;
          const amount = positiveId(p.amount);
          const currency = p.currency === undefined ? undefined : positiveId(p.currency);
          const item = p.item === undefined ? undefined : positiveId(p.item);
          const gold = p.gold === true;
          const kinds = Number(currency !== undefined) + Number(item !== undefined) + Number(gold);
          if (
            !amount ||
            kinds !== 1 ||
            (p.currency !== undefined && !currency) ||
            (p.item !== undefined && !item)
          )
            problems.push(
              `${at}.source.cost[${partIndex}] needs an amount and one of gold, currency or item`,
            );
          else
            cost.push({
              amount,
              ...(currency ? { currency } : {}),
              ...(item ? { item } : {}),
              ...(gold ? { gold: true as const } : {}),
            });
        });
    }
    const url = row.url === undefined ? undefined : https(row.url);
    if (row.url !== undefined && !url) problems.push(`${at}.url must be an https URL`);
    if (itemKind && id) {
      const key = `${itemKind}:${id}`;
      if (seen.has(key)) problems.push(`${at} repeats ${key}`);
      seen.add(key);
    }
    if (
      itemKind &&
      (id || itemKind === "level") &&
      name &&
      type &&
      sourceText &&
      note &&
      typeof row.chance === "boolean"
    ) {
      const item: ContentItem = {
        ...(media ? { media } : {}),
        kind: itemKind,
        ...(id ? { id } : {}),
        ...(row.standing !== undefined ? { standing: row.standing as number } : {}),
        ...(row.level !== undefined ? { level: row.level as number } : {}),
        ...(row.amount !== undefined ? { amount: row.amount as number } : {}),
        name,
        required: required === true,
        ...(topic ? { topic } : {}),
        source: {
          type,
          text: sourceText,
          ...(zone ? { zone } : {}),
          ...(cost.length ? { cost } : {}),
          ...(achievement ? { achievement } : {}),
        },
        chance: row.chance,
        note,
        ...(url ? { url } : {}),
      };
      if (itemKind !== "quest" && itemKind !== "questLine") {
        try {
          contentItemOutcome({ ...item, chance: false });
        } catch {
          problems.push(`${at}: invalid ${itemKind} outcome target or threshold`);
        }
      }
      for (const field of ["standing", "level", "amount"] as const) {
        const expected =
          field === "standing"
            ? itemKind === "rep"
            : field === "level"
              ? itemKind === "level" || itemKind === "renown"
              : itemKind === "currency";
        if (row[field] !== undefined && !expected)
          problems.push(`${at}.${field} does not belong to ${itemKind}`);
      }
      items.push(item);
    }
  });
  if (kind !== "guide" && rawItems.length === 0) problems.push("a Path or Collection needs items");
  if (problems.length) throw new ContentError("The content is not valid.", problems);
  return {
    game,
    ...(terms?.success ? { terms: terms.data } : {}),
    ...(sources?.success ? { sources: sources.data } : {}),
    ...(asOf?.success ? { asOf: asOf.data } : {}),
    kind,
    slug,
    locale,
    title,
    description,
    tier,
    prerequisite,
    blocks,
    topics,
    items,
    ...(hero ? { hero } : {}),
  };
}

/** Outcome candidates still need Plan checks; chance goals and quests cannot supply one. */
export function contentItemOutcome(item: ContentItem): PlanOutcome | undefined {
  if (item.chance || item.kind === "quest" || item.kind === "questLine") return undefined;
  const target =
    item.kind === "rep" || item.kind === "renown"
      ? { kind: item.kind, factionID: item.id, standing: item.standing, level: item.level }
      : item.kind === "currency"
        ? { kind: item.kind, currencyID: item.id, amount: item.amount }
        : item.kind === "achievement"
          ? { kind: item.kind, achievementID: item.id }
          : { kind: item.kind, id: item.id, level: item.level };
  return planOutcomeSchema.parse(target);
}

const GAME_KEY: Record<ItemKind, string> = {
  mount: "mount",
  pet: "pet",
  toy: "toy",
  achievement: "ach",
  item: "item",
  quest: "quest",
  questLine: "questLine",
  rep: "faction",
  renown: "faction",
  level: "level",
  currency: "currency",
};

/** Names the Game DB holds for an item kind: [table, field, id field]. */
async function gameName(
  game: GameDb,
  item: ContentItem,
  build: string,
  api?: BlizzardIds,
  signal?: AbortSignal,
) {
  if (item.kind === "level") return undefined;
  if (item.kind === "rep" || item.kind === "renown")
    return (await game.row("Faction", item.id!, "enUS", build))?.fields.Name_lang;
  if (item.kind === "currency")
    return (await game.row("CurrencyTypes", item.id!, "enUS", build))?.fields.Name_lang;
  if (item.kind === "questLine")
    return (await game.row("QuestLine", item.id!, "enUS", build))?.fields.Name_lang;
  if (item.kind === "quest")
    return (await game.questName(item.id!, "enUS", build, api, signal)).name ?? undefined;
  if (item.kind === "mount")
    return (await game.row("Mount", item.id!, "enUS", build))?.fields.Name_lang;
  if (item.kind === "achievement")
    return (await game.row("Achievement", item.id!, "enUS", build))?.fields.Title_lang;
  if (item.kind === "item" || item.kind === "toy")
    return (await game.row("ItemSparse", item.id!, "enUS", build))?.fields.Display_lang;
  return undefined; // Battle pet names are not in the imported fields.
}

/** Every id, zone and cost id against one build; English names must match it. */
export async function checkContentIds(
  doc: ContentDoc,
  game: GameDb,
  api?: BlizzardIds,
): Promise<string | null> {
  if (doc.game === "forever") return null;
  const build = await game.currentBuild();
  if (!build) throw new ContentError("The Game DB is not imported yet.");
  const nameDeadline = AbortSignal.timeout(10_000);
  const problems: string[] = [];
  for (const [index, item] of doc.items.entries()) {
    const at = `items[${index}] ${item.name}`;
    const table =
      item.kind === "questLine"
        ? "QuestLine"
        : item.kind === "rep" || item.kind === "renown"
          ? "Faction"
          : undefined;
    const keys = table || item.kind === "level" ? [] : [`${GAME_KEY[item.kind]}:${item.id}`];
    if (table && !(await game.row(table, item.id!, "enUS", build)))
      problems.push(`${at}: ${GAME_KEY[item.kind]}:${item.id} is not in build ${build}`);
    if (item.source.zone) keys.push(`zone:${item.source.zone}`);
    if (item.source.achievement) keys.push(`ach:${item.source.achievement}`);
    for (const part of item.source.cost ?? []) {
      if (part.currency) keys.push(`currency:${part.currency}`);
      if (part.item) keys.push(`item:${part.item}`);
    }
    const missing = await game.missing(keys, build);
    for (const key of missing) problems.push(`${at}: ${key} is not in build ${build}`);
    if (missing.size === 0 && doc.locale === "en") {
      const name = await gameName(game, item, build, api, nameDeadline);
      if (name !== undefined && String(name) !== item.name)
        problems.push(`${at}: the game calls ${item.kind}:${item.id} "${String(name)}"`);
    }
  }
  if (problems.length) throw new ContentError("Some ids are not in the Game DB.", problems);
  return build;
}

type Row = {
  published_at: number | string | null;
  game: Game;
  id: number | string;
  version: number;
  status: string;
  title: string;
  description: string;
  tier: string | null;
  prerequisite_slug: string | null;
  body: unknown;
};

type Body = {
  terms?: GuideTerm[];
  sources?: GuideSource[];
  asOf?: GuideAsOf;
  hero?: Hero;
  topics?: ContentTopic[];
  blocks: ContentBlock[];
  items: ContentItem[];
  build: string | null;
  hash: string;
};

function hashOf(doc: ContentDoc): string {
  const { kind, slug, locale, topics, game, ...rest } = doc;
  // Omitted defaults keep hashes compatible with publications written before Path fields.
  const normalized = {
    ...rest,
    ...(game === "forever" ? { game } : {}),
    items: rest.items.map(({ required, ...item }) => (required ? item : { ...item, required })),
    ...(topics.length ? { topics } : {}),
  };
  return createHash("sha256")
    .update(JSON.stringify([kind, slug, locale, normalized]))
    .digest("hex");
}

export type SaveResult = {
  game: Game;
  kind: ContentKind;
  slug: string;
  locale: string;
  version: number;
  status: "draft" | "published";
  unchanged: boolean;
  build: string | null;
  items: number;
};

/** Drafts and publishing in Postgres. SQLite Servers have no site content. */
export class ContentStore {
  private readonly db: Db;
  private readonly game: GameDb;
  private readonly now: () => number;
  private readonly gameIds?: BlizzardIds;
  private readonly onPublish?: (page: SaveResult) => void;

  constructor(
    db: Db,
    game: GameDb,
    now: () => number = () => Math.floor(Date.now() / 1000),
    gameIds?: BlizzardIds,
    onPublish?: (page: SaveResult) => void,
  ) {
    this.db = db;
    this.game = game;
    this.now = now;
    this.gameIds = gameIds;
    this.onPublish = onPublish;
  }

  get available(): boolean {
    return this.db.pg;
  }

  /** Only live Paths and Collections participate in Character progress. */
  async publishedPaths() {
    if (!this.available) return [];
    const rows = await this.db.all<
      Row & { kind: "path" | "collection"; slug: string; locale: string }
    >(
      `SELECT id, kind, slug, locale, version, status, title, description, tier, prerequisite_slug, body
       FROM content.paths WHERE status = 'published' AND kind IN ('path', 'collection')
       ORDER BY kind, slug, locale`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      slug: row.slug,
      locale: row.locale,
      version: row.version,
      title: row.title,
      build: fromJson<Body & { build: string }>(row.body)!.build,
      items: fromJson<Body>(row.body)!.items,
    }));
  }

  private async rows(kind: ContentKind, slug: string, locale: string): Promise<Row[]> {
    return this.db.all<Row>(
      `SELECT id, game, version, status, title, description, tier, prerequisite_slug, body, published_at
       FROM content.paths WHERE kind = ? AND slug = ? AND locale = ?
       ORDER BY version DESC`,
      kind,
      slug,
      locale,
    );
  }

  private async checkPrerequisite(doc: ContentDoc) {
    if (!doc.prerequisite) return;
    const previous = (await this.rows("path", doc.prerequisite, doc.locale)).find(
      (row) => row.status === "published",
    );
    const expected = doc.tier === "complete" ? "deeper" : "basic";
    if (!previous || previous.tier !== expected)
      throw new ContentError("The prerequisite is not valid.", [
        `prerequisite must be a published ${expected} Path in ${doc.locale}`,
      ]);
  }

  /** Latest version by default; an explicit version also reads retired publications. */
  async read(kind: ContentKind, slug: string, locale: "en" | "ru" = "en", version?: number) {
    if (!this.available) throw new ContentError("Site content needs the Postgres Server.");
    const rows = await this.rows(kind, slug, locale);
    const row = version === undefined ? rows[0] : rows.find((row) => row.version === version);
    if (!row) return null;
    const body = fromJson<Body>(row.body)!;
    // Retired versions retain their publication time; draft edits are not publications.
    const firstPublished = [...rows].reverse().find((version) => version.published_at !== null);
    return {
      publishedAt: firstPublished ? Number(firstPublished.published_at) : null,
      id: Number(row.id),
      version: row.version,
      status: row.status,
      build: body.build,
      document: {
        game: row.game,
        ...(body.terms ? { terms: body.terms } : {}),
        ...(body.sources ? { sources: body.sources } : {}),
        ...(body.asOf ? { asOf: body.asOf } : {}),
        kind,
        slug,
        locale,
        title: row.title,
        description: row.description,
        tier: row.tier,
        prerequisite: row.prerequisite_slug,
        ...(body.hero ? { hero: body.hero } : {}),
        blocks: body.blocks,
        topics: body.topics ?? [],
        items: body.items,
      },
    };
  }

  /** Saves a checked draft. The same document again changes nothing. */
  async saveDraft(input: unknown): Promise<SaveResult> {
    if (!this.available) throw new ContentError("Site content needs the Postgres Server.");
    const doc = parseContent(input);
    const build = await checkContentIds(doc, this.game, this.gameIds);
    const hash = hashOf(doc);
    const body: Body = {
      ...(doc.terms ? { terms: doc.terms } : {}),
      ...(doc.sources ? { sources: doc.sources } : {}),
      ...(doc.asOf ? { asOf: doc.asOf } : {}),
      ...(doc.hero ? { hero: doc.hero } : {}),
      topics: doc.topics,
      blocks: doc.blocks,
      items: doc.items,
      build,
      hash,
    };
    return this.db.tx(async () => {
      await this.db.lockKey(`content:${doc.kind}:${doc.slug}:${doc.locale}`);
      await this.checkPrerequisite(doc);
      const rows = await this.rows(doc.kind, doc.slug, doc.locale);
      const result = (version: number, status: "draft" | "published", unchanged: boolean) => ({
        game: doc.game,
        kind: doc.kind,
        slug: doc.slug,
        locale: doc.locale,
        version,
        status,
        unchanged,
        build,
        items: doc.items.length,
      });
      const live = rows.find((row) => row.status === "draft" || row.status === "published");
      const draft = rows[0]?.status === "draft" ? rows[0] : undefined;
      if (live && fromJson<Body>(live.body)?.hash === hash)
        return result(live.version, live.status as "draft" | "published", true);
      const fields = [
        doc.game,
        doc.title,
        doc.description,
        doc.tier,
        doc.prerequisite,
        JSON.stringify(body),
        this.now(),
      ];
      if (draft) {
        await this.db.run(
          `UPDATE content.paths SET game = ?, title = ?, description = ?, tier = ?, prerequisite_slug = ?,
             body = CAST(? AS jsonb), updated_at = ? WHERE id = ?`,
          ...fields,
          Number(draft.id),
        );
        return result(draft.version, "draft", false);
      }
      const version = (rows[0]?.version ?? 0) + 1;
      await this.db.run(
        `INSERT INTO content.paths
           (kind, slug, locale, game, title, description, tier, prerequisite_slug, body, updated_at, version, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, 'draft')`,
        doc.kind,
        doc.slug,
        doc.locale,
        ...fields,
        version,
      );
      return result(version, "draft", false);
    });
  }

  /** Publishes the newest draft after checking its ids again; retires the old version. */
  async publish(kind: ContentKind, slug: string, locale: "en" | "ru" = "en"): Promise<SaveResult> {
    if (!this.available) throw new ContentError("Site content needs the Postgres Server.");
    const result = await this.db.tx<SaveResult>(async () => {
      await this.db.lockKey(`content:${kind}:${slug}:${locale}`);
      const rows = await this.rows(kind, slug, locale);
      const newest = rows[0];
      if (!newest) throw new ContentError("No such content.");
      const stored = fromJson<Body>(newest.body)!;
      if (newest.status === "published")
        return {
          kind,
          slug,
          locale,
          game: newest.game,
          version: newest.version,
          status: "published",
          unchanged: true,
          build: stored.build,
          items: stored.items.length,
        };
      if (newest.status !== "draft") throw new ContentError("Nothing to publish.");
      const doc = parseContent({
        game: newest.game,
        terms: stored.terms,
        sources: stored.sources,
        asOf: stored.asOf,
        kind,
        slug,
        locale,
        title: newest.title,
        description: newest.description,
        tier: newest.tier,
        prerequisite: newest.prerequisite_slug,
        topics: stored.topics,
        ...(stored.hero ? { hero: stored.hero } : {}),
        blocks: stored.blocks,
        items: stored.items,
      });
      await this.checkPrerequisite(doc);
      const build = await checkContentIds(doc, this.game, this.gameIds);
      const now = this.now();
      await this.db.run(
        `UPDATE content.paths SET status = 'retired', updated_at = ?
         WHERE kind = ? AND slug = ? AND locale = ? AND status = 'published'`,
        now,
        kind,
        slug,
        locale,
      );
      await this.db.run(
        `UPDATE content.paths SET status = 'published', published_at = ?, updated_at = ?,
           body = jsonb_set(body, '{build}', COALESCE(to_jsonb(CAST(? AS text)), 'null'::jsonb)) WHERE id = ?`,
        now,
        now,
        build,
        Number(newest.id),
      );
      return {
        kind,
        slug,
        locale,
        game: newest.game,
        version: newest.version,
        status: "published",
        unchanged: false,
        build,
        items: doc.items.length,
      };
    });
    // Media work starts after commit and never delays or fails publication.
    try {
      if (result.game === "retail") this.onPublish?.(result);
    } catch {
      /* A later manual sync can retry. */
    }
    return result;
  }
}
