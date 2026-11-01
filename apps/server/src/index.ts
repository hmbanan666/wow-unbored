import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { configFromEnv } from "./config.ts";
import { connectPostgres, ensurePartitions, migrate } from "./postgres.ts";

const config = configFromEnv();
if (config.databaseUrl) {
  // ADR 0057 rollout step 1: the schema is made and kept current, but every
  // table is still read and written in SQLite until the storage modules move.
  const sql = connectPostgres(config.databaseUrl, { max: config.databasePoolMax });
  const applied = await migrate(sql);
  await ensurePartitions(sql);
  console.log(
    `Postgres schema ready (${applied.length ? `applied ${applied.join(", ")}` : "up to date"}); storage stays on SQLite`,
  );
  await sql.end();
}
const { app, webhook } = createApp(config);
webhook.start();

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: config.port }, (info) => {
  console.log(`Unbored server listening on ${info.port}`);
});
