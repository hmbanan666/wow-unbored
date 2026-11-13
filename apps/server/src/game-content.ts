import { materializeRecipes } from "./profession-catalog.ts";
import { Worker } from "node:worker_threads";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { type Db, fromJson, type Param } from "./db.ts";
import { gameCsv } from "./game-csv.ts";

export const GAME_IMPORT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_STAGED_BYTES = 1024 * 1024 * 1024;
const MAX_TABLE_ROWS = 2_000_000;
const BATCH_ROWS = 500;
const BATCH_BYTES = 1024 * 1024;

export type Game = "retail" | "forever";

export const RETAIL_TABLES = {
  QuestV2: ["ID", "UniqueBitFlag"],
  QuestV2CliTask: ["ID", "QuestTitle_lang"],
  QuestLine: ["ID", "Name_lang"],
  QuestLineXQuest: ["ID", "QuestLineID", "QuestID", "OrderIndex"],
  Faction: ["ID", "Name_lang", "ParentFactionID", "Expansion"],
  ItemSparse: [
    "ID",
    "Display_lang",
    "RequiredSkill",
    "RequiredSkillRank",
    "OverallQualityID",
    "Bonding",
  ],
  Mount: ["ID", "Name_lang", "SourceSpellID", "SourceTypeEnum"],
  BattlePetSpecies: ["ID", "CreatureID", "SummonSpellID", "PetTypeEnum", "SourceTypeEnum"],
  Toy: ["ID", "ItemID", "SourceTypeEnum"],
  CurrencyTypes: ["ID", "Name_lang", "MaxQty", "MaxEarnablePerWeek"],
  Achievement: ["ID", "Title_lang", "Description_lang", "Instance_ID", "Criteria_tree"],
  CriteriaTree: [
    "ID",
    "Parent",
    "CriteriaID",
    "OrderIndex",
    "Amount",
    "Operator",
    "Description_lang",
  ],
  Criteria: ["ID", "Type", "Asset"],
  UiMap: ["ID", "Name_lang", "ParentUiMapID", "Type"],
  UiMapGroupMember: ["ID", "Name_lang", "UiMapID"],
  UiMapAssignment: [
    "ID",
    "UiMapID",
    "MapID",
    "AreaID",
    "Region_0",
    "Region_1",
    "Region_3",
    "Region_4",
    "UiMin_0",
    "UiMin_1",
    "UiMax_0",
    "UiMax_1",
  ],
  AreaTable: ["ID", "AreaName_lang", "ContinentID", "ParentAreaID"],
  Map: ["ID", "MapName_lang", "ParentMapID", "ExpansionID", "InstanceType"],
  QuestPOIBlob: ["ID", "QuestID", "UiMapID", "MapID", "NumPoints"],
  QuestPOIPoint: ["ID", "QuestPOIBlobID", "X", "Y"],
  TaxiNodes: ["ID", "Name_lang", "ContinentID", "Pos_0", "Pos_1", "Flags"],
  JournalInstance: ["ID", "Name_lang", "MapID"],
  JournalEncounter: [
    "ID",
    "Name_lang",
    "JournalInstanceID",
    "DungeonEncounterID",
    "OrderIndex",
    "UiMapID",
    "Map_0",
    "Map_1",
  ],
} as const;
export const FOREVER_TABLES = {
  UiMap: RETAIL_TABLES.UiMap,
  SkillLine: ["ID", "DisplayName_lang", "CategoryID", "ParentSkillLineID"],
  SkillLineAbility: [
    "ID",
    "SkillLine",
    "Spell",
    "MinSkillLineRank",
    "TrivialSkillLineRankLow",
    "TrivialSkillLineRankHigh",
    "NumSkillUps",
    "AcquireMethod",
    "TradeSkillCategoryID",
  ],
  SpellReagents: [
    "ID",
    "SpellID",
    ...Array.from({ length: 8 }, (_, i) => `Reagent_${i}`),
    ...Array.from({ length: 8 }, (_, i) => `ReagentCount_${i}`),
  ],
  ItemSparse: RETAIL_TABLES.ItemSparse,
  ItemEffect: ["ID", "SpellID", "TriggerType"],
  ItemXItemEffect: ["ID", "ItemID", "ItemEffectID"],
  SpellEffect: ["ID", "SpellID", "Effect", "EffectTriggerSpell", "EffectItemType"],
  TradeSkillCategory: [
    "ID",
    "Name_lang",
    "ParentTradeSkillCategoryID",
    "SkillLineID",
    "OrderIndex",
  ],
  SpellName: ["ID", "Name_lang"],
} as const;
export const GAME_TABLES = { ...RETAIL_TABLES, ...FOREVER_TABLES };
const tablesFor = (game: Game) =>
  Object.keys(game === "retail" ? RETAIL_TABLES : FOREVER_TABLES) as GameTable[];

