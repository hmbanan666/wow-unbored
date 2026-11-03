import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cachedCsv, parseCsv } from "./criteria.ts";
import type { Waypoint } from "@unbored/contracts";

export type PlaceQuery = { mapID: number; questID?: number; npcID?: number; lang?: "en" | "ru" };
type Row = Record<string, string>;
type QuestPoint = Waypoint & { questID: number };
type FlightPoint = Waypoint & { id: number; name: string };
export type PlaceData = { questPoints: QuestPoint[]; knownPoints: Waypoint[] };
const MAX_PLACE_BYTES = 2_000_000;
const TABLES = {
  JournalEncounter: ["ID", "UiMapID", "Map_0", "Map_1"],
  UiMap: ["ID", "Name_lang", "ParentUiMapID", "Type"],
  UiMapAssignment: [
    "ID",
    "UiMapID",
    "MapID",
    "Region_0",
    "Region_1",
    "Region_3",
    "Region_4",
    "UiMin_0",
    "UiMin_1",
    "UiMax_0",
    "UiMax_1",
  ],
  QuestPOIBlob: ["ID", "QuestID", "UiMapID", "MapID", "NumPoints"],
  QuestPOIPoint: ["ID", "QuestPOIBlobID", "X", "Y"],
  TaxiNodes: ["ID", "Name_lang", "ContinentID", "Pos_0", "Pos_1", "Flags"],
} as const;
type Table = keyof typeof TABLES;
const localized = (table: Table) =>
  table === "UiMap" || table === "TaxiNodes" || table === "JournalEncounter";
