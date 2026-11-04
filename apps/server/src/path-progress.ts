import { isPackedIdSet, unpackIds, unpackRows } from "@unbored/contracts";
import type { ContentItem, ContentStore } from "./content.ts";
import type { SectionRow } from "./data.ts";
import type { GameDb } from "./game-db.ts";

export type PublishedPath = Awaited<ReturnType<ContentStore["publishedPaths"]>>[number];

/** Current snapshot evidence, in the authored order; chance goals count too. */
export function createPathProgressReader(game: GameDb) {
  // One evaluation may include several Characters and Paths from the same build.
  // Only immutable game membership is shared; snapshot evidence stays per Character.
  const questLines = new Map<string, number[]>();
  const questsIn = async (build: string, id: number) => {
    const key = `${build}:${id}`;
    if (!questLines.has(key)) {
      const members = await game.related("QuestLineXQuest", "QuestLineID", id, build);
      const ids = members.map((row) => Number(row.QuestID));
      const valid =
        ids.length > 0 &&
        ids.length <= 256 &&
        ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
        (
          await game.missing(
            ids.map((id) => `quest:${id}`),
            build,
          )
        ).size === 0;
      questLines.set(key, valid ? ids : []);
    }
    return questLines.get(key)!;
  };
  return async (paths: PublishedPath[], sections: Map<string, SectionRow>) => {
    const body = (name: string) => {
      const section = sections.get(name);
      return section && !section.unknown ? section.body : undefined;
    };
    const sets = new Map<string, Set<number>>();
    const ids = (name: string, field = "ids") => {
      const key = `${name}:${field}`;
      if (!sets.has(key)) {
        const packed = body(name)?.[field];
        sets.set(key, new Set(isPackedIdSet(packed) ? unpackIds(packed) : []));
      }
      return sets.get(key)!;
    };
    const rows = (name: string, field: string): Record<string, unknown>[] => {
      const value = body(name)?.[field];
      return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
    };
    const atLeast = (have: unknown, need: number | undefined) =>
      typeof have === "number" && Number.isFinite(have) && need !== undefined && have >= need;
    const done = async (item: ContentItem, build: string): Promise<boolean> => {
      switch (item.kind) {
        case "mount":
          return ids("mounts").has(item.id!);
        case "pet":
          return ids("pets", "species").has(item.id!);
        case "toy":
          return ids("toys").has(item.id!);
        case "achievement":
          return ids("achievements").has(item.id!) || ids("achievementsMine").has(item.id!);
        case "quest":
          return ids("questsDone").has(item.id!);
        case "questLine": {
          // Completed lines are absent from questLines. Use the published build's
          // complete membership and this Character's questsDone, never an Alt's.
          const quests = await questsIn(build, item.id!);
          return quests.length > 0 && quests.every((id) => ids("questsDone").has(id));
        }
        case "level":
          return atLeast(body("char")?.level, item.level);
        case "rep":
          return atLeast(
            rows("reputation", "factions").find((row) => row.factionID === item.id)?.reaction,
            item.standing,
          );
        case "renown":
          return atLeast(
            rows("reputation", "renown").find((row) => row.factionID === item.id)?.level,
            item.level,
          );
        case "currency":
          return atLeast(
            rows("currencies", "list").find((row) => row.id === item.id)?.quantity,
            item.amount,
          );
        case "item":
          return (
            rows("gear", "slots").some((row) => row.itemID === item.id) ||
            ["bags", "bank", "reagentBank", "warband"].some((name) =>
              unpackRows(body(name)?.items).some(
                (row) => row.id === item.id && (row.values[0] ?? 0) > 0,
              ),
            )
          );
      }
    };
    const progress = [];
    for (const path of paths) {
      const goals = [];
      for (const [position, item] of path.items.entries()) {
        goals.push({
          position,
          kind: item.kind,
          id: item.id,
          required: item.required !== false,
          done: await done(item, path.build),
        });
      }
      progress.push({
        id: path.id,
        kind: path.kind,
        slug: path.slug,
        locale: path.locale,
        version: path.version,
        title: path.title,
        done: goals.filter((goal) => goal.required && goal.done).length,
        total: goals.filter((goal) => goal.required).length,
        goals,
      });
    }
    return progress;
  };
}
