import type { Waypoint } from "@unbored/contracts";
import type { GameDb } from "./game-db.ts";
import type { GameFields } from "./game-content.ts";
import { PLACE_LIMIT, projectQuestPoints, projectFlightPoint, type PlaceData } from "./places.ts";

/** Read bounded, complete geometry groups from one imported build. No CSV or network reads. */
export async function gamePlaces(
  game: GameDb,
  build: string,
  maps: number[],
  questIDs: number[] = [],
): Promise<PlaceData> {
  const result: PlaceData = { questPoints: [], knownPoints: [] };
  for (const mapID of new Set(maps.slice(0, PLACE_LIMIT))) {
    if (!(await game.row("UiMap", mapID, "enUS", build))) continue;
    const assignments = await game.related("UiMapAssignment", "UiMapID", mapID, build);
    if (assignments.length > PLACE_LIMIT) continue;
    const blobs = new Map<number, GameFields>();
    for (const questID of new Set(questIDs.slice(0, PLACE_LIMIT))) {
      const rows = await game.related("QuestPOIBlob", "QuestID", questID, build);
      if (rows.length <= PLACE_LIMIT)
        for (const row of rows) if (row.UiMapID === mapID) blobs.set(Number(row.ID), row);
    }
    const nearby = await game.related("QuestPOIBlob", "UiMapID", mapID, build);
    if (nearby.length <= PLACE_LIMIT) for (const row of nearby) blobs.set(Number(row.ID), row);
    const quests = new Map<number, (Waypoint & { questID: number })[]>();
    const projected = await projectQuestPoints(game, build, mapID, assignments, [
      ...blobs.values(),
    ]);
    for (const point of projected.points) {
      const group = quests.get(point.questID) ?? [];
      group.push(point);
      quests.set(point.questID, group);
    }
    for (const [questID, group] of quests) {
      if (!(await game.row("QuestV2", questID, "enUS", build))) continue;
      if (
        result.questPoints.length + group.length <= PLACE_LIMIT &&
        result.knownPoints.length + group.length <= PLACE_LIMIT
      ) {
        result.questPoints.push(...group);
        result.knownPoints.push(...group);
      }
    }
    const encounters = await game.related("JournalEncounter", "UiMapID", mapID, build);
    for (const row of encounters.slice(0, PLACE_LIMIT)) {
      const x = Number(row.Map_0),
        y = Number(row.Map_1);
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && result.knownPoints.length < PLACE_LIMIT)
        result.knownPoints.push({ mapID, x, y });
    }
    for (const world of new Set(assignments.map((row) => Number(row.MapID)))) {
      const flights = await game.related("TaxiNodes", "ContinentID", world, build);
      for (const row of flights.slice(0, PLACE_LIMIT)) {
        const point = projectFlightPoint(assignments, mapID, row);
        if (point && result.knownPoints.length < PLACE_LIMIT) result.knownPoints.push(point);
      }
    }
  }
  return result;
}
