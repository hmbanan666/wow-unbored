import { readProfessionCatalog, RECIPE_SQLITE_SCHEMA } from "./profession-catalog.ts";
import type { BlizzardIds } from "./blizzard.ts";
import { type Db, fromJson } from "./db.ts";
import {
  GAME_CONTENT_SQLITE_SCHEMA,
  GAME_TABLES,
  importGameContent,
  gameLocalized,
  type Game,
  type GameFields,
  type GameTable,
} from "./game-content.ts";

export const GAME_LAG_THRESHOLD_SECONDS = 6 * 60 * 60;

export const GAME_SQLITE_SCHEMA =
  GAME_CONTENT_SQLITE_SCHEMA +
  RECIPE_SQLITE_SCHEMA +
  `
  CREATE TABLE IF NOT EXISTS game_builds (
    game TEXT NOT NULL DEFAULT 'retail', build TEXT NOT NULL, build_number INTEGER NOT NULL,
    imported_at INTEGER NOT NULL, achievements INTEGER NOT NULL, PRIMARY KEY (game, build), UNIQUE (game, build_number)
  );
  CREATE TABLE IF NOT EXISTS game_achievements (
    game TEXT NOT NULL DEFAULT 'retail', build TEXT NOT NULL, id INTEGER NOT NULL,
    name_en TEXT NOT NULL, name_ru TEXT NOT NULL, PRIMARY KEY (game, build, id), FOREIGN KEY (game, build) REFERENCES game_builds(game, build)
  );
  CREATE TABLE IF NOT EXISTS game_quest_names (
    game TEXT NOT NULL DEFAULT 'retail', build TEXT NOT NULL, id INTEGER NOT NULL,
    locale TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,
    PRIMARY KEY (game, build, id, locale), FOREIGN KEY (game, build) REFERENCES game_builds(game, build)
  );
  CREATE TABLE IF NOT EXISTS game_watch (
    game TEXT NOT NULL DEFAULT 'retail', id INTEGER NOT NULL CHECK (id = 1), live_build TEXT,
    pending_since INTEGER, checked_at INTEGER, last_error TEXT, PRIMARY KEY (game, id)
  );
`;

export function validGameBuild(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.[1-9]\d{0,8}$/.test(value);
}

export class GameImportError extends Error {}

/** Build rows become visible only together with both complete locale tables. */
export class GameDb {
  private readonly builds: string;
  private readonly achievements: string;
  private readonly watch: string;

  private readonly db: Db;
  private readonly dataDir: string;
  private importing: Promise<unknown> = Promise.resolve();

  readonly game: Game;

  constructor(db: Db, dataDir: string, game: Game = "retail") {
    this.game = game;
    this.dataDir = dataDir;
    this.db = db;
    this.builds = db.pg ? "game.builds" : "game_builds";
    this.achievements = db.pg ? "game.achievements" : "game_achievements";
    this.watch = db.pg ? "game.watch" : "game_watch";
  }

  private otherGame?: GameDb;

  forGame(game: Game): GameDb {
    if (game === this.game) return this;
    if (!this.otherGame) {
      this.otherGame = new GameDb(this.db, this.dataDir, game);
      this.otherGame.otherGame = this;
    }
    return this.otherGame;
  }

  async professionCatalog(skillLine: number) {
    return readProfessionCatalog(this.db, this.game, skillLine);
  }

  async healthStatus() {
    return {
      ...(await this.forGame("retail").status()),
      forever: await this.forGame("forever").status(),
    };
  }

  async importBuild(build: string, fetchImpl: typeof fetch = fetch) {
    if (!validGameBuild(build)) throw new GameImportError("Invalid build.");
    const run = this.importing.then(() =>
      importGameContent(this.db, this.dataDir, build, fetchImpl, this.game),
    );
    this.importing = run.catch(() => {});
    return run.catch((cause) => {
      throw new GameImportError("Could not import all Game DB tables; retry the import.", {
        cause,
      });
    });
  }

  async row(table: GameTable, id: number, locale: "enUS" | "ruRU" = "enUS", build?: string) {
    const rows = this.db.pg ? "game.rows" : "game_rows";
    const found = await this.db.get<{ build: string; body: unknown }>(
      `SELECT build, ${this.db.body} AS body FROM ${rows} WHERE game = ? AND build = ? AND table_name = ? AND locale = ? AND id = ?`,
      this.game,
      build ?? (await this.currentBuild()) ?? "",
      table,
      gameLocalized(table) ? locale : "enUS",
      id,
    );
    return found ? { build: found.build, fields: fromJson<GameFields>(found.body)! } : undefined;
  }

