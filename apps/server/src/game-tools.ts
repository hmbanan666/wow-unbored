import { type GameDb, gameSource } from "./game-db.ts";
import type { BlizzardIds } from "./blizzard.ts";
export { gameSource } from "./game-db.ts";

export const ENTITY_TABLES = {
  item: "ItemSparse",
  quest: "QuestV2CliTask",
  questLine: "QuestLine",
  faction: "Faction",
  mount: "Mount",
  currency: "CurrencyTypes",
  achievement: "Achievement",
  zone: "UiMap",
  instance: "JournalInstance",
} as const;
export type EntityKind = keyof typeof ENTITY_TABLES;

export async function findGameEntity(
  game: GameDb,
  query: { kind: EntityKind; name: string; locale: "enUS" | "ruRU" },
) {
  const build = await game.currentBuild();
  const table = ENTITY_TABLES[query.kind];
  const matches = build ? await game.named(table, query.name.trim(), query.locale, build) : [];
  return {
    entities: matches
      .slice(0, 50)
      .map((row) => ({ kind: query.kind, id: Number(row.ID), name: query.name.trim() })),
    source: gameSource(build, table, query.locale),
    truncated: matches.length > 50,
    unavailable: build ? [] : ["Game DB unavailable"],
  };
}

export async function getQuestLine(
  game: GameDb,
  query: { questLineID: number; locale: "enUS" | "ruRU" },
  api?: BlizzardIds,
) {
  const build = await game.currentBuild();
  const source = gameSource(build, "QuestLineXQuest", "enUS");
  const line = build
    ? await game.row("QuestLine", query.questLineID, query.locale, build)
    : undefined;
  const unavailable: string[] = line
    ? []
    : [build ? "quest line not found" : "Game DB unavailable"];
  const quests: {
    questID: number;
    order: number;
    name: string | null;
    nameSource: Awaited<ReturnType<GameDb["questName"]>>["source"];
  }[] = [];
  if (line && build) {
    const rows = await game.related("QuestLineXQuest", "QuestLineID", query.questLineID, build);
    if (rows.length > 256) unavailable.push("quest line: result limit");
    else if (
      rows.some((row) => !Number.isSafeInteger(row.OrderIndex) || Number(row.OrderIndex) < 0) ||
      new Set(rows.map((row) => row.OrderIndex)).size !== rows.length
    )
      unavailable.push("quest order ambiguous");
    else {
      for (const row of rows.sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex))) {
        const questID = Number(row.QuestID);
        if (!(await game.row("QuestV2", questID, "enUS", build))) {
          unavailable.push(`quest not found: ${questID}`);
          continue;
        }
        const title = await game.questName(questID, query.locale, build, api);
        if (!title.name) {
          unavailable.push(`quest name: ${questID}`);
          unavailable.push(`quest name: ${questID} (Blizzard Game Data API unavailable)`);
        }
        quests.push({
          questID,
          order: Number(row.OrderIndex),
          name: title.name,
          nameSource: title.source,
        });
      }
    }
    if (!rows.length) unavailable.push("quest membership unavailable");
  }
  return {
    questLineID: query.questLineID,
    name: line?.fields.Name_lang ?? null,
    quests,
    source,
    nameSources: [
      gameSource(build, "QuestLine", query.locale),
      gameSource(build, "QuestV2CliTask", query.locale),
    ],
    unavailable,
  };
}