export type GameTable = keyof typeof GAME_TABLES;
export type GameFields = Record<string, string | number>;

export const GAME_CONTENT_SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS game_rows (
    game TEXT NOT NULL DEFAULT 'retail', build TEXT NOT NULL, table_name TEXT NOT NULL,
    locale TEXT NOT NULL, id INTEGER NOT NULL, body_json TEXT NOT NULL,
    PRIMARY KEY (game, build, table_name, locale, id), FOREIGN KEY (game, build) REFERENCES game_builds(game, build)
  );
  CREATE INDEX IF NOT EXISTS game_questlinexquest_questlineid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.QuestLineID') AS TEXT)) WHERE table_name = 'QuestLineXQuest';
  CREATE INDEX IF NOT EXISTS game_rows_name ON game_rows (game, build, table_name, locale, COALESCE(json_extract(body_json, '$.Display_lang'), json_extract(body_json, '$.Name_lang'), json_extract(body_json, '$.QuestTitle_lang'), json_extract(body_json, '$.Title_lang')), id) WHERE COALESCE(json_extract(body_json, '$.Display_lang'), json_extract(body_json, '$.Name_lang'), json_extract(body_json, '$.QuestTitle_lang'), json_extract(body_json, '$.Title_lang')) IS NOT NULL;
  CREATE INDEX IF NOT EXISTS game_toy_itemid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.ItemID') AS TEXT)) WHERE table_name = 'Toy';
  CREATE INDEX IF NOT EXISTS game_mount_sourcespellid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.SourceSpellID') AS TEXT)) WHERE table_name = 'Mount';
  CREATE INDEX IF NOT EXISTS game_battlepetspecies_summonspellid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.SummonSpellID') AS TEXT)) WHERE table_name = 'BattlePetSpecies';
  CREATE INDEX IF NOT EXISTS game_battlepetspecies_creatureid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.CreatureID') AS TEXT)) WHERE table_name = 'BattlePetSpecies';
  CREATE INDEX IF NOT EXISTS game_uimapassignment_uimapid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.UiMapID') AS TEXT)) WHERE table_name = 'UiMapAssignment';
  CREATE INDEX IF NOT EXISTS game_questpoiblob_questid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.QuestID') AS TEXT)) WHERE table_name = 'QuestPOIBlob';
  CREATE INDEX IF NOT EXISTS game_questpoiblob_uimapid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.UiMapID') AS TEXT)) WHERE table_name = 'QuestPOIBlob';
  CREATE INDEX IF NOT EXISTS game_questpoipoint_questpoiblobid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.QuestPOIBlobID') AS TEXT)) WHERE table_name = 'QuestPOIPoint';
  CREATE INDEX IF NOT EXISTS game_taxinodes_continentid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.ContinentID') AS TEXT)) WHERE table_name = 'TaxiNodes';
  CREATE INDEX IF NOT EXISTS game_journalencounter_uimapid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.UiMapID') AS TEXT)) WHERE table_name = 'JournalEncounter';
  CREATE INDEX IF NOT EXISTS game_uimapgroupmember_uimapid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.UiMapID') AS TEXT)) WHERE table_name = 'UiMapGroupMember';
  CREATE INDEX IF NOT EXISTS game_criteriatree_parent ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.Parent') AS TEXT)) WHERE table_name = 'CriteriaTree';
  CREATE INDEX IF NOT EXISTS game_journalinstance_mapid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.MapID') AS TEXT)) WHERE table_name = 'JournalInstance';
  CREATE INDEX IF NOT EXISTS game_journalencounter_journalinstanceid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.JournalInstanceID') AS TEXT)) WHERE table_name = 'JournalEncounter';
  CREATE INDEX IF NOT EXISTS game_journalencounter_dungeonencounterid ON game_rows (game, build, locale, CAST(json_extract(body_json, '$.DungeonEncounterID') AS TEXT)) WHERE table_name = 'JournalEncounter';
  CREATE TABLE IF NOT EXISTS game_imports (
    game TEXT NOT NULL DEFAULT 'retail', build TEXT NOT NULL, body_json TEXT NOT NULL, PRIMARY KEY (game, build), FOREIGN KEY (game, build) REFERENCES game_builds(game, build)
  );
