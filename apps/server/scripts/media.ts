/** Owner media maintenance inside the Server container (ADR 0077). */
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { connectPostgres } from "../src/postgres.ts";
import { PostgresDb } from "../src/db.ts";
import { BlizzardIds, PostgresIdCache, blizzardFromEnv } from "../src/blizzard.ts";
import { GameDb } from "../src/game-db.ts";
import { MediaResolver } from "../src/media.ts";
import { MediaStore } from "../src/media-store.ts";
import { mediaName } from "../src/media-name.ts";

const usage =
  "Usage: node scripts/media.ts sync [--slug s] | refresh | add-image FILE --ref-kind screenshot --alt TEXT | gc";
const {
  positionals: [command, file],
  values,
} = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: "string" },
    "ref-kind": { type: "string" },
    alt: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) console.log(usage);
else if (
  !process.env.DATABASE_URL ||
  !["sync", "refresh", "add-image", "gc"].includes(command ?? "")
) {
  console.error(`${usage}\nDATABASE_URL must be set.`);
  process.exitCode = 2;
} else {
  const sql = connectPostgres(process.env.DATABASE_URL);
  const db = new PostgresDb(sql);
  const config = blizzardFromEnv();
  const auth = new BlizzardIds(config, new PostgresIdCache(sql));
  const game = new GameDb(db, process.env.UNBORED_DATA_DIR || "/data");
  const store = new MediaStore(
    db,
    config ? new MediaResolver(config.region, auth) : null,
    undefined,
    undefined,
    undefined,
    console.error,
    (ref) => mediaName(game, ref),
  );
  try {
    if ((command === "sync" || command === "refresh") && !config)
      throw new Error("Blizzard credentials are required for sync and refresh");
    if (command === "sync") await store.syncPublished(values.slug);
    else if (command === "refresh") await store.refresh();
    else if (command === "gc") console.log(`Removed ${await store.gc()} files.`);
    else {
      if (!file || !values["ref-kind"] || !values.alt) throw new Error(usage);
      if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error("Own image exceeds 20 MB");
      console.log(await store.addImage(await readFile(file), values["ref-kind"], values.alt));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Media maintenance failed");
    process.exitCode = 1;
  } finally {
    await store.stop();
    await sql.end();
  }
}