  /** DB2 titles take precedence; API evidence belongs only to this build and locale. */
  async questName(
    id: number,
    locale: "enUS" | "ruRU",
    build: string,
    api?: BlizzardIds,
    signal?: AbortSignal,
  ) {
    const title = (await this.row("QuestV2CliTask", id, locale, build))?.fields.QuestTitle_lang;
    if (typeof title === "string" && title.trim())
      return { name: title, source: gameSource(build, "QuestV2CliTask", locale) };
    const table = this.db.pg ? "game.quest_names" : "game_quest_names";
    const cached = await this.db.get<{ name: string; url: string }>(
      `SELECT name, url FROM ${table} WHERE game = ? AND build = ? AND id = ? AND locale = ?`,
      this.game,
      build,
      id,
      locale,
    );
    if (cached)
      return {
        name: cached.name,
        source: { kind: "Blizzard Game Data API", build, locale, url: cached.url },
      };
    const found = await api?.questName(id, locale, signal);
    if (!found) return { name: null, source: null };
    await this.db.run(
      `INSERT INTO ${table} (game, build, id, locale, name, url) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (game, build, id, locale) DO UPDATE SET name = excluded.name, url = excluded.url`,
      this.game,
      build,
      id,
      locale,
      found.name,
      found.source.url,
    );
    return { name: found.name, source: { ...found.source, build } };
  }

  /** Exact localized names; SQL wildcard characters are literal. */
  async named(table: GameTable, name: string, locale: "enUS" | "ruRU", build: string) {
    const rows = this.db.pg ? "game.rows" : "game_rows";
    const fields = ["Display_lang", "Name_lang", "QuestTitle_lang", "Title_lang"];
    const expression = `COALESCE(${fields
      .map((field) =>
        this.db.pg ? `body ->> '${field}'` : `json_extract(body_json, '$.${field}')`,
      )
      .join(", ")})`;
    const found = await this.db.all<{ body: unknown }>(
      `SELECT ${this.db.body} AS body FROM ${rows} WHERE game = ? AND build = ? AND table_name = ? AND locale = ? AND ${expression} IS NOT NULL AND ${expression} = ? ORDER BY id LIMIT 51`,
      this.game,
      build,
      table,
      locale,
      name,
    );
    return found.map((row) => fromJson<GameFields>(row.body)!);
  }

  /** Bounded relationship lookup. A full group is required to prove unique geometry. */
  async related(
    table: GameTable,
    field: string,
    id: number,
    build: string,
    locale: "enUS" | "ruRU" = "enUS",
  ): Promise<GameFields[]> {
    if (!(GAME_TABLES[table] as readonly string[]).includes(field))
      throw new Error("Unknown game field");
    const rows = this.db.pg ? "game.rows" : "game_rows";
    const value = this.db.pg
      ? `body ->> '${field}'`
      : `CAST(json_extract(body_json, '$.${field}') AS TEXT)`;
    const found = await this.db.all<{ body: unknown }>(
      `SELECT ${this.db.body} AS body FROM ${rows} WHERE game = ? AND build = ? AND table_name = ? AND locale = ? AND ${value} = ? LIMIT 257`,
      this.game,
      build,
      table,
      gameLocalized(table) ? locale : "enUS",
      String(id),
    );
    return found.map((row) => fromJson<GameFields>(row.body)!);
  }

  /** Resolve only ids present in the imported build; never infer from player claims. */
  async missing(keys: Iterable<string>, build: string): Promise<Set<string>> {
    const tables: Record<string, GameTable> = {
      item: "ItemSparse",
      quest: "QuestV2",
      ach: "Achievement",
      currency: "CurrencyTypes",
      mount: "Mount",
      pet: "BattlePetSpecies",
      zone: "UiMap",
      instance: "JournalInstance",
    };
    const missing = new Set<string>();
    for (const key of new Set(keys)) {
      const [kind, id] = key.split(":");
      const table = tables[kind];
      let found = table ? !!(await this.row(table, Number(id), "enUS", build)) : false;
      if (kind === "toy")
        found = (await this.related("Toy", "ItemID", Number(id), build)).length > 0;
      if (kind === "spell")
        found =
          (await this.related("Mount", "SourceSpellID", Number(id), build)).length > 0 ||
          (await this.related("BattlePetSpecies", "SummonSpellID", Number(id), build)).length > 0;
      if (kind === "npc")
        found =
          (await this.related("BattlePetSpecies", "CreatureID", Number(id), build)).length > 0;
      if (!found) missing.add(key);
    }
    return missing;
  }

