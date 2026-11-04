import { markupIds, parseMarkup, type Plan } from "@unbored/contracts";
import type { GameDb } from "./game-db.ts";
import { OutcomeError } from "./outcome.ts";
import type { MarkupCheck } from "./plan.ts";
import { gamePlaces } from "./game-places.ts";
import { acquisition } from "./acquisition.ts";

/** Player ownership is checked separately; this checks whether the promised target exists. */
export async function checkGameOutcome(plan: Plan, game: GameDb, build: string): Promise<void> {
  const outcome = plan.outcome;
  if (!outcome || outcome.kind === "level") return;
  let missing: boolean;
  if (outcome.kind === "rep" || outcome.kind === "renown") {
    missing = !(await game.row("Faction", outcome.factionID, "enUS", build));
  } else {
    const key =
      outcome.kind === "achievement"
        ? `ach:${outcome.achievementID}`
        : outcome.kind === "currency"
          ? `currency:${outcome.currencyID}`
          : `${outcome.kind}:${outcome.id}`;
    missing = (await game.missing([key], build)).size > 0;
    if (plan.bonus?.some((token) => markupIds(token).includes(key)))
      throw new OutcomeError(
        "Plan outcome is also a chance bonus. Choose a near-guaranteed outcome and retry.",
      );
  }
  if (missing)
    throw new OutcomeError(
      `Plan outcome target is missing from Game DB build ${build}. Choose a verified target and retry.`,
    );
}

export async function checkOutcomeAcquisition(
  plan: Plan,
  game: GameDb,
  build?: string,
  notes?: string[],
) {
  const outcome = plan.outcome;
  if (!outcome || !("id" in outcome)) return;
  const evidence = await acquisition(outcome.kind, outcome.id, game, build);
  if (evidence.acquisition === "chance-only")
    throw new OutcomeError(
      `Plan outcome rejected: ${outcome.kind} ${outcome.id} is known to be chance-only (${evidence.sources.join(", ")}). Keep it in bonus, choose a near-guaranteed outcome and retry in this session.`,
    );
  if (evidence.acquisition === "unknown")
    notes?.push(
      `Acquisition for outcome ${outcome.kind} ${outcome.id} is unknown; accepted without an acquisition guarantee. Verify a near-guaranteed source before promising it.`,
    );
}

/** Remove unprovable automatic checks while preserving the player's written action. */
export async function checkGameCompletions(
  plan: Plan,
  game: GameDb,
  build: string,
  warnings?: string[],
) {
  const exists = async (kind: string, id: unknown) =>
    (await game.missing([`${kind}:${id}`], build)).size === 0;
  const completion = async (
    raw: Record<string, unknown>,
    where: string,
  ): Promise<Record<string, unknown> | undefined> => {
    if (raw.kind === "any" && Array.isArray(raw.any)) {
      const any = [];
      for (const child of raw.any) {
        const kept = await completion(child, where);
        if (kept) any.push(kept);
      }
      return any.length ? { kind: "any", any } : undefined;
    }
    const references: [string, unknown][] = [];
    if (raw.questID !== undefined) references.push(["quest", raw.questID]);
    if (raw.achievementID !== undefined) references.push(["ach", raw.achievementID]);
    if (raw.itemID !== undefined)
      references.push([raw.kind === "toy" ? "toy" : "item", raw.itemID]);
    if (raw.speciesID !== undefined) references.push(["pet", raw.speciesID]);
    if (raw.currencyID !== undefined) references.push(["currency", raw.currencyID]);
    if (raw.mountID !== undefined) references.push(["mount", raw.mountID]);
    if (Array.isArray(raw.mountIDs))
      references.push(...raw.mountIDs.map((id) => ["mount", id] as [string, unknown]));
    if (raw.mapID !== undefined) references.push(["zone", raw.mapID]);
    for (const [kind, id] of references) {
      if (!(await exists(kind, id))) {
        warnings?.push(
          `${where}: unknown ${kind} ${id} in Game DB build ${build}; automatic check dropped`,
        );
        return;
      }
    }
    return raw;
  };
  for (const [index, task] of plan.tasks.entries()) {
    const where = `Step ${index + 1}`;
    if (task.complete)
      task.complete = (await completion(task.complete, where)) ?? { kind: "manual" };
    const check = task.condition?.check;
    if (check && check.kind !== "level" && !(await exists(check.kind, check.id))) {
      warnings?.push(
        `${where} Condition: unknown ${check.kind} ${check.id} in Game DB build ${build}; check dropped`,
      );
      delete task.condition!.check;
    }
  }
}

/** One build for every check in a submission, even if an import publishes meanwhile. */
export async function gameMarkupCheck(
  raw: unknown,
  game: GameDb,
  build: string,
  check: MarkupCheck,
): Promise<MarkupCheck> {
  const maps: number[] = [],
    quests: number[] = [],
    ids: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8) return;
    if (typeof value === "string") {
      ids.push(...markupIds(value));
      for (const token of parseMarkup(value)) {
        if (typeof token === "string") continue;
        if (token.type === "pin") maps.push(token.mapID!);
        if (token.type === "quest") quests.push(token.id!);
      }
    } else if (Array.isArray(value))
      value.slice(0, 256).forEach((child) => visit(child, depth + 1));
    else if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row.mapID === "number") maps.push(row.mapID);
      if (typeof row.questID === "number") quests.push(row.questID);
      Object.values(row).forEach((child) => visit(child, depth + 1));
    }
  };
  visit(raw);
  return {
    ...check,
    gameBuild: build,
    missing: await game.missing(ids, build),
    places: await gamePlaces(game, build, maps, quests),
  };
}