`;

export const gameLocalized = (table: GameTable) =>
  GAME_TABLES[table].some((field) => field.endsWith("_lang"));

type Counts = Record<string, number>;
type StagedRow = [GameTable, string, number, string];

function selectFields(header: string[], columns: readonly string[], row: string[]): GameFields {
  if (row.length !== header.length) throw new Error("Invalid game row width");
  const result: GameFields = {};
  for (const field of columns) {
    const value = row[header.indexOf(field)];
    if (field.endsWith("_lang")) result[field] = value;
    else {
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value))
        throw new Error("Invalid numeric game field");
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error("Invalid numeric game field");
      // Preserve wide DB2 integer quantities exactly instead of rounding them.
      result[field] = Number.isInteger(number) && !Number.isSafeInteger(number) ? value : number;
    }
  }
  if (!Number.isInteger(result.ID) || Number(result.ID) < 0 || Number(result.ID) > 2147483647)
    throw new Error("Invalid game id");
  return result;
}

/** Download and project sequentially to disk, before holding any database transaction. */
async function stage(
  file: string,
  build: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  game: Game,
) {
  const output = await open(file, "wx", 0o600);
  const counts: Counts = {};
  let bytes = 0,
    batch = "",
    batchRows = 0,
    batchBytes = 0;
  const flush = async () => {
    if (batch) await output.writeFile(batch);
    batch = "";
    batchRows = 0;
    batchBytes = 0;
  };
  try {
    for (const table of tablesFor(game)) {
      const columns = GAME_TABLES[table];
      for (const locale of game === "retail" && gameLocalized(table)
        ? ["enUS", "ruRU"]
        : ["enUS"]) {
        const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
        const url = `https://wago.tools/db2/${table}/csv?build=${build}&locale=${locale}`;
        let header: string[] | undefined,
          count = 0;
        for await (const row of gameCsv(url, fetchImpl, downloadSignal)) {
          if (!header) {
            header = row;
            if (
              new Set(header).size !== header.length ||
              columns.some((field) => !header!.includes(field))
            )
              throw new Error(`Missing or duplicate ${table} columns`);
            continue;
          }
          const fields = selectFields(header, columns, row);
          const line = JSON.stringify([table, locale, fields.ID, JSON.stringify(fields)]) + "\n";
          const lineBytes = Buffer.byteLength(line);
          bytes += lineBytes;
          if (++count > MAX_TABLE_ROWS || bytes > MAX_STAGED_BYTES)
            throw new Error("Game import too large");
          batch += line;
          batchRows++;
          batchBytes += lineBytes;
          if (batchRows >= BATCH_ROWS || batchBytes >= BATCH_BYTES) await flush();
        }
        if (!count) throw new Error(`Missing ${table} rows`);
        if (locale === "enUS") counts[table] = count;
        else if (counts[table] !== count) throw new Error(`${table} locale counts differ`);
      }
    }
    await flush();
    return counts;
  } finally {
    await output.close();
  }
}