function filename(table: Table, lang: "en" | "ru") {
  return `${table}${localized(table) && lang === "ru" ? ".ruRU" : ""}.csv`;
}
function readTable(dataDir: string, table: Table, lang: "en" | "ru"): Row[] | undefined {
  try {
    const file = path.join(dataDir, "wago", filename(table, lang));
    const stat = statSync(file);
    if (stat.size > MAX_PLACE_BYTES || Date.now() - stat.mtimeMs >= 86_400_000) return;
    const [header = [], ...body] = parseCsv(readFileSync(file, "utf8"));
    if (!TABLES[table].every((field) => header.includes(field))) return;
    return body.map((row) => Object.fromEntries(header.map((field, i) => [field, row[i] ?? ""])));
  } catch {
    return;
  }
}
function number(value: string | undefined): number {
  return value?.trim() ? Number(value) : NaN;
}
function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** UiMapAssignment world axes are swapped and reversed. Ambiguous mappings stay unknown. */
function project(
  assignments: Row[],
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
function load(dataDir: string, lang: "en" | "ru", coordinateOnly = false) {
  const unavailable: string[] = [];
  const read = (table: Table) => {
    const rows =
      readTable(dataDir, table, lang) ??
      (coordinateOnly ? readTable(dataDir, table, "ru") : undefined);
    if (!rows) unavailable.push(table);
    return rows ?? [];
  };
  const maps = read("UiMap"),
    assignments = read("UiMapAssignment");
  const blobs = read("QuestPOIBlob"),
    points = read("QuestPOIPoint"),
    taxis = read("TaxiNodes");
  const questPoints: QuestPoint[] = [];
  const byBlob = new Map<number, Row[]>();
  for (const point of points) {
    const id = number(point.QuestPOIBlobID);
    if (!positive(id) || !positive(number(point.ID))) continue;
    const group = byBlob.get(id) ?? [];
    group.push(point);
    byBlob.set(id, group);
  }
  const uncertain = new Set<string>();
  const key = (questID: number, mapID: number) => `${questID}:${mapID}`;
  for (const blob of blobs) {
    const questID = number(blob.QuestID),
      mapID = number(blob.UiMapID);
    if (!positive(questID) || !positive(mapID)) continue;
    const blobID = number(blob.ID);
    const group = positive(blobID) ? byBlob.get(blobID) : undefined;
    // Keep ambiguity before filtering: a turn-in point does not locate another objective area.
    if (
      number(blob.NumPoints) !== 1 ||
      group?.length !== 1 ||
      !Number.isInteger(number(blob.MapID)) ||
      number(blob.MapID) < 0
    ) {
      uncertain.add(key(questID, mapID));
      continue;
    }
    const point = project(
      assignments,
      mapID,
      number(blob.MapID),
      number(group[0].X),
      number(group[0].Y),
    );
    if (point) questPoints.push({ ...point, questID });
    else uncertain.add(key(questID, mapID));
  }
  const certainPoints = questPoints.filter(
    (point) => !uncertain.has(key(point.questID, point.mapID)),
  );
  const flights = (mapID: number): FlightPoint[] =>
    taxis.flatMap((row) => {
      if (!positive(number(row.ID)) || !row.Name_lang || !(number(row.Flags) & 3)) return [];
      const point = project(
        assignments,
        mapID,
        number(row.ContinentID),
        number(row.Pos_0),
        number(row.Pos_1),
      );
      return point ? [{ ...point, id: number(row.ID), name: row.Name_lang }] : [];
    });
  return { maps, questPoints: certainPoints, flights, unavailable };
}

/** Validation never downloads or trusts coordinates supplied by the Planner as evidence. */
export function readPlaceData(dataDir: string, mapIDs: number[] = []): PlaceData {
  const data = load(dataDir, "en", true);
  const encounters =
    readTable(dataDir, "JournalEncounter", "en") ??
    readTable(dataDir, "JournalEncounter", "ru") ??
    [];
  const bosses = encounters.flatMap((row) => {
    const mapID = number(row.UiMapID),
      x = number(row.Map_0),
      y = number(row.Map_1);
    return positive(mapID) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [{ mapID, x, y }] : [];
  });
  const maps = new Set(mapIDs.length ? mapIDs : data.questPoints.map((point) => point.mapID));
  return {
    questPoints: data.questPoints,
    knownPoints: [...bosses, ...data.questPoints, ...[...maps].flatMap(data.flights)],
  };
}

/** Small tables only, using the same 24-hour CSV cache as instance guides. */
export async function getPlace(
  dataDir: string,
  query: PlaceQuery,
  options: { fetchImpl?: typeof fetch } = {},
) {
  if (![query.mapID, query.questID, query.npcID].every((id) => id === undefined || positive(id)))
    throw new Error("Ids must be positive integers.");
  const lang = query.lang ?? "en";
  await Promise.all(
    (Object.keys(TABLES) as Table[]).map(async (table) => {
      if (table === "JournalEncounter" || readTable(dataDir, table, lang)) return;
      try {
        await cachedCsv(
          path.join(dataDir, "wago"),
          filename(table, lang),
          `https://wago.tools/db2/${table}/csv${localized(table) && lang === "ru" ? "?locale=ruRU" : ""}`,
          options.fetchImpl,
          MAX_PLACE_BYTES,
        );
      } catch {
        /* A missing or large table is unknown, never a guessed place. */
      }
    }),
  );
  const data = load(dataDir, lang);
  const byID = new Map(data.maps.map((row) => [number(row.ID), row]));
  const map = byID.get(query.mapID);
  let ancestor = map;
  const seen = new Set<number>();
  while (ancestor && number(ancestor.Type) !== 2) {
    const id = number(ancestor.ID);
    if (seen.has(id)) {
      ancestor = undefined;
      break;
    }
    seen.add(id);
    ancestor = byID.get(number(ancestor.ParentUiMapID));
  }
  const continent = ancestor?.Name_lang
    ? { mapID: number(ancestor.ID), name: ancestor.Name_lang }
    : null;
  const name = map?.Name_lang || null;
  const questPoints = data.questPoints.filter(
    (point) => point.mapID === query.mapID && point.questID === query.questID,
  );
  const flightPoints = data.flights(query.mapID);
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
