import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { sqlitePath } from "./config.ts";
import { SqliteDb } from "./db.ts";
import { publishGameContent } from "./game-content.ts";

const { dataDir, file, build, counts, game, timeout } = workerData;
const db = new SqliteDb(new DatabaseSync(sqlitePath(dataDir)));
try {
  const result = await publishGameContent(
    db,
    file,
    build,
    counts,
    AbortSignal.timeout(timeout),
    game,
  );
  parentPort!.postMessage(result);
} finally {
  db.close();
}
