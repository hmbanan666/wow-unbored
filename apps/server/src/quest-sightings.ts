import { readFileSync } from "node:fs";
import {
  completedQuestIds,
  aggregateQuests,
  QUEST_SIGHTING_COLUMNS,
  type QuestSighting,
} from "@unbored/contracts/quests";
import { fromJson, type Db } from "./db.ts";
import type { Game } from "@unbored/contracts";
export const QUESTS_SQLITE_SCHEMA = readFileSync(
  new URL("../migrations/0036_quest_sightings.sql", import.meta.url),
  "utf8",
)
  .split("-- PostgreSQL-only")[0]!
  .replaceAll("game.", "game_")
  .replaceAll("body JSONB", "body_json TEXT")
  .replaceAll("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
const integer = (v: unknown, min = 0) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= 2147483647 ? v : null;
const text = (v: unknown, max: number) =>
  typeof v === "string" &&
  v.trim() &&
  v.length <= max &&
  !Array.from(v).some((c) => c === "|" || c.charCodeAt(0) < 32)
    ? v.trim()
    : null;
const coord = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100
    ? Math.round(v * 10) / 10
    : null;
export async function ingestQuestSightings(
  db: Db,
  account: string,
  game: Game,
  body: Record<string, unknown>,
  now: number,
) {
  if (game !== "forever" || !Array.isArray(body.entries)) return;
  for (const raw of body.entries.slice(-500)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = integer(r.questID, 1),
      seen = integer(r.seenAt, 1);
    if (!id || !seen || seen > now + 300) continue;
    for (const kind of ["accept", "turnIn"] as const) {
      const at = integer(r[kind === "accept" ? "acceptedAt" : "turnedInAt"], 1);
      if (!at || at > seen) continue;
      const place =
        r[kind] && typeof r[kind] === "object" ? (r[kind] as Record<string, unknown>) : {};
      const npc = integer(place.npcId, 1);
      const title = r.locale === "enUS" ? text(r.title, 120) : null;
      const row = {
        quest_id: id,
        kind,
        title,
        level: integer(r.level, -1),
        npc_id: npc,
        npc_name: npc && r.locale === "enUS" ? text(place.npcName, 100) : null,
        ui_map_id: integer(place.uiMapID, 1),
        x: coord(place.x),
        y: coord(place.y),
        first_seen: at,
        last_seen: at,
      };
      await upsert(db, account, game, row);
      await reserveSqliteSlug(db, game, id, title);
    }
  }
}
async function upsert(db: Db, account: string, game: string, row: Omit<QuestSighting, "slug">) {
  const cols = QUEST_SIGHTING_COLUMNS.split(", ");
  const earlier =
    row.kind === "accept"
      ? "excluded.first_seen < quest_sightings.first_seen"
      : "excluded.last_seen > quest_sightings.last_seen";
  await db.run(
    `INSERT INTO quest_sightings (account_id, game, ${QUEST_SIGHTING_COLUMNS}) VALUES (?, ?, ${cols.map(() => "?").join(",")}) ON CONFLICT (account_id, game, quest_id, kind) DO UPDATE SET
    title = COALESCE(quest_sightings.title, excluded.title), level = COALESCE(quest_sightings.level, excluded.level),
    ${["npc_id", "ui_map_id", "x", "y"].map((c) => `${c} = CASE WHEN ${earlier} THEN excluded.${c} ELSE quest_sightings.${c} END`).join(",")},
    npc_name = CASE WHEN ${earlier} THEN excluded.npc_name WHEN quest_sightings.npc_id = excluded.npc_id THEN COALESCE(quest_sightings.npc_name, excluded.npc_name) ELSE quest_sightings.npc_name END,
    first_seen = ${db.least("quest_sightings.first_seen", "excluded.first_seen")}, last_seen = ${db.greatest("quest_sightings.last_seen", "excluded.last_seen")}`,
    account,
    game,
    ...cols.map((c) => row[c as keyof typeof row]),
  );
}
export async function readQuestSightings(db: Db, game: Game) {
  const slugs = db.pg ? "game.quest_slugs" : "game_quest_slugs";
  return aggregateQuests(
    await db.all<QuestSighting>(
      `SELECT ${QUEST_SIGHTING_COLUMNS.split(", ")
        .map((c) => "q." + c)
        .join(
          ", ",
        )}, s.slug FROM quest_sightings q JOIN ${slugs} s ON s.game = q.game AND s.quest_id = q.quest_id WHERE q.game = ?`,
      game,
    ),
  );
}
export async function mergeQuestAccount(db: Db, from: string, to: string) {
  for (const row of await db.all<Omit<QuestSighting, "slug"> & { game: string }>(
    `SELECT game, ${QUEST_SIGHTING_COLUMNS} FROM quest_sightings WHERE account_id = ?`,
    from,
  ))
    await upsert(db, to, row.game, row);
  await db.run("DELETE FROM quest_sightings WHERE account_id = ?", from);
}

/** Completed ids are evidence, but carry no invented acceptance time, NPC or title. */
export async function ingestCompletedQuestSightings(
  db: Db,
  account: string,
  game: Game,
  body: unknown,
  now: number,
) {
  if (game !== "forever") return;
  const ids = completedQuestIds(body);
  const existing = new Set(
    (
      await db.all<{ quest_id: number }>(
        "SELECT quest_id FROM quest_sightings WHERE account_id = ? AND game = ? AND kind = 'completed'",
        account,
        game,
      )
    ).map((r) => r.quest_id),
  );
  const fresh = [...new Set(ids)].filter((id) => !existing.has(id));
  for (let offset = 0; offset < fresh.length; offset += 200) {
    const batch = fresh.slice(offset, offset + 200);
    await db.run(
      `INSERT INTO quest_sightings (account_id, game, quest_id, kind, first_seen, last_seen) VALUES ${batch.map(() => "(?, ?, ?, 'completed', ?, ?)").join(",")} ON CONFLICT (account_id, game, quest_id, kind) DO NOTHING`,
      ...batch.flatMap((id) => [account, game, id, now, now]),
    );
    for (const id of batch) await reserveSqliteSlug(db, game, id, null);
  }
}
export async function backfillCompletedQuestSightings(db: Db) {
  for (const r of await db.all<{ account_id: string; body: unknown; at: number }>(
    `SELECT c.account_id, s.${db.body} AS body, COALESCE(s.at, s.updated_at) AS at FROM sections_latest s JOIN characters c ON c.id = s.owner_id WHERE s.owner_kind = 'char' AND s.section = 'questsDone' AND c.game = 'forever'`,
  )) {
    await db.tx(() =>
      ingestCompletedQuestSightings(db, r.account_id, "forever", fromJson(r.body), r.at),
    );
  }
}

async function reserveSqliteSlug(db: Db, game: string, id: number, title: string | null) {
  if (
    db.pg ||
    (await db.get("SELECT 1 FROM game_quest_slugs WHERE game = ? AND quest_id = ?", game, id))
  )
    return;
  let slug =
    title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `quest-${id}`;
  if (slug === "chains") slug += `-${id}`;
  while (await db.get("SELECT 1 FROM game_quest_slugs WHERE game = ? AND slug = ?", game, slug))
    slug += `-${id}`;
  await db.run("INSERT INTO game_quest_slugs VALUES (?, ?, ?)", game, id, slug);
}
