import { mkdirSync } from "node:fs";
import path from "node:path";

export type Config = {
  companionToken: string;
  plannerToken: string;
  plannerRoute: "webhook" | "runner";
  runnerToken?: string;
  runnerFallbackSeconds: number;
  dataDir: string;
  port: number;
  /** PostgreSQL (ADR 0057). Unset: the Server stays on SQLite. */
  databaseUrl?: string;
  databasePoolMax: number;
  /** Public origin of the site, for sign-in links. Unset: derived from the request. */
  webOrigin?: string;
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
  const plannerRoute = env.UNBORED_PLANNER_ROUTE?.trim() || "webhook";
  if (plannerRoute !== "webhook" && plannerRoute !== "runner")
    throw new Error("UNBORED_PLANNER_ROUTE must be webhook or runner.");
  const runnerToken = env.UNBORED_RUNNER_TOKEN?.trim() || undefined;
  if (
    runnerToken &&
    (runnerToken.length < 32 || runnerToken === companionToken || runnerToken === plannerToken)
  )
    throw new Error(
      "UNBORED_RUNNER_TOKEN must have at least 32 characters and differ from the companion and planner tokens.",
    );
  if (plannerRoute === "runner" && !runnerToken)
    throw new Error("UNBORED_RUNNER_TOKEN is required for the runner route.");
  const runnerFallbackSeconds = Number(env.UNBORED_RUNNER_FALLBACK_SECONDS?.trim() || "90");
  if (!Number.isInteger(runnerFallbackSeconds) || runnerFallbackSeconds < 0)
    throw new Error("UNBORED_RUNNER_FALLBACK_SECONDS must be a non-negative whole number.");
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
  const webOrigin = cleanWebOrigin(env.UNBORED_WEB_ORIGIN);
  return {
    companionToken,
    plannerToken,
    plannerRoute,
    runnerToken,
    runnerFallbackSeconds,
    dataDir,
    port,
    databaseUrl,
    databasePoolMax,
    webOrigin,
  };
}

export function sqlitePath(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "unbored.sqlite");
}

function cleanWebOrigin(value: string | undefined): string | undefined {
  const origin = value?.trim().replace(/\/$/, "") ?? "";
  if (!origin) return undefined;
  if (
    /^https:\/\/[^/]+$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return origin;
  }
  throw new Error("UNBORED_WEB_ORIGIN must be an https origin, or http://localhost.");
}
