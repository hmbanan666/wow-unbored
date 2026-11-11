import { backfillCharacterEvents } from "./character-history-backfill.ts";
import { serve } from "@hono/node-server";
import { createServer, type Server } from "node:http";

import { createApp } from "./app.ts";
import { configFromEnv } from "./config.ts";
import { connectPostgres, migrate, type Sql } from "./postgres.ts";
import { ensurePartitions, RetentionJob } from "./retention.ts";
import { createShutdown } from "./shutdown.ts";

const config = configFromEnv();
let database: Sql | undefined;
if (config.databaseUrl) {
  // ADR 0057: with DATABASE_URL every table is in Postgres; the SQLite file
  // in UNBORED_DATA_DIR is not opened (it stays as the rollback snapshot).
  database = connectPostgres(config.databaseUrl, { max: config.databasePoolMax });
  const applied = await migrate(database);
  // Writes need this month's partition: a failure here stops the start.
  await ensurePartitions(database);
  // ADR 0057 step 5: month partitions ahead, history past 13 months and old
  // inbox rows dropped, now and then daily. The first pass runs before listen.
  await new RetentionJob(database, (line) => console.log(line)).start();
  console.log(
    `Postgres schema ready (${applied.length ? `applied ${applied.join(", ")}` : "up to date"}); every table on Postgres, the SQLite file untouched`,
  );
}
const { app, store, webhook, inbox, runner, gameWatch, media, startReconnectCleanup, close } =
  createApp({
    ...config,
    database,
  });
runner?.start();
gameWatch.start();
media.start();
webhook.start();
startReconnectCleanup();
if (inbox) {
  // ADR 0057 step 4: snapshots answer 202 and this worker ingests them.
  await inbox.start();
  console.log("Upload inbox on: snapshots are queued and ingested by the worker");
}

const server = serve(
  { fetch: app.fetch, createServer, hostname: "0.0.0.0", port: config.port },
  (info) => {
    console.log(`Unbored server listening on ${info.port}`);
  },
) as Server;

const backfillAbort = new AbortController();
// Scheduled after listen; neither health nor ingest waits for historical derivation.
const historyBackfill = new Promise<void>((resolve) => setImmediate(resolve))
  .then(() => store.data.ready)
  .then(() => backfillCharacterEvents(store.db, { signal: backfillAbort.signal, log: console.log }))
  .catch((error: unknown) =>
    console.error("Character history backfill failed; will retry at next boot", error),
  );
const shutdown = createShutdown({
  server,
  runner,
  webhook,
  inbox,
  close: async () => {
    backfillAbort.abort();
    await historyBackfill;
    await close();
  },
  log: console.log,
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
