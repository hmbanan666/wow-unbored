import { parseMarkup, type Plan } from "@unbored/contracts";

import type { SectionChange } from "./data.ts";

/**
 * Wins (docs/adr/0054): something a plan promised that game data later shows
 * newly obtained. Only plan targets count, never the Done button.
 */
export type WinKind = "mount" | "ach" | "toy" | "pet" | "item" | "quest";
export const WIN_KINDS: WinKind[] = ["mount", "ach", "toy", "pet", "item", "quest"];
/** Plans older than this give no wins (D195). */
export const WIN_PLAN_DAYS = 30;

export type WinTarget = { kind: WinKind; id: number; token: string };

const TOKEN_KINDS = new Set<WinKind>(["mount", "ach", "toy", "pet", "item"]);

/** The Sections each kind is read from (D193). */
export const WIN_SECTIONS: Record<string, WinKind> = {
  mounts: "mount",
  toys: "toy",
  pets: "pet",
  achievements: "ach",
  achievementsMine: "ach",
  questsDone: "quest",
  bags: "item",
  bank: "item",
  reagentBank: "item",
  warband: "item",
};

function tokenTarget(text: string): WinTarget | undefined {
  const parts = parseMarkup(text.trim());
  const token = parts.length === 1 && typeof parts[0] !== "string" ? parts[0] : undefined;
  if (!token || token.id === undefined || !TOKEN_KINDS.has(token.type as WinKind)) return undefined;
  return { kind: token.type as WinKind, id: token.id, token: `{${token.type}:${token.id}}` };
}

/**
 * What a plan promised (D194): reward tokens of the plan and its steps, the
 * contents of containers (a container with contents is not a target itself),
 * and the last step's `complete` when the game can tell it was obtained.
 */
export function planTargets(plan: Plan): WinTarget[] {
  const out = new Map<string, WinTarget>();
  const add = (target: WinTarget | undefined) => {
    if (target) out.set(`${target.kind}:${target.id}`, target);
  };
  const containers = new Set<string>();
  for (const [key, values] of Object.entries(plan.contains ?? {})) {
    const container = tokenTarget(key);
    if (container) containers.add(`${container.kind}:${container.id}`);
    for (const value of values) add(tokenTarget(value));
  }
  const rewards = [...(plan.rewards ?? []), ...plan.tasks.flatMap((task) => task.rewards ?? [])];
  for (const reward of rewards) {
    const target = tokenTarget(reward);
    if (target && !containers.has(`${target.kind}:${target.id}`)) add(target);
  }
  const complete = plan.tasks.at(-1)?.complete as Record<string, unknown> | undefined;
  const whole = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
  const fromComplete = (kind: WinKind, value: unknown) => {
    const id = whole(value);
    if (id !== undefined) add({ kind, id, token: `{${kind}:${id}}` });
  };
  switch (complete?.kind) {
    case "quest":
      fromComplete("quest", complete.questID);
      break;
    case "mount":
      fromComplete("mount", complete.mountID);
      for (const id of Array.isArray(complete.mountIDs) ? complete.mountIDs : [])
        fromComplete("mount", id);
      break;
    case "toy":
      fromComplete("toy", complete.itemID);
      break;
    case "pet":
      fromComplete("pet", complete.speciesID);
      break;
    case "achievement":
      fromComplete("ach", complete.achievementID);
      break;
  }
  return [...out.values()];
}

/**
 * Ids a stored Section newly gained (D196): the `added` ids of a diff. An
 * `initial` or `full` change and a body version change give nothing.
 */
export function addedIds(change: SectionChange): number[] {
  if (change.kind !== "diff" || change.versionChanged) return [];
  const body = change.body as { initial?: boolean; ids?: Record<string, unknown> } | null;
  if (!body || body.initial || typeof body.ids !== "object" || body.ids === null) return [];
  const out = new Set<number>();
  for (const diff of Object.values(body.ids)) {
    const added = (diff as { added?: unknown })?.added;
    if (!Array.isArray(added)) continue;
    for (const entry of added) {
      // idv1 rows are [id, ...values]: an item row that was not there had count 0.
      const id = Array.isArray(entry) ? entry[0] : entry;
      if (typeof id === "number" && Number.isInteger(id) && id > 0) out.add(id);
    }
  }
  return [...out];
}

/** Ids a change lost, so an item moved between bags and banks is not a win. */
export function removedIds(change: SectionChange): number[] {
  if (change.kind !== "diff") return [];
  const body = change.body as { ids?: Record<string, unknown> } | null;
  const out: number[] = [];
  for (const diff of Object.values(body?.ids ?? {})) {
    const removed = (diff as { removed?: unknown })?.removed;
    if (Array.isArray(removed)) for (const id of removed) if (typeof id === "number") out.push(id);
  }
  return out;
}

export type WinEntry = {
  at: number;
  account: string;
  character: string;
  realm: string;
  kind: WinKind;
  id: number;
  token: string;
  planId: number;
  requestId: string;
  planTitle: string | null;
  category: string;
};

/** list_wins (D198): totals per kind and the wins per UTC day, newest day first. */
export function winSummary(wins: WinEntry[]) {
  const totals = Object.fromEntries(WIN_KINDS.map((kind) => [kind, 0])) as Record<WinKind, number>;
  const days = new Map<string, WinEntry[]>();
  for (const win of wins) {
    totals[win.kind] += 1;
    const day = new Date(win.at * 1000).toISOString().slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(win);
  }
  return {
    wins,
    totals,
    days: [...days.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, list]) => ({ day, wins: list })),
  };
}