async function insertRows(db: Db, file: string, build: string, signal: AbortSignal, game: Game) {
  const table = db.pg ? "game.rows" : "game_rows";
  const input = createReadStream(file);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let batch: StagedRow[] = [],
    bytes = 0;
  const flush = async () => {
    signal.throwIfAborted();
    if (batch.length)
      await db.run(
        `INSERT INTO ${table} (game, build, table_name, locale, id, ${db.body}) VALUES ${batch.map(() => "(?, ?, ?, ?, ?, ?)").join(",")}`,
        ...batch.flatMap((row) => [game, build, ...row] as Param[]),
      );
    batch = [];
    bytes = 0;
    await yieldTurn();
  };
  try {
    for await (const line of lines) {
      batch.push(JSON.parse(line));
      const lineBytes = Buffer.byteLength(line);
      bytes += lineBytes;
      if (batch.length >= BATCH_ROWS || bytes >= BATCH_BYTES) await flush();
    }
    await flush();
  } finally {
    lines.close();
    input.destroy();
  }
}

/** Publish all source tables and both locales together; old readers keep their build. */
export async function importGameContent(
  db: Db,
  dataDir: string,
  build: string,
  fetchImpl: typeof fetch,
  game: Game = "retail",
) {
  const previous = await completedImport(db, build, game);
  if (previous) return importResult(build, "unchanged", previous);
  const signal = AbortSignal.timeout(GAME_IMPORT_TIMEOUT_MS);
  const directory = await mkdtemp(path.join(dataDir, ".game-import-"));
  try {
    const file = path.join(directory, "rows.jsonl");
    const counts = await stage(file, build, fetchImpl, signal, game);
    return db.pg
      ? await publishGameContent(db, file, build, counts, signal, game)
      : await db.tx(() => publishInThread(dataDir, file, build, counts, signal, game));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function completedImport(db: Db, build: string, game: Game) {
  const table = db.pg ? "game.imports" : "game_imports";
  const previous = await db.get(
    `SELECT ${db.body} FROM ${table} WHERE game = ? AND build = ?`,
    game,
    build,
  );
  const counts = previous ? fromJson<Counts>(previous[db.body]) : undefined;
  // ADR 0101: refresh current builds once, through the non-blocking build watch.
  if (!counts || counts._itemFacts !== 1 || !tablesFor(game).every((table) => counts[table] > 0))
    return undefined;
  const { _itemFacts, ...tables } = counts;
  return tables;
}

function importResult(build: string, status: string, tables: Counts) {
  return { build, status, achievements: tables.Achievement, tables };
}

/** SQLite's synchronous commit/checkpoint runs off the request event loop. */
function publishInThread(
  dataDir: string,
  file: string,
  build: string,
  counts: Counts,
  signal: AbortSignal,
  game: Game = "retail",
) {
  return new Promise<ReturnType<typeof importResult>>((resolve, reject) => {
    const worker = new Worker(new URL("./game-content-worker.ts", import.meta.url), {
      workerData: { dataDir, file, build, counts, game, timeout: GAME_IMPORT_TIMEOUT_MS },
    });
    let result: ReturnType<typeof importResult> | undefined;
    const abort = () => {
      void worker.terminate();
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.on("message", (value) => {
      result = value;
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      signal.removeEventListener("abort", abort);
      if (code === 0 && result && !signal.aborted) resolve(result);
      else reject(new Error("Game import did not finish"));
    });
  });
}

/** Internal publication boundary shared with the SQLite import thread. */
export async function publishGameContent(
  db: Db,
  file: string,
  build: string,
  counts: Counts,
  signal: AbortSignal,
  game: Game = "retail",
) {
  const builds = db.pg ? "game.builds" : "game_builds";
  const rows = db.pg ? "game.rows" : "game_rows";
  const imports = db.pg ? "game.imports" : "game_imports";
  const achievements = db.pg ? "game.achievements" : "game_achievements";
  return db.tx(async () => {
    await db.lockKey(`game-content-import-${game}`);
    const previous = await completedImport(db, build, game);
    if (previous) return importResult(build, "unchanged", previous);
    signal.throwIfAborted();
    await db.run(
      `INSERT INTO ${builds} (game, build, build_number, imported_at, achievements) VALUES (?, ?, ?, ?, ?) ON CONFLICT (game, build) DO NOTHING`,
      game,
      build,
      Number(build.split(".")[3]),
      Math.floor(Date.now() / 1000),
      counts.Achievement ?? 0,
    );
    await db.run(`DELETE FROM ${rows} WHERE game = ? AND build = ?`, game, build);
    await insertRows(db, file, build, signal, game);
    // New relationship indexes otherwise look cheap on an unanalyzed import and
    // turn id lookups into full group scans until autovacuum updates statistics.
    if (db.pg) await db.run(`ANALYZE ${rows}`);
    for (const table of tablesFor(game)) {
      if (game !== "retail" || !gameLocalized(table)) continue;
      let after = -1;
      for (;;) {
        signal.throwIfAborted();
        const checked = await db.all<{ id: number }>(
          `SELECT id FROM ${rows} WHERE game = ? AND build = ? AND table_name = ? AND locale = 'enUS' AND id > ? ORDER BY id LIMIT 500`,
          game,
          build,
          table,
          after,
        );
        if (!checked.length) break;
        const matched = await db.all<{ id: number }>(
          `SELECT id FROM ${rows} WHERE game = ? AND build = ? AND table_name = ? AND locale = 'ruRU' AND id IN (${checked.map(() => "?").join(",")})`,
          game,
          build,
          table,
          ...checked.map((row) => row.id),
        );
        if (matched.length !== checked.length) throw new Error(`${table} locale ids differ`);
        after = checked.at(-1)!.id;
        await yieldTurn();
      }
    }
    // Keep the original entity lookup and older stored builds compatible.
    await db.run(`DELETE FROM ${achievements} WHERE game = ? AND build = ?`, game, build);
    const title = (alias: string) =>
      db.pg ? `${alias}.body->>'Title_lang'` : `json_extract(${alias}.body_json, '$.Title_lang')`;
    await db.run(
      `INSERT INTO ${achievements} (game, build, id, name_en, name_ru) SELECT en.game, en.build, en.id, ${title("en")}, (SELECT ${title("ru")} FROM ${rows} ru WHERE ru.game = en.game AND ru.build = en.build AND ru.table_name = 'Achievement' AND ru.id = en.id AND ru.locale = 'ruRU') FROM ${rows} en WHERE en.game = ? AND en.build = ? AND en.table_name = 'Achievement' AND en.locale = 'enUS'`,
      game,
      build,
    );
    await db.run(
      `UPDATE ${builds} SET achievements = ?, imported_at = ? WHERE game = ? AND build = ?`,
      counts.Achievement ?? 0,
      Math.floor(Date.now() / 1000),
      game,
      build,
    );
    signal.throwIfAborted();
    await db.run(
      `INSERT INTO ${imports} (game, build, ${db.body}) VALUES (?, ?, ?) ON CONFLICT (game, build) DO UPDATE SET ${db.body} = excluded.${db.body}`,
      game,
      build,
      JSON.stringify({ ...counts, _itemFacts: 1 }),
    );
    if (game === "forever") await materializeRecipes(db, game, build, signal);
    return importResult(build, "imported", counts);
  });
}