  async currentBuild() {
    return (
      await this.db.get<{ build: string }>(
        `SELECT build FROM ${this.builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1`,
        this.game,
      )
    )?.build;
  }

  /** A high-water mark: a stale response must not hide an outstanding import. */
  async observeLiveBuild(build: string) {
    if (!validGameBuild(build)) throw new GameImportError("Invalid build.");
    return this.db.tx(async () => {
      await this.db.lockKey(`game-watch-${this.game}`);
      const before = await this.status();
      const live =
        before.liveBuild && buildNumber(before.liveBuild) > buildNumber(build)
          ? before.liveBuild
          : build;
      const behind = !before.build || buildNumber(before.build) < buildNumber(live);
      const now = Math.floor(Date.now() / 1000);
      const since = behind ? (before.pendingSince ?? now) : null;
      await this.db.run(
        `INSERT INTO ${this.watch} (game, id, live_build, pending_since, checked_at, last_error)
         VALUES (?, 1, ?, ?, ?, NULL) ON CONFLICT (game, id) DO UPDATE SET
         live_build = excluded.live_build, pending_since = excluded.pending_since,
         checked_at = excluded.checked_at, last_error = NULL`,
        this.game,
        live,
        since,
        now,
      );
      return live;
    });
  }

  async watchFailed(error: "discovery_failed" | "import_failed") {
    await this.db.run(
      `INSERT INTO ${this.watch} (game, id, last_error) VALUES (?, 1, ?)
       ON CONFLICT (game, id) DO UPDATE SET last_error = excluded.last_error`,
      this.game,
      error,
    );
  }

  /** No network on health/catalog reads; timestamps are Unix seconds. */
  async status() {
    const row = await this.db.get<{
      build: string | null;
      imported_at: number | null;
      live_build: string | null;
      pending_since: number | null;
      checked_at: number | null;
      last_error: string | null;
    }>(
      `SELECT b.build, b.imported_at, w.live_build, w.pending_since, w.checked_at, w.last_error
        FROM (SELECT 1 AS id) singleton
        LEFT JOIN ${this.watch} w ON w.id = singleton.id AND w.game = ?
        LEFT JOIN ${this.builds} b ON b.game = ? AND b.build = (SELECT build FROM ${this.builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1)`,
      this.game,
      this.game,
      this.game,
    );
    const behind =
      row!.live_build !== null &&
      (row!.build === null || buildNumber(row!.build) < buildNumber(row!.live_build));
    const pendingSince = behind ? row!.pending_since : null;
    const lagSeconds =
      pendingSince === null ? 0 : Math.max(0, Math.floor(Date.now() / 1000) - pendingSince);
    return {
      build: row!.build,
      importedAt: row!.imported_at,
      liveBuild: row!.live_build,
      checkedAt: row!.checked_at,
      pendingSince,
      lagSeconds,
      lagThresholdSeconds: GAME_LAG_THRESHOLD_SECONDS,
      lagging: lagSeconds > GAME_LAG_THRESHOLD_SECONDS,
      lastError: row!.last_error,
    };
  }

  async entity(kind: "achievement", id: number) {
    const row = await this.db.get<{ build: string; name_en: string; name_ru: string }>(
      `SELECT build, name_en, name_ru FROM ${this.achievements} WHERE game = ? AND id = ? AND build = (SELECT build FROM ${this.builds} WHERE game = ? ORDER BY build_number DESC LIMIT 1)`,
      this.game,
      id,
      this.game,
    );
    return row
      ? { kind, id, build: row.build, names: { enUS: row.name_en, ruRU: row.name_ru } }
      : undefined;
  }
}

function buildNumber(build: string) {
  return Number(build.split(".")[3]);
}

export function gameSource(build: string | undefined, table: GameTable, locale: string) {
  return {
    kind: "Game DB",
    build: build ?? null,
    table,
    locale,
    url: build ? `https://wago.tools/db2/${table}/csv?build=${build}&locale=${locale}` : null,
  };
}
