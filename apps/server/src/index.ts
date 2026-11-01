import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { configFromEnv } from "./config.ts";
import { connectPostgres, ensurePartitions, migrate, type Sql } from "./postgres.ts";

const config = configFromEnv();
let database: Sql | undefined;
if (config.databaseUrl) {
  // ADR 0057 rollout step 2: the game id and creature name caches and the
  // Suggestions are in Postgres; every other table stays in SQLite until step 3.
  database = connectPostgres(config.databaseUrl, { max: config.databasePoolMax });
  const applied = await migrate(database);
  await ensurePartitions(database);
  console.log(
    `Postgres schema ready (${applied.length ? `applied ${applied.join(", ")}` : "up to date"}); id cache, creature names and Suggestions on Postgres, the rest on SQLite`,
  );
}
const { app, webhook } = createApp({ ...config, database });
webhook.start();

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: config.port }, (info) => {
  console.log(`Unbored server listening on ${info.port}`);
});
