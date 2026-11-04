import type { GameDb } from "./game-db.ts";
import type { GameFields as Row, GameTable } from "./game-content.ts";
import type { Waypoint } from "@unbored/contracts";

export type PlaceQuery = { mapID: number; questID?: number; npcID?: number; lang?: "en" | "ru" };
export const PLACE_LIMIT = 256;
type QuestPoint = Waypoint & { questID: number };
type FlightPoint = Waypoint & { id: number; name: string };
export type PlaceData = { questPoints: QuestPoint[]; knownPoints: Waypoint[] };
function number(value: string | number | undefined): number {
  return typeof value === "number" ? value : value?.trim() ? Number(value) : NaN;
}
function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** UiMapAssignment world axes are swapped and reversed. Ambiguous mappings stay unknown. */
export function projectGamePoint(
  assignments: readonly Row[],
  mapID: number,
  worldMapID: number,
  worldX: number,
  worldY: number,
): Waypoint | undefined {
  const points: Waypoint[] = [];
  for (const row of assignments) {
    if (
      !positive(number(row.ID)) ||
      !positive(mapID) ||
      !Number.isInteger(worldMapID) ||
      worldMapID < 0 ||
      number(row.UiMapID) !== mapID ||
      number(row.MapID) !== worldMapID
    )
      continue;
    const x0 = number(row.Region_0),
      y0 = number(row.Region_1);
    const x1 = number(row.Region_3),
      y1 = number(row.Region_4);
    if (!(x1 > x0 && y1 > y0 && worldX >= x0 && worldX <= x1 && worldY >= y0 && worldY <= y1))
      continue;
    const x =
      number(row.UiMax_0) +
      ((worldY - y0) / (y1 - y0)) * (number(row.UiMin_0) - number(row.UiMax_0));
    const y =
      number(row.UiMax_1) +
      ((worldX - x0) / (x1 - x0)) * (number(row.UiMin_1) - number(row.UiMax_1));
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1)
      points.push({ mapID, x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) });
  }
  return points.length === 1 ? points[0] : undefined;
}
async function load(game: GameDb, lang: "en" | "ru") {
  const build = await game.currentBuild();
  const locale = lang === "ru" ? "ruRU" : "enUS";
  const unavailable: string[] = build ? [] : ["Game DB unavailable"];
  const rows = async (table: GameTable, field: string, id: number) => {
    if (!build) return [];
    const result = await game.related(table, field, id, build, locale);
    if (result.length > PLACE_LIMIT) unavailable.push(`${table}: result limit`);
    return result;
  };
  const row = async (id: number) =>
    build ? (await game.row("UiMap", id, locale, build))?.fields : undefined;
  const questPoints = async (mapID: number, questID?: number): Promise<QuestPoint[]> => {
    const points: QuestPoint[] = [];
    const uncertain = new Set<number>();
    const blobs = await rows(
      "QuestPOIBlob",
      questID === undefined ? "UiMapID" : "QuestID",
      questID ?? mapID,
    );
    if (blobs.length > PLACE_LIMIT) return [];
    const assignments = await rows("UiMapAssignment", "UiMapID", mapID);
    if (assignments.length > PLACE_LIMIT) return [];
    for (const blob of blobs) {
      if (number(blob.UiMapID) !== mapID) continue;
      const id = number(blob.QuestID),
        worldMapID = number(blob.MapID);
      if (!positive(id) || !positive(mapID)) continue;
      const group = await rows("QuestPOIPoint", "QuestPOIBlobID", number(blob.ID));
      const point =
        number(blob.NumPoints) === 1 && group.length === 1
          ? projectGamePoint(assignments, mapID, worldMapID, number(group[0].X), number(group[0].Y))
          : undefined;
      if (point) points.push({ ...point, questID: id });
      else uncertain.add(id);
    }
    return points.filter((point) => !uncertain.has(point.questID));
  };
  const flights = async (mapID: number): Promise<FlightPoint[]> => {
    const result: FlightPoint[] = [];
    const assignments = await rows("UiMapAssignment", "UiMapID", mapID);
    if (assignments.length > PLACE_LIMIT) return [];
    const worlds = new Set(assignments.map((row) => number(row.MapID)));
    for (const world of worlds) {
      for (const row of (await rows("TaxiNodes", "ContinentID", world)).slice(0, PLACE_LIMIT)) {
        if (!row.Name_lang || !(number(row.Flags) & 3)) continue;
        const point = projectGamePoint(
          assignments,
          mapID,
          world,
          number(row.Pos_0),
          number(row.Pos_1),
        );
        if (point) result.push({ ...point, id: number(row.ID), name: String(row.Name_lang) });
        if (result.length === PLACE_LIMIT) return result;
      }
    }
    return result;
  };
  return { row, questPoints, flights, unavailable };
}

/** Read one imported build; project only the requested geometry. */
export async function getPlace(game: GameDb, query: PlaceQuery) {
  if (![query.mapID, query.questID, query.npcID].every((id) => id === undefined || positive(id)))
    throw new Error("Ids must be positive integers.");
  const data = await load(game, query.lang ?? "en");
  const map = await data.row(query.mapID);
  let ancestor: Row | undefined = map;
  const seen = new Set<number>();
  while (ancestor && number(ancestor.Type) !== 2) {
    const id = number(ancestor.ID);
    if (seen.has(id) || seen.size >= PLACE_LIMIT) {
      ancestor = undefined;
      break;
    }
    seen.add(id);
    ancestor = await data.row(number(ancestor.ParentUiMapID));
  }
  const continent = ancestor?.Name_lang
    ? { mapID: number(ancestor.ID), name: ancestor.Name_lang }
    : null;
  const name = map?.Name_lang || null;
  const questPoints =
    query.questID === undefined ? [] : await data.questPoints(query.mapID, query.questID);
  const flightPoints = await data.flights(query.mapID);
  const anchor = questPoints.length === 1 ? questPoints[0] : undefined;
  const nearestFlightPoint = anchor
    ? ([...flightPoints].sort((a, b) => distance(a, anchor) - distance(b, anchor))[0] ?? null)
    : null;
  return {
    mapID: query.mapID,
    name,
    continent,
    expansion: null,
    label:
      name && continent && continent.mapID !== query.mapID ? `${name} (${continent.name})` : name,
    questPoints,
    flightPoints,
    nearestFlightPoint,
    unavailable: [
      ...data.unavailable,
      "expansion label",
      "instance entrances",
      ...(query.npcID ? ["npc position"] : []),
      ...(!anchor ? ["nearest flight point: no unique destination"] : []),
    ],
  };
}
export function distance(a: Waypoint, b: Waypoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
