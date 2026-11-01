import { mkdirSync } from "node:fs";
import path from "node:path";

export type Config = {
  companionToken: string;
  plannerToken: string;
  dataDir: string;
  port: number;
  /** PostgreSQL (ADR 0057). Unset: the Server stays on SQLite. */
  databaseUrl?: string;
  databasePoolMax: number;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const companionToken = env.UNBORED_COMPANION_TOKEN?.trim() ?? "";
  const plannerToken = env.UNBORED_PLANNER_TOKEN?.trim() ?? "";
  if (!companionToken || !plannerToken) {
    throw new Error("UNBORED_COMPANION_TOKEN and UNBORED_PLANNER_TOKEN must both be set.");
  }
  if (companionToken === plannerToken) {
    throw new Error("UNBORED_COMPANION_TOKEN and UNBORED_PLANNER_TOKEN must be different.");
  }
  const dataDir = env.UNBORED_DATA_DIR?.trim() || "/data";
  const port = Number(env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a whole number from 1 to 65535.");
  }
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://.");
  }
  const databasePoolMax = Number(env.DATABASE_POOL_MAX?.trim() || "10");
  if (!Number.isInteger(databasePoolMax) || databasePoolMax < 1 || databasePoolMax > 100) {
    throw new Error("DATABASE_POOL_MAX must be a whole number from 1 to 100.");
  }
  return { companionToken, plannerToken, dataDir, port, databaseUrl, databasePoolMax };
}

export function sqlitePath(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "unbored.sqlite");
}
