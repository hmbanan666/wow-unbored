import { setTimeout as pause } from "node:timers/promises";
import { fromJson, type Db } from "./db.ts";
import { historyCutoff } from "./retention.ts";
import {
  EVENT_SECTIONS,
  deriveCharacterEvents,
  recipeHistoryEvents,
  writeCharacterEvents,
} from "./character-events.ts";

const MARKER = "character_events_v1";
type Raw = Record<string, unknown>;

/** Keyset batches retain only one Character's five preceding Sections in memory. */
export async function backfillCharacterEvents(
  db: Db,
  options: {
    now?: number;
    batchSize?: number;
    log?: (line: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<void> {
  if (await db.get("SELECT 1 FROM data_meta WHERE key = ?", MARKER)) return;
  const started = Date.now();
  const now = options.now ?? Math.floor(started / 1000);
  const cutoff = historyCutoff(now);
  const batch = Math.max(1, Math.min(500, options.batchSize ?? 200));
  const log = options.log ?? (() => {});
  let owner = "",
    scanned = 0,
    characters = 0;
  log("Character history backfill started");
  while (!options.signal?.aborted) {
    const character = await db.get<{ id: string; account_id: string; game: string }>(
      "SELECT id, account_id, game FROM characters WHERE id > ? ORDER BY id LIMIT 1",
      owner,
    );
    if (!character) break;
    owner = character.id;
    const previous = new Map<string, Raw>();
    const seen = new Set<string>();
    let at = cutoff,
      id = 0;
    while (!options.signal?.aborted) {
      const count = await db.tx(async () => {
        // Share the existing ingest/erase lock only for this small write batch.
        await db.lockKey(`account:${character.account_id}`);
        if (
          !(await db.get(
            "SELECT 1 FROM characters WHERE id = ? AND account_id = ?",
            character.id,
            character.account_id,
          ))
        )
          return 0;
        const rows = await db.all<{
          id: number;
          at: number;
          section: string;
          kind: string;
          body: unknown;
        }>(
          `SELECT id, at, section, kind, ${db.body} AS body FROM section_history
           WHERE owner_kind = 'char' AND owner_id = ? AND at >= ? AND at <= ?
           AND (at > ? OR (at = ? AND id > ?))
           AND section IN (${EVENT_SECTIONS.map(() => "?").join(",")})
           ORDER BY at, id LIMIT ?`,
          character.id,
          cutoff,
          now,
          at,
          at,
          id,
          ...EVENT_SECTIONS,
          batch,
        );
        const events: ReturnType<typeof deriveCharacterEvents> = [];
        for (const row of rows) {
          const body = fromJson<Raw>(row.body) ?? {};
          if (row.kind === "full") {
            events.push(
              ...deriveCharacterEvents(
                row.section,
                previous.get(row.section) ?? null,
                body,
                row.at,
              ),
            );
            previous.set(row.section, body);
          } else {
            // Diffs can be capped and initial counts cannot reconstruct a full set.
            // Never compare a later full snapshot to a stale earlier full snapshot.
            previous.delete(row.section);
            if (row.section === "recipes" && seen.has(row.section) && !body.initial)
              events.push(...recipeHistoryEvents(body, row.at));
          }
          seen.add(row.section);
          at = row.at;
          id = row.id;
        }
        await writeCharacterEvents(db, character.game, character.id, events);
        return rows.length;
      });
      scanned += count;
      if (count < batch) break;
      if (scanned % (batch * 50) === 0)
        log(
          `Character history backfill: ${scanned} rows, ${characters} characters, ${Date.now() - started} ms`,
        );
      // Release the pool and event loop between batches; boot/health never await this job.
      await pause(10);
    }
    characters++;
  }
  if (options.signal?.aborted) return;
  await db.run(
    "INSERT INTO data_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING",
    MARKER,
    String(now),
  );
  log(
    `Character history backfill complete: ${scanned} rows, ${characters} characters, ${Date.now() - started} ms`,
  );
}
