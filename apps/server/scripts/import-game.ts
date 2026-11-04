/** Owner-triggered Game DB import through the running Server; no database credentials. */
import { validGameBuild } from "../src/game-db.ts";

const usage =
  "Usage: node apps/server/scripts/import-game.ts BUILD (UNBORED_SERVER_URL and UNBORED_PLANNER_TOKEN must be set)";
const [build, ...extra] = process.argv.slice(2);
if (build === "--help") {
  console.log(usage);
} else if (!validGameBuild(build) || extra.length) {
  console.error(usage);
  process.exitCode = 2;
} else {
  const base = process.env.UNBORED_SERVER_URL;
  const token = process.env.UNBORED_PLANNER_TOKEN;
  if (!base || !token) {
    console.error(usage);
    process.exitCode = 2;
  } else {
    try {
      const response = await fetch(new URL("/owner/game/import", base), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ build }),
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        console.error(
          `Game DB import failed (HTTP ${response.status}); check the Server and retry.`,
        );
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify(await response.json()));
      }
    } catch {
      console.error(
        "Game DB import could not finish; check the Server and retry. A completed build is safe to re-import.",
      );
      process.exitCode = 1;
    }
  }
}
