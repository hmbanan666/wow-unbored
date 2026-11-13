import { connectPostgres, migrate } from "../src/postgres.ts";
import { PostgresDb } from "../src/db.ts";
import { publishQuestChains } from "../src/quest-chains.ts";
import { backfillCompletedQuestSightings } from "../src/quest-sightings.ts";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = connectPostgres(url, { max: 1 });
try {
  await migrate(sql);
  const db = new PostgresDb(sql);
  await backfillCompletedQuestSightings(db);
  console.log(JSON.stringify(await publishQuestChains(db), null, 2));
} finally {
  await sql.end();
}
