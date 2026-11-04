import { setImmediate as yieldTurn } from "node:timers/promises";
import {
  bounded,
  placeTable,
  PLACE_LIMIT,
  PLACE_TABLES,
  type PlaceTable,
  type Row,
  type Table,
} from "./place-tables.ts";
import type { Waypoint } from "@unbored/contracts";

export type PlaceQuery = { mapID: number; questID?: number; npcID?: number; lang?: "en" | "ru" };
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
async function load(
  dataDir: string,
  lang: "en" | "ru",
  download?: typeof fetch,
  coordinateOnly = false,
) {
  const unavailable: string[] = [];
  const tables = new Map<Table, PlaceTable>();
  await Promise.all(
    PLACE_TABLES.map(async (table) => {
      if (table === "JournalEncounter" && !coordinateOnly) return;
      const rows = await bounded(
        (async () =>
          (await placeTable(
            dataDir,
            table,
            lang,
            table === "JournalEncounter" ? undefined : download,
          )) ?? (coordinateOnly ? await placeTable(dataDir, table, "ru") : undefined))(),
        undefined,
      );
      if (rows) tables.set(table, rows);
      else unavailable.push(table);
    }),
  );
  const rows = (table: Table, key: string | number) => {
    const source = tables.get(table);
    const limit = `${table}: result limit`;
    if (source?.limited(String(key)) && !unavailable.includes(limit)) unavailable.push(limit);
    return source?.get(String(key)) ?? [];
  };
  const questPoints = async (mapID: number, questID?: number): Promise<QuestPoint[]> => {
    const points: QuestPoint[] = [];
    const uncertain = new Set<number>();
    const blobs = rows("QuestPOIBlob", questID === undefined ? mapID : `${mapID}:${questID}`);
    let count = 0;
    for (const blob of blobs) {
      if (++count % 16 === 0) await yieldTurn();
      const id = number(blob.QuestID),
        worldMapID = number(blob.MapID);
      if (!positive(id) || !positive(mapID)) continue;
      const group = rows("QuestPOIPoint", blob.ID);
      const point =
        number(blob.NumPoints) === 1 && group.length === 1
          ? projectGamePoint(
              rows("UiMapAssignment", `${mapID}:${worldMapID}`),
              mapID,
              worldMapID,
              number(group[0].X),
              number(group[0].Y),
            )
          : undefined;
      if (point) points.push({ ...point, questID: id });
      else uncertain.add(id);
    }
    return points.filter((point) => !uncertain.has(point.questID));
  };
  const flights = async (mapID: number): Promise<FlightPoint[]> => {
    const result: FlightPoint[] = [];
    const worlds = new Set(rows("UiMapAssignment", mapID).map((row) => number(row.MapID)));
    for (const world of worlds) {
      await yieldTurn();
      for (const row of rows("TaxiNodes", world)) {
        if (!row.Name_lang || !(number(row.Flags) & 3)) continue;
        const point = projectGamePoint(
          rows("UiMapAssignment", `${mapID}:${world}`),
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
  return { rows, questPoints, flights, unavailable };
}

/** Validation never downloads or trusts coordinates supplied by the Planner as evidence.
 * An empty selection means no work, never all the quest points in the game.
 */
export async function readPlaceData(
  dataDir: string,
  mapIDs: number[] = [],
  questIDs: number[] = [],
): Promise<PlaceData> {
  if (!mapIDs.length) return { questPoints: [], knownPoints: [] };
  const data = await load(dataDir, "en", undefined, true);
  const questPoints: QuestPoint[] = [],
    knownPoints: Waypoint[] = [];
  for (const mapID of new Set(mapIDs.slice(0, PLACE_LIMIT))) {
    await yieldTurn();
    const quests: QuestPoint[] = [];
    // Prioritize the Plan's own quests, even on a map with thousands of other quests.
    for (const questID of new Set(questIDs.slice(0, PLACE_LIMIT))) {
      const group = await data.questPoints(mapID, questID);
      if (quests.length + group.length <= PLACE_LIMIT) quests.push(...group);
    }
    const requested = new Set(questIDs);
    const others = (await data.questPoints(mapID)).filter((point) => !requested.has(point.questID));
    if (quests.length + others.length <= PLACE_LIMIT) quests.push(...others);
    // Keep each quest/map group whole: a cap must not manufacture a unique destination.
    if (questPoints.length + quests.length <= PLACE_LIMIT) questPoints.push(...quests);
    for (const row of data.rows("JournalEncounter", mapID)) {
      const x = number(row.Map_0),
        y = number(row.Map_1);
      if (
        positive(mapID) &&
        x >= 0 &&
        x <= 1 &&
        y >= 0 &&
        y <= 1 &&
        knownPoints.length < PLACE_LIMIT
      )
        knownPoints.push({ mapID, x, y });
    }
    for (const point of [...quests, ...(await data.flights(mapID))]) {
      if (knownPoints.length === PLACE_LIMIT) break;
      knownPoints.push(point);
    }
  }
  return { questPoints, knownPoints };
}

/** Tables are shared across concurrent requests and only requested geometry is projected. */
export async function getPlace(
  dataDir: string,
  query: PlaceQuery,
  options: { fetchImpl?: typeof fetch } = {},
) {
  if (![query.mapID, query.questID, query.npcID].every((id) => id === undefined || positive(id)))
    throw new Error("Ids must be positive integers.");
  const data = await load(dataDir, query.lang ?? "en", options.fetchImpl ?? fetch);
  const map = data.rows("UiMap", query.mapID)[0];
  let ancestor: Row | undefined = map;
  const seen = new Set<number>();
  while (ancestor && number(ancestor.Type) !== 2) {
    const id = number(ancestor.ID);
    if (seen.has(id) || seen.size >= PLACE_LIMIT) {
      ancestor = undefined;
      break;
    }
    seen.add(id);
    ancestor = data.rows("UiMap", number(ancestor.ParentUiMapID))[0];
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
