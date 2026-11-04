import type { Db } from "./db.ts";
import { CSV_MAX_BYTES, parseCsv } from "./criteria.ts";
import { downloadGameText } from "./game-download.ts";

export const GAME_LAG_THRESHOLD_SECONDS = 6 * 60 * 60;

export const GAME_SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS game_builds (
    build TEXT PRIMARY KEY, build_number INTEGER NOT NULL UNIQUE,
    imported_at INTEGER NOT NULL, achievements INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_achievements (
    build TEXT NOT NULL REFERENCES game_builds(build), id INTEGER NOT NULL,
    name_en TEXT NOT NULL, name_ru TEXT NOT NULL, PRIMARY KEY (build, id)
  );
  CREATE TABLE IF NOT EXISTS game_watch (
    id INTEGER PRIMARY KEY CHECK (id = 1), live_build TEXT,
    pending_since INTEGER, checked_at INTEGER, last_error TEXT
  );
`;

export function validGameBuild(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.[1-9]\d{0,8}$/.test(value);
}

export class GameImportError extends Error {}

async function achievements(build: string, locale: string, fetchImpl: typeof fetch) {
  const csv = await downloadGameText(
    `https://wago.tools/db2/Achievement/csv?build=${build}&locale=${locale}`,
    CSV_MAX_BYTES,
    fetchImpl,
  );
  const [header = [], ...rows] = parseCsv(csv, true);
  const idColumn = header.indexOf("ID");
  const nameColumn = header.indexOf("Title_lang");
  if (idColumn < 0 || nameColumn < 0 || !rows.length)
    throw new Error("Missing Achievement columns or rows");
  const result = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row[idColumn]);
    const name = row[nameColumn];
    if (
      row.length !== header.length ||
      !Number.isInteger(id) ||
      id <= 0 ||
      id > 2147483647 ||
      name === undefined ||
      result.has(id)
    )
      throw new Error("Invalid Achievement row");
    result.set(id, name);
  }
  return result;
}

/** Build rows become visible only together with both complete locale tables. */
export class GameDb {
  private readonly builds: string;
  private readonly achievements: string;
  private readonly watch: string;

  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    this.builds = db.pg ? "game.builds" : "game_builds";
    this.achievements = db.pg ? "game.achievements" : "game_achievements";
    this.watch = db.pg ? "game.watch" : "game_watch";
  }

  async currentBuild() {
    return (
      await this.db.get<{ build: string }>(
        `SELECT build FROM ${this.builds} ORDER BY build_number DESC LIMIT 1`,
      )
    )?.build;
  }

  /** A high-water mark: a stale response must not hide an outstanding import. */
  async observeLiveBuild(build: string) {
    if (!validGameBuild(build)) throw new GameImportError("Invalid build.");
    return this.db.tx(async () => {
      await this.db.lockKey("game-watch");
      const before = await this.status();
      const live =
        before.liveBuild && buildNumber(before.liveBuild) > buildNumber(build)
          ? before.liveBuild
          : build;
      const behind = !before.build || buildNumber(before.build) < buildNumber(live);
      const now = Math.floor(Date.now() / 1000);
      const since = behind ? (before.pendingSince ?? now) : null;
      await this.db.run(
        `INSERT INTO ${this.watch} (id, live_build, pending_since, checked_at, last_error)
         VALUES (1, ?, ?, ?, NULL) ON CONFLICT (id) DO UPDATE SET
         live_build = excluded.live_build, pending_since = excluded.pending_since,
         checked_at = excluded.checked_at, last_error = NULL`,
        live,
        since,
        now,
      );
      return live;
    });
  }

  async watchFailed(error: "discovery_failed" | "import_failed") {
    await this.db.run(
      `INSERT INTO ${this.watch} (id, last_error) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET last_error = excluded.last_error`,
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
    }>(`SELECT b.build, b.imported_at, w.live_build, w.pending_since, w.checked_at, w.last_error
        FROM (SELECT 1 AS id) singleton
        LEFT JOIN ${this.watch} w ON w.id = singleton.id
        LEFT JOIN ${this.builds} b ON b.build = (SELECT build FROM ${this.builds} ORDER BY build_number DESC LIMIT 1)`);
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

  async importAchievements(build: string, fetchImpl: typeof fetch = fetch) {
    if (!validGameBuild(build)) throw new GameImportError("Invalid build.");
    const completed = () =>
      this.db.get<{ achievements: number }>(
        `SELECT achievements FROM ${this.builds} WHERE build = ?`,
        build,
      );
    const previous = await completed();
    if (previous) return { build, status: "unchanged", achievements: previous.achievements };
    const [en, ru] = await Promise.all([
      achievements(build, "enUS", fetchImpl),
      achievements(build, "ruRU", fetchImpl),
    ]).catch(() => {
      throw new GameImportError("Could not read Achievement for both locales; retry the import.");
    });
    if (en.size !== ru.size || [...en.keys()].some((id) => !ru.has(id)))
      throw new GameImportError("Achievement locale ids differ; retry the import.");
    return this.db.tx(async () => {
      await this.db.lockKey(`game-import:${build}`);
      const previous = await completed();
      if (previous) return { build, status: "unchanged", achievements: previous.achievements };
      await this.db.run(
        `INSERT INTO ${this.builds} (build, build_number, imported_at, achievements) VALUES (?, ?, ?, ?)`,
        build,
        Number(build.split(".")[3]),
        Math.floor(Date.now() / 1000),
        en.size,
      );
      const entries = [...en];
      for (let start = 0; start < entries.length; start += 500) {
        const batch = entries.slice(start, start + 500);
        await this.db.run(
          `INSERT INTO ${this.achievements} (build, id, name_en, name_ru) VALUES ${batch.map(() => "(?, ?, ?, ?)").join(", ")}`,
          ...batch.flatMap(([id, name]) => [build, id, name, ru.get(id)!]),
        );
      }
      return { build, status: "imported", achievements: en.size };
    });
  }

  async entity(kind: "achievement", id: number) {
    const row = await this.db.get<{ build: string; name_en: string; name_ru: string }>(
      `SELECT build, name_en, name_ru FROM ${this.achievements} WHERE id = ? AND build = (SELECT build FROM ${this.builds} ORDER BY build_number DESC LIMIT 1)`,
      id,
    );
    return row
      ? { kind, id, build: row.build, names: { enUS: row.name_en, ruRU: row.name_ru } }
      : undefined;
  }
}

function buildNumber(build: string) {
  return Number(build.split(".")[3]);
}
