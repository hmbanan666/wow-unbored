import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { cachedCsv, CSV_MAX_BYTES } from "./criteria.ts";

export type Row = Record<string, string | number>;
export const PLACE_LIMIT = 256;
export const PLACE_TIMEOUT_MS = 3_000;
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
export type Table = keyof typeof TABLES;
export const PLACE_TABLES = Object.keys(TABLES) as Table[];
const localized = (table: Table) => ["UiMap", "TaxiNodes", "JournalEncounter"].includes(table);

type Index = Map<string, Row | Row[] | null>;
export type PlaceTable = {
  get: (key: string) => readonly Row[];
  limited: (key: string) => boolean;
};
const EMPTY: readonly Row[] = [];
// Only the latest version of each table is retained. Bound directories/locales as well.
const cache = new Map<string, { version: string; value: Promise<PlaceTable | undefined> }>();
const downloads = new Map<string, Promise<unknown>>();

function keys(table: Table, row: Row): string[] {
  switch (table) {
    case "UiMap":
      return [String(row.ID)];
    case "UiMapAssignment":
      return [String(row.UiMapID), `${row.UiMapID}:${row.MapID}`];
    case "QuestPOIBlob":
      return [String(row.UiMapID), `${row.UiMapID}:${row.QuestID}`];
    case "QuestPOIPoint":
      return [String(row.QuestPOIBlobID)];
    case "TaxiNodes":
      return [String(row.ContinentID)];
    case "JournalEncounter":
      return [String(row.UiMapID)];
  }
}

/** Parse and index together, yielding every small slice even inside a long quoted cell. */
async function indexCsv(text: string, table: Table): Promise<PlaceTable | undefined> {
  const index: Index = new Map();
  const truncated = new Set<string>();
  let header: string[] | undefined;
  let columns: number[] = [];
  let row: string[] = [];
  let start = 0;
  let quoted = false;
  let slice = performance.now();
  const deadline = slice + PLACE_TIMEOUT_MS;
  const field = (end: number) => {
    const raw = text.slice(start, end).replace(/\r$/, "");
    row.push(raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw);
    start = end + 1;
  };
  const accept = () => {
    if (!header) {
      header = row;
      columns = TABLES[table].map((field) => header!.indexOf(field));
      if (columns.some((i) => i < 0)) throw new Error("Missing place columns");
    } else {
      const record: Row = {};
      TABLES[table].forEach((field, i) => {
        const value = row[columns[i]] ?? "";
        record[field] =
          field === "Name_lang" ? value.slice(0, 1024) : value.trim() ? Number(value) : NaN;
      });
      if (Number.isSafeInteger(Number(record.ID)) && Number(record.ID) > 0) {
        for (const key of keys(table, record)) {
          const group = index.get(key);
          // Never turn truncated geometry into apparently unique evidence.
          if (group === null) continue;
          const limit = table === "QuestPOIPoint" ? 2 : PLACE_LIMIT;
          if (Array.isArray(group)) {
            if (group.length >= limit) {
              truncated.add(key);
              if (table !== "TaxiNodes") index.set(key, null);
            } else group.push(record);
          } else if (group) index.set(key, [group, record]);
          else index.set(key, record);
        }
      } else if (table === "QuestPOIBlob") {
        // A blob with a broken join invalidates the quest's geometry too.
        for (const key of keys(table, record)) index.set(key, null);
      }
    }
    row = [];
  };
  try {
    for (let i = 0; i < text.length; i++) {
      if ((i & 1023) === 0 && performance.now() - slice >= 4) {
        await yieldTurn();
        slice = performance.now();
        if (slice > deadline) return;
      }
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && char === ",") field(i);
      else if (!quoted && char === "\n") {
        field(i);
        accept();
      }
    }
    if (quoted) return;
    if (start < text.length || row.length) {
      field(text.length);
      accept();
    }
    if (!header) return;
    return {
      get: (key) => {
        const value = index.get(key);
        return value ? (Array.isArray(value) ? value : [value]) : EMPTY;
      },
      limited: (key) => truncated.has(key),
    };
  } catch {
    return;
  }
}

export async function placeTable(
  dataDir: string,
  table: Table,
  lang: "en" | "ru",
  fetchImpl?: typeof fetch,
): Promise<PlaceTable | undefined> {
  const name = `${table}${localized(table) && lang === "ru" ? ".ruRU" : ""}.csv`;
  const dir = path.join(dataDir, "wago");
  const file = path.resolve(dir, name);
  const fresh = async () => {
    const info = await stat(file).catch(() => undefined);
    return info &&
      info.size > 0 &&
      info.size <= CSV_MAX_BYTES &&
      Date.now() - info.mtimeMs < 86_400_000
      ? info
      : undefined;
  };
  let info = await fresh();
  if (!info && fetchImpl) {
    let download = downloads.get(file);
    if (!download) {
      download = cachedCsv(
        dir,
        name,
        `https://wago.tools/db2/${table}/csv${localized(table) && lang === "ru" ? "?locale=ruRU" : ""}`,
        fetchImpl,
      )
        .catch(() => undefined)
        .finally(() => {
          downloads.delete(file);
        });
      downloads.set(file, download);
    }
    await download;
    info = await fresh();
  }
  if (!info) {
    cache.delete(file);
    return;
  }
  const version = `${info.mtimeMs}:${info.size}`;
  const previous = cache.get(file);
  if (previous?.version === version) return previous.value;
  const value = (async () => {
    const text = await readFile(file, "utf8");
    const after = await fresh();
    if (!after || `${after.mtimeMs}:${after.size}` !== version) return;
    return indexCsv(text, table);
  })().catch(() => undefined);
  cache.set(file, { version, value });
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return value;
}

/** A slow download or file system must not hold a tool call open indefinitely. */
export async function bounded<T>(
  work: Promise<T>,
  fallback: T,
  timeoutMs = PLACE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
