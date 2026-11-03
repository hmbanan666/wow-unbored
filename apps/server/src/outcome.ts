import type { DataStore, SectionRow } from "./data.ts";
import {
  isPackedIdSet,
  unpackIds,
  planOutcomeSchema,
  type PlanOutcome,
  type PlayerContext,
} from "@unbored/contracts";

export const OUTCOME_KINDS = "rep, renown, level, achievement, mount, pet, toy, item, currency";

export class OutcomeError extends Error {}

export function requireOutcome(raw: unknown): PlanOutcome {
  const parsed = planOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    const reason =
      raw === undefined
        ? "is required"
        : `is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "kind"}: ${issue.message}`).join("; ")}`;
    throw new OutcomeError(
      `Plan outcome ${reason}. Allowed kinds: ${OUTCOME_KINDS}. Supply one near-guaranteed target and retry put_plan in this session.`,
    );
  }
  return parsed.data;
}

/** Unknown data is a note, never a warning that would prevent the lease from finishing. */
export async function checkOutcome(
  raw: unknown,
  data: DataStore,
  who?: { account: string; character: string; realm: string; context?: PlayerContext | null },
): Promise<string[]> {
  const outcome = requireOutcome(raw);
  const character = who
    ? (await data.characters(who.account)).find(
        (row) =>
          row.accountId === who.account && row.name === who.character && row.realm === who.realm,
      )
    : await data.character();
  const sections = character ? await data.sectionsFor(character) : new Map<string, SectionRow>();
  if (!character && who?.account)
    for (const section of await data.sections("account", who.account))
      sections.set(section.section, section);
  const body = (name: string) => sections.get(name)?.body;
  const rows = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter(
          (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
        )
      : [];
  const num = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  let known = false;
  let owned: string | undefined;
  switch (outcome.kind) {
    case "achievement":
    case "mount":
    case "pet":
    case "toy": {
      const id = outcome.kind === "achievement" ? outcome.achievementID : outcome.id;
      const names =
        outcome.kind === "achievement"
          ? ["achievements", "achievementsMine"]
          : [{ mount: "mounts", pet: "pets", toy: "toys" }[outcome.kind]];
      const sets = names
        .map((name) => body(name)?.[outcome.kind === "pet" ? "species" : "ids"])
        .filter(isPackedIdSet);
      known = sets.length > 0;
      if (sets.some((set) => unpackIds(set).includes(id)))
        owned = `${outcome.kind} ${id} is already ${outcome.kind === "achievement" ? "earned" : "collected"}`;
      break;
    }
    case "rep":
    case "renown": {
      const rep = outcome.kind === "rep";
      const row = rows(body("reputation")?.[rep ? "factions" : "renown"]).find(
        (row) => row.factionID === outcome.factionID,
      );
      const have = num(row?.[rep ? "reaction" : "level"]);
      const target = rep ? outcome.standing : outcome.level;
      known = have !== undefined;
      if (have !== undefined && have >= target)
        owned = `faction ${outcome.factionID} is already at ${rep ? "standing" : "renown"} ${have} (target ${target})`;
      break;
    }
    case "level": {
      // Levels cannot decrease: either snapshot can prove the target already reached.
      const levels = [num(body("char")?.level), num(who?.context?.level)].filter(
        (value): value is number => value !== undefined,
      );
      const have = levels.length ? Math.max(...levels) : undefined;
      known = have !== undefined;
      if (have !== undefined && have >= outcome.level)
        owned = `level ${have} is already reached (target ${outcome.level})`;
      break;
    }
    case "currency": {
      const row = rows(body("currencies")?.list).find((row) => row.id === outcome.currencyID);
      const have = num(row?.quantity);
      known = have !== undefined;
      if (have !== undefined && have >= outcome.amount)
        owned = `currency ${outcome.currencyID} is already at ${have} (target ${outcome.amount})`;
      break;
    }
    case "item": {
      const sets = ["bags", "bank", "reagentBank", "warband"]
        .map((name) => body(name)?.items)
        .filter(isPackedIdSet);
      const equipped = rows(body("gear")?.slots);
      known = sets.length > 0 || Array.isArray(body("gear")?.slots);
      if (
        sets.some((set) => unpackIds(set).includes(outcome.id)) ||
        equipped.some((row) => row.itemID === outcome.id)
      )
        owned = `item ${outcome.id} is already held`;
      break;
    }
  }
  if (owned)
    throw new OutcomeError(
      `Plan outcome rejected: ${owned}. Choose an unowned, reachable target and retry put_plan in this session.`,
    );
  return known
    ? []
    : [`No snapshot data for outcome ${outcome.kind} target; accepted without an ownership check.`];
}
