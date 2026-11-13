import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  computeTodayGoals,
  todayGoalComplete,
  type TodayGoal,
  type TodaySet,
} from "@unbored/contracts/today-goals";
import { professionName } from "@unbored/contracts/profession-name";
import {
  resolveSighting,
  SIGHTING_COLUMNS,
  type RecipeSighting,
} from "@unbored/contracts/recipe-sources";
import type { Db } from "./db.ts";
import { readAllProfessionProgress } from "./profession-progress.ts";

export const GOALS_SQLITE_SCHEMA = readFileSync(
  new URL("../migrations/0033_character_goals.sql", import.meta.url),
  "utf8",
)
  .split("-- PostgreSQL-only permissions:")[0]!
  .replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ");
type Owner = { accountId: string; characterId: string; game: "retail" | "forever" };
type GoalRow = {
  skill_line: number;
  position: number;
  set_id: string;
  goal_id: string;
  day: number;
  created_at: number;
  completed_at: number | null;
  goal_body: string;
};
/** Account lock serializes views, ingest, erasure and concurrent tabs on both backends. */
export async function todayGoals(
  db: Db,
  owner: Owner,
  options: { now?: number; create?: boolean; skillLine?: number } = {},
): Promise<TodaySet[]> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const day = Math.floor(now / 86400);
  return db.tx(async () => {
    await db.lockKey(`account:${owner.accountId}`);
    const character = await db.get<{ id: string; game: "forever" | "retail" }>(
      "SELECT id, game FROM characters WHERE id = ? AND account_id = ? AND game = ?",
      owner.characterId,
      owner.accountId,
      owner.game,
    );
    if (!character) return [];
    const rows = await db.all<GoalRow>(
      `SELECT g.* FROM character_goals g JOIN characters c ON c.id = g.character_id WHERE c.id = ? AND c.account_id = ? AND c.game = ? ORDER BY g.skill_line, g.position`,
      owner.characterId,
      owner.accountId,
      owner.game,
    );
    if (options.create === false && !rows.length) return [];
    const professions = await readAllProfessionProgress(db, character);
    const sightings = await db.all<RecipeSighting & { source_key: string }>(
      `SELECT ${SIGHTING_COLUMNS}, source_key FROM recipe_sightings WHERE account_id = ? AND game = ?`,
      owner.accountId,
      owner.game,
    );
    const out: TodaySet[] = [];
    for (const p of professions) {
      if (
        options.skillLine !== undefined &&
        p.skillLine !== options.skillLine &&
        !p.aliases.includes(options.skillLine)
      )
        continue;
      const lines = [p.skillLine, ...p.aliases, ...(p.routes ?? []).map((r) => r.route.skillLine)];
      const seen = sightings
        .filter((s) => lines.includes(s.skill_line ?? 0) || resolveSighting(s, p.album).length > 0)
        .map((s) => `${s.kind}:${s.npc_id}:${s.source_key}:${s.last_seen}`)
        .sort();
      const old = rows.filter((r) => r.skill_line === p.skillLine);
      let set: TodaySet;
      // Tick-only ingest preserves the visible set. A subsequent view rotates an already finished set.
      if (
        options.create !== false &&
        (!old.length || old[0]!.day !== day || old.every((r) => r.completed_at !== null))
      ) {
        const goals = computeTodayGoals(p, owner.game, seen);
        await db.run(
          `DELETE FROM character_goals WHERE character_id = ? AND skill_line = ? AND character_id IN (SELECT id FROM characters WHERE account_id = ? AND game = ?)`,
          character.id,
          p.skillLine,
          owner.accountId,
          owner.game,
        );
        if (!goals.length) continue;
        set = {
          id: randomUUID(),
          skillLine: p.skillLine,
          profession: professionName(p),
          day,
          createdAt: now,
          goals: goals.map((g) => ({ ...g, completedAt: null })),
        };
        for (const [position, g] of goals.entries())
          await db.run(
            `INSERT INTO character_goals (character_id, skill_line, position, set_id, goal_id, day, created_at, goal_body)
          SELECT id, ?, ?, ?, ?, ?, ?, ? FROM characters WHERE id = ? AND account_id = ? AND game = ?`,
            p.skillLine,
            position,
            set.id,
            g.id,
            day,
            now,
            JSON.stringify(g),
            character.id,
            owner.accountId,
            owner.game,
          );
      } else {
        if (!old.length) continue;
        set = {
          id: old[0]!.set_id,
          skillLine: p.skillLine,
          profession: professionName(p),
          day: old[0]!.day,
          createdAt: old[0]!.created_at,
          goals: [],
        };
        for (const r of old) {
          const g = JSON.parse(r.goal_body) as TodayGoal;
          const completedAt = r.completed_at ?? (todayGoalComplete(g, p, seen) ? now : null);
          if (completedAt !== r.completed_at)
            await db.run(
              `UPDATE character_goals SET completed_at = ? WHERE character_id = ? AND skill_line = ? AND position = ? AND character_id IN (SELECT id FROM characters WHERE account_id = ? AND game = ?)`,
              completedAt,
              character.id,
              p.skillLine,
              r.position,
              owner.accountId,
              owner.game,
            );
          set.goals.push({ ...g, completedAt });
        }
      }
      out.push(set);
    }
    return out;
  });
}
/** A sighting on an Alt can complete coverage on any Character in the same Account/Game. */
export async function tickAccountGoals(
  db: Db,
  accountId: string,
  game: Owner["game"],
  now: number,
) {
  const characters = await db.all<{ id: string }>(
    `SELECT c.id FROM characters c WHERE c.account_id = ? AND c.game = ? AND EXISTS (SELECT 1 FROM character_goals g WHERE g.character_id = c.id AND g.completed_at IS NULL)`,
    accountId,
    game,
  );
  for (const c of characters)
    await todayGoals(db, { accountId, game, characterId: c.id }, { now, create: false });
}
