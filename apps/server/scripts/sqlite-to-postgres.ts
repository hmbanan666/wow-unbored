/**
 * One-off SQLite -> PostgreSQL transfer (ADR 0057 rollout step 6).
 *
 *   DATABASE_URL=postgres://... node --experimental-sqlite --experimental-strip-types \
 *     scripts/sqlite-to-postgres.ts [--sqlite /data/unbored.sqlite] [--dry-run] [--force]
 *
 * The target URL comes only from the DATABASE_URL environment variable, so the
 * password never lands in argv or shell history. Exits 0 when every table
 * matches, 1 on any error or mismatch (nothing committed), 2 on bad arguments.
 * See docs/DEVELOPMENT.md, "Postgres cutover".
 */
import path from "node:path";
import { parseArgs } from "node:util";

import { connectPostgres } from "../src/postgres.ts";
import { transfer } from "../src/transfer.ts";

const usage = `Usage: DATABASE_URL=postgres://... node --experimental-sqlite --experimental-strip-types scripts/sqlite-to-postgres.ts [--sqlite FILE] [--dry-run] [--force] [--batch N]`;

let args;
try {
  args = parseArgs({
    options: {
      sqlite: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      batch: { type: "string", default: "500" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  }).values;
} catch (error) {
  console.error(`${(error as Error).message}\n${usage}`);
  process.exit(2);
}
if (args.help) {
  console.log(usage);
  process.exit(0);
}
const url = process.env.DATABASE_URL?.trim();
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error(`DATABASE_URL must be set to the target postgres:// URL.\n${usage}`);
  process.exit(2);
}
const batchRows = Number(args.batch);
if (!Number.isInteger(batchRows) || batchRows < 1 || batchRows > 5000) {
  console.error("--batch must be a whole number from 1 to 5000.");
  process.exit(2);
}
const sqlitePath =
  args.sqlite ?? path.join(process.env.UNBORED_DATA_DIR?.trim() || "/data", "unbored.sqlite");

// No statement timeout: the copy and the checksum read are long statements.
const sql = connectPostgres(url, {
  max: 2,
  statementTimeoutMs: 0,
  application_name: "unbored-transfer",
});
const started = Date.now();
try {
  console.log(`${args["dry-run"] ? "Dry run" : "Transfer"}: ${sqlitePath} -> Postgres`);
  const report = await transfer({
    sqlitePath,
    sql,
    force: args.force,
    dryRun: args["dry-run"],
    batchRows,
    log: (line) => console.log(line),
  });
  const rows = report.tables.reduce((sum, table) => sum + table.rows, 0);
  console.log(
    `${report.committed ? "Committed" : "Dry run ok, rolled back"}: ${report.tables.length} tables, ${rows} rows verified in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
} catch (error) {
  console.error(`Transfer FAILED, nothing committed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
