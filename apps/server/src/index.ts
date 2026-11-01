import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { configFromEnv } from "./config.ts";
import { connectPostgres, ensurePartitions, migrate, type Sql } from "./postgres.ts";

const config = configFromEnv();
let database: Sql | undefined;
if (config.databaseUrl) {
  // ADR 0057: with DATABASE_URL every table is in Postgres; the SQLite file
  // in UNBORED_DATA_DIR is not opened (it stays as the rollback snapshot).
  database = connectPostgres(config.databaseUrl, { max: config.databasePoolMax });
  const applied = await migrate(database);
  await ensurePartitions(database);
  console.log(
    `Postgres schema ready (${applied.length ? `applied ${applied.join(", ")}` : "up to date"}); every table on Postgres, the SQLite file untouched`,
  );
}
const { app, webhook } = createApp({ ...config, database });
webhook.start();

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: config.port }, (info) => {
  console.log(`Unbored server listening on ${info.port}`);
});
