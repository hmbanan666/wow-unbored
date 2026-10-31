import { unpackIds } from "@unbored/contracts";

import type { SectionRow } from "./data.ts";
import {
  achievementProgress,
  loadCatalog,
  openChains,
  openEvents,
  type Catalog,
} from "./suggestions.ts";
import type { TasteRow } from "./taste.ts";

/**
 * Ready now (docs/adr/0052): what a Character can do or finish now, by fixed
 * rules over its own Sections. Every id comes from a Section; nothing is guessed.
 */
export const READY_MAX_ITEMS = 25;
export const READY_MAX_ALTS = 5;
export const READY_MAX_CHAINS = 5;
/** Achievements at least this far along are listed (D182). */
export const READY_ACH_RATIO = 0.7;
const DAY = 86_400;

/** D186. TODO: `vaultSlot` and `key` are not in the decision's table; the owner picks their scores. */
export const READY_SCORE = {
  rewardWaiting: 100,
  event: 90,
  lockout: 80,
  lockoutResetsSoon: 10,
  renownWithReward: 75,
  achievementBase: 70,
  achievementRange: 30,
  vaultSlot: 70,
  currencyCap: 65,
  renown: 60,
  chain: 60,
  key: 55,
  standing: 50,
  weeklyRoom: 40,
} as const;

/**
 * Enum.WeeklyRewardChestThresholdType, from
 * https://warcraft.wiki.gg/wiki/Enum.WeeklyRewardChestThresholdType (read 2026-10-31):
 * 0 None, 1 Activities, 2 RankedPvP, 3 Raid, 4 AlsoReceive, 5 Concession, 6 World.
 */
const VAULT_TYPES: Record<number, string> = {
  1: "Activities",
  2: "RankedPvP",
  3: "Raid",
  4: "AlsoReceive",
  5: "Concession",
  6: "World",
};

/** The highest classic reaction (Exalted). */
const TOP_REACTION = 8;

/** Sections the rules read; absent ones are listed in `missing`. */
export const READY_SECTIONS = [
  "reputation",
  "achProgress",
  "lockouts",
  "vault",
  "mplus",
  "currencies",
  "questLines",
  "calendar",
] as const;

export type ReadyKind =
  | "vault"
  | "paragon"
  | "lockout"
  | "achievement"
  | "renown"
  | "standing"
  | "currency"
  | "chain"
  | "event"
  | "key";

export type ReadyItem = {
  kind: ReadyKind;
  key: string;
  title?: string;
  tokens: string[];
  have?: number;
  need?: number;
  left?: number;
  resetAt?: number;
  why: string;
  score: number;
  /** The Section the item came from. */
  source: string;
};

export type ReadyAlt = { achievementID: number; character: string; d: number; t: number };

export type ReadyNow = {
  character: string;
  realm: string;
  account: string;
  computedAt: number;
  items: ReadyItem[];
  taste: TasteRow[];
  alts: ReadyAlt[];
  missing: string[];
};

/** Taste categories of the item kinds that are also idea kinds (D191). */
const TASTE_CATEGORY: Partial<Record<ReadyKind, string>> = {
  achievement: "achievement",
  chain: "chain",
  event: "event",
};

