import { isDeepStrictEqual } from "node:util";
import type { PlanOutcome } from "@unbored/contracts";
import { PlanError } from "./plan.ts";
import { contentItemOutcome, type ContentStore } from "./content.ts";
import type { DataStore } from "./data.ts";
import type { GameDb } from "./game-db.ts";
import { createPathProgressReader } from "./path-progress.ts";
import type { PlanRequest } from "./store.ts";

/** The picked publication stays fixed; remaining goals follow this Character's snapshot. */
export async function readRequestPath(
  request: PlanRequest,
  content: ContentStore,
  data: DataStore,
  game: GameDb,
) {
  const reference = request.suggestion?.path;
  if (!reference || request.game === "forever") return null;
  const unavailable = (reason: string) => ({ reference, nextGoals: [], reason });
  if (!content.available) return unavailable("Path Plans need the Postgres Server.");
  const path = await content.read(
    reference.kind,
    reference.slug,
    reference.locale,
    reference.version,
  );
  if (!path || path.status === "draft" || !path.build)
    return unavailable("The picked Path version is not a publication. Refresh the Path pick.");
  const character = request.account
    ? (await data.characters(request.account)).find(
        (row) =>
          row.game === (request.game ?? "retail") &&
          row.name === request.character &&
          row.realm === request.realm,
      )
    : undefined;
  if (!character)
    return unavailable("No game data for this Request's Character. Refresh its snapshot.");
  const [progress] = await createPathProgressReader(game)(
    [
      {
        ...reference,
        id: path.id,
        title: path.document.title,
        build: path.build,
        items: path.document.items,
      },
    ],
    await data.sectionsFor(character),
  );
  const nextGoals = progress!.goals
    .filter((goal) => goal.required && !goal.done)
    .map(({ position }) => {
      const item = path.document.items[position]!;
      return { position, ...item, outcome: contentItemOutcome(item) };
    });
  return {
    reference,
    title: path.document.title,
    done: progress!.done,
    total: progress!.total,
    nextGoals,
  };
}

export function checkPathOutcome(
  outcome: PlanOutcome | undefined,
  path: Awaited<ReturnType<typeof readRequestPath>>,
) {
  if (!path) return;
  if ("reason" in path)
    throw new PlanError(
      `${path.reason} Read get_request and retry, or fail_request if no goal is available.`,
    );
  if (!path.nextGoals.some((goal) => goal.outcome && isDeepStrictEqual(goal.outcome, outcome)))
    throw new PlanError(
      "The outcome must exactly match an unfinished required Path goal. Read get_request and retry with one of path.nextGoals[].outcome; if none is available, use fail_request.",
    );
}
