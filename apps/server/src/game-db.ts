import type { Db } from "./db.ts";
import { CSV_MAX_BYTES, parseCsv } from "./criteria.ts";

export const GAME_SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS game_builds (
    build TEXT PRIMARY KEY, build_number INTEGER NOT NULL UNIQUE,
    imported_at INTEGER NOT NULL, achievements INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_achievements (
    build TEXT NOT NULL REFERENCES game_builds(build), id INTEGER NOT NULL,
    name_en TEXT NOT NULL, name_ru TEXT NOT NULL, PRIMARY KEY (build, id)
  );
`;

export function validGameBuild(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.[1-9]\d{0,8}$/.test(value);
}

export class GameImportError extends Error {}

async function achievements(build: string, locale: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(
    `https://wago.tools/db2/Achievement/csv?build=${build}&locale=${locale}`,
    {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    },
  );
  if (!response.ok || !response.body) throw new Error("Download unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CSV_MAX_BYTES) throw new Error("Download too large");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const [header = [], ...rows] = parseCsv(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    true,
  );
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

  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    this.builds = db.pg ? "game.builds" : "game_builds";
    this.achievements = db.pg ? "game.achievements" : "game_achievements";
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