type Raw = Record<string, unknown>;

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function list(value: unknown): Raw[] {
  return Array.isArray(value)
    ? value.filter((item): item is Raw => typeof item === "object" && item !== null)
    : [];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function reputationItems(section: SectionRow | undefined): ReadyItem[] {
  if (!section) return [];
  const out: ReadyItem[] = [];
  for (const row of list(section.body.renown)) {
    const factionID = num(row.factionID);
    const earned = num(row.earned);
    const threshold = num(row.threshold);
    if (factionID === undefined || earned === undefined || !threshold || row.max === true) continue;
    const left = threshold - earned;
    if (left <= 0 || left > threshold * 0.25) continue;
    const rewards = list(row.next);
    const tokens: string[] = [];
    for (const reward of rewards) {
      const mountID = num(reward.mountID);
      const itemID = num(reward.itemID);
      const spellID = num(reward.spellID);
      if (mountID) tokens.push(`{mount:${mountID}}`);
      else if (itemID) tokens.push(`{item:${itemID}}`);
      else if (spellID) tokens.push(`{spell:${spellID}}`);
    }
    const gear = rewards.some((reward) => num(reward.mountID) || num(reward.itemID));
    const level = num(row.level);
    out.push({
      kind: "renown",
      key: `renown:${factionID}`,
      tokens,
      have: earned,
      need: threshold,
      left,
      why: level === undefined ? `${left} to the next renown` : `${left} to renown ${level + 1}`,
      score: gear ? READY_SCORE.renownWithReward : READY_SCORE.renown,
      source: "reputation",
    });
  }
  for (const row of list(section.body.factions)) {
    const factionID = num(row.factionID);
    if (factionID === undefined) continue;
    const paragon = row.paragon as Raw | undefined;
    if (paragon && typeof paragon === "object") {
      if (paragon.pending === true) {
        const questID = num(paragon.questID);
        out.push({
          kind: "paragon",
          key: `paragon:${factionID}`,
          tokens: questID ? [`{quest:${questID}}`] : [],
          why: "A paragon reward is waiting",
          score: READY_SCORE.rewardWaiting,
          source: "reputation",
        });
      }
      continue;
    }
    const friendship = row.friendship as Raw | undefined;
    let have: number | undefined;
    let step: number | undefined;
    if (friendship && typeof friendship === "object") {
      const standing = num(friendship.standing);
      const from = num(friendship.threshold);
      const to = num(friendship.next);
      if (standing === undefined || from === undefined || to === undefined) continue;
      have = standing - from;
      step = to - from;
    } else {
      const reaction = num(row.reaction);
      const standing = num(row.standing);
      const from = num(row.min);
      const to = num(row.max);
      if (reaction === undefined || reaction >= TOP_REACTION) continue;
      if (standing === undefined || from === undefined || to === undefined) continue;
      have = standing - from;
      step = to - from;
    }
    if (step <= 0 || have < 0) continue;
    const left = step - have;
    if (left <= 0 || left > step * 0.15) continue;
    out.push({
      kind: "standing",
      key: `standing:${factionID}`,
      tokens: [],
      have,
      need: step,
      left,
      why: `${left} to the next standing`,
      score: READY_SCORE.standing,
      source: "reputation",
    });
  }
  return out;
}

function lockoutItems(section: SectionRow | undefined, now: number): ReadyItem[] {
  const out: ReadyItem[] = [];
  for (const row of list(section?.body.instances)) {
    const bosses = num(row.bosses);
    const killed = num(row.killed) ?? 0;
    const resetAt = num(row.resetAt);
    if (row.locked !== true || !bosses || killed >= bosses) continue;
    if (resetAt !== undefined && resetAt <= now) continue;
    const name = typeof row.name === "string" ? row.name : undefined;
    const left = bosses - killed;
    const soon = resetAt !== undefined && resetAt - now <= 2 * DAY;
    out.push({
      kind: "lockout",
      key: `lockout:${num(row.instanceID) ?? name ?? "?"}:${num(row.difficultyID) ?? 0}`,
      ...(name ? { title: name } : {}),
      tokens: [],
      have: killed,
      need: bosses,
      left,
      ...(resetAt !== undefined ? { resetAt } : {}),
      why: `${left} of ${bosses} bosses left`,
      score: READY_SCORE.lockout + (soon ? READY_SCORE.lockoutResetsSoon : 0),
      source: "lockouts",
    });
  }
  return out;
}

function vaultItems(section: SectionRow | undefined): ReadyItem[] {
  if (!section) return [];
  const out: ReadyItem[] = [];
  if (section.body.rewardWaiting === true) {
    out.push({
      kind: "vault",
      key: "vault:reward",
      tokens: [],
      why: "The Great Vault has a reward waiting",
      score: READY_SCORE.rewardWaiting,
      source: "vault",
    });
  }
  // The first open slot per activity type is the next one.
  const next = new Map<number, Raw>();
  for (const row of list(section.body.activities)) {
    const type = num(row.type);
    const threshold = num(row.threshold);
    const progress = num(row.progress) ?? 0;
    if (type === undefined || !threshold || progress >= threshold) continue;
    const seen = next.get(type);
    if (!seen || (num(seen.threshold) ?? 0) > threshold) next.set(type, row);
  }
  for (const [type, row] of next) {
    const threshold = num(row.threshold)!;
    const progress = num(row.progress) ?? 0;
    const left = threshold - progress;
    if (left > 2) continue;
    const name = VAULT_TYPES[type] ?? `type ${type}`;
    out.push({
      kind: "vault",
      key: `vault:${type}:${num(row.index) ?? 0}`,
      tokens: [],
      have: progress,
      need: threshold,
      left,
      why: `${left} more for the next slot (${name})`,
      score: READY_SCORE.vaultSlot,
      source: "vault",
    });
  }
  return out;
}

function keyItems(section: SectionRow | undefined): ReadyItem[] {
  const level = num(section?.body.keyLevel);
  if (!level) return [];
  return [
    {
      kind: "key",
      key: "mplus:key",
      tokens: [],
      have: level,
      why: `Your key +${level}`,
      score: READY_SCORE.key,
      source: "mplus",
    },
  ];
}

function currencyItems(section: SectionRow | undefined): ReadyItem[] {
  const out: ReadyItem[] = [];
  for (const row of list(section?.body.list)) {
    const id = num(row.id);
    const quantity = num(row.quantity) ?? 0;
    const max = num(row.max);
    const week = num(row.week) ?? 0;
    const weekMax = num(row.weekMax);
    if (id === undefined) continue;
    if (max && quantity >= max * 0.9) {
      out.push({
        kind: "currency",
        key: `cap:${id}`,
        tokens: [`{currency:${id}}`],
        have: quantity,
        need: max,
        left: Math.max(0, max - quantity),
        why: "Spend some before you hit the cap",
        score: READY_SCORE.currencyCap,
        source: "currencies",
      });
    }
    if (weekMax && weekMax > 0 && week < weekMax) {
      out.push({
        kind: "currency",
        key: `week:${id}`,
        tokens: [`{currency:${id}}`],
        have: week,
        need: weekMax,
        left: weekMax - week,
        why: `${weekMax - week} more can be earned this week`,
        score: READY_SCORE.weeklyRoom,
        source: "currencies",
      });
    }
  }
  return out;
}

function achievementItems(sections: Map<string, SectionRow>): ReadyItem[] {
  return achievementProgress(sections)
    .filter((row) => row.ratio >= READY_ACH_RATIO)
    .map((row) => ({
      kind: "achievement" as const,
      key: `ach:${row.id}`,
      tokens: [`{ach:${row.id}}`],
      have: row.d,
      need: row.t,
      left: row.t - row.d,
      why: `${row.d} of ${row.t} done`,
      score:
        READY_SCORE.achievementBase +
        (READY_SCORE.achievementRange * (row.ratio - READY_ACH_RATIO)) / (1 - READY_ACH_RATIO),
      source: "achProgress",
    }));
}

function chainItems(sections: Map<string, SectionRow>): ReadyItem[] {
  return openChains(sections)
    .sort((a, b) => b.done / b.total - a.done / a.total || a.questLineID - b.questLineID)
    .slice(0, READY_MAX_CHAINS)
    .map((line) => ({
      kind: "chain" as const,
      key: `chain:${line.questLineID}`,
      title: line.title,
      tokens: line.nextQuestID !== undefined ? [`{quest:${line.nextQuestID}}`] : [],
      have: line.done,
      need: line.total,
      left: line.total - line.done,
      why: `Continue: ${line.done} of ${line.total} done`,
      score: READY_SCORE.chain,
      source: "questLines",
    }));
}

function eventItems(sections: Map<string, SectionRow>, now: number, catalog: Catalog): ReadyItem[] {
  return openEvents(sections, now, catalog)
    .filter((event) => !event.upcoming)
    .map((event) => ({
      kind: "event" as const,
      key: `event:${event.holiday.id}`,
      title: event.name,
      tokens: event.rewards,
      left: event.left,
      resetAt: event.ends,
      why: `On now: ${plural(event.left, "thing")} left`,
      score: READY_SCORE.event,
      source: "calendar",
    }));
}

/** D210: achievements another Character of the Account is at least 0.2 further along on. */
export function readyAlts(
  sections: Map<string, SectionRow>,
  others: { name: string; sections: Map<string, SectionRow> }[],
): ReadyAlt[] {
  const mine = new Map(achievementProgress(sections).map((row) => [row.id, row.ratio]));
  const earned = new Set<number>();
  for (const name of ["achievements", "achievementsMine"]) {
    for (const id of unpackIds(sections.get(name)?.body.ids)) earned.add(id);
  }
  const best = new Map<number, ReadyAlt & { ratio: number }>();
  for (const other of others) {
    for (const row of achievementProgress(other.sections)) {
      if (row.ratio < 0.5 || earned.has(row.id)) continue;
      if (row.ratio < (mine.get(row.id) ?? 0) + 0.2) continue;
      const seen = best.get(row.id);
      if (!seen || seen.ratio < row.ratio) {
        best.set(row.id, {
          achievementID: row.id,
          character: other.name,
          d: row.d,
          t: row.t,
          ratio: row.ratio,
        });
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => b.ratio - a.ratio || a.achievementID - b.achievementID)
    .slice(0, READY_MAX_ALTS)
    .map(({ ratio: _ratio, ...alt }) => alt);
}

export function readyNow(input: {
  character: string;
  realm: string;
  account: string;
  sections: Map<string, SectionRow>;
  others?: { name: string; sections: Map<string, SectionRow> }[];
  taste?: TasteRow[];
  now: number;
  catalog?: Catalog;
}): ReadyNow {
  const { sections, now } = input;
  const catalog = input.catalog ?? loadCatalog();
  const bonus = new Map((input.taste ?? []).map((row) => [row.category, row.bonus]));
  const items = [
    ...vaultItems(sections.get("vault")),
    ...reputationItems(sections.get("reputation")),
    ...lockoutItems(sections.get("lockouts"), now),
    ...achievementItems(sections),
    ...currencyItems(sections.get("currencies")),
    ...chainItems(sections),
    ...eventItems(sections, now, catalog),
    ...keyItems(sections.get("mplus")),
  ];
  for (const item of items) {
    const category = TASTE_CATEGORY[item.kind];
    item.score = Math.round(item.score + (category ? (bonus.get(category) ?? 0) : 0));
  }
  // Stable: equal scores keep each rule's own order (chains most finished first).
  items.sort((a, b) => b.score - a.score);
  return {
    character: input.character,
    realm: input.realm,
    account: input.account,
    computedAt: now,
    items: items.slice(0, READY_MAX_ITEMS),
    taste: input.taste ?? [],
    alts: readyAlts(sections, input.others ?? []),
    missing: READY_SECTIONS.filter((name) => !sections.has(name)),
  };
}
