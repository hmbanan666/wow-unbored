import { backfillCompletedQuestSightings } from "./quest-sightings.ts";
import { readdirSync, readFileSync } from "node:fs";
import {
  completedQuestIds,
  questChainSchema,
  questProgress,
  validateQuestChain,
  type QuestChain,
} from "@unbored/contracts/quests";
import { type Db, fromJson } from "./db.ts";
import type { CharacterRow } from "./data.ts";

export function authoredQuestChains(
  directory = new URL("../content/forever/quest-chains/", import.meta.url),
): QuestChain[] {
  return readdirSync(directory)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const chain = questChainSchema.parse(
        JSON.parse(readFileSync(new URL(file, directory), "utf8")),
      );
      if (`${chain.slug}.json` !== file) throw new Error(`Chain slug must match filename: ${file}`);
      return chain;
    });
}
export async function observedQuestIds(db: Db, game: string) {
  const ids = new Set(
    (
      await db.all<{ quest_id: number }>(
        "SELECT DISTINCT quest_id FROM quest_sightings WHERE game = ?",
        game,
      )
    ).map((r) => r.quest_id),
  );
  for (const r of await db.all<{ body: unknown }>(
    `SELECT s.${db.body} AS body FROM sections_latest s JOIN characters c ON c.id = s.owner_id WHERE s.owner_kind = 'char' AND s.section = 'questsDone' AND c.game = ?`,
    game,
  ))
    for (const id of completedQuestIds(fromJson(r.body))) ids.add(id);
  return ids;
}
export async function publishQuestChains(db: Db, input: unknown[] = authoredQuestChains()) {
  const chains = input.map((c) => questChainSchema.parse(c));
  if (new Set(chains.map((c) => c.slug)).size !== chains.length)
    throw new Error("Duplicate chain slug");
  return db.tx(async () => {
    await backfillCompletedQuestSightings(db);
    const evidence = await observedQuestIds(db, "forever");
    const table = db.pg ? "game.quest_chains" : "game_quest_chains";
    // This directory is authoritative, including removed or reverted-to-draft definitions.
    await db.run(`DELETE FROM ${table} WHERE game = 'forever'`);
    const results = [];
    for (const chain of chains) {
      const validation = validateQuestChain(chain, evidence);
      await db.run(
        `INSERT INTO ${table} (game, slug, ${db.body}) VALUES ('forever', ?, ?)`,
        chain.slug,
        JSON.stringify({ ...chain, status: validation.status }),
      );
      results.push({ slug: chain.slug, ...validation });
    }
    return results;
  });
}
export async function readPublishedQuestChains(db: Db, game: string): Promise<QuestChain[]> {
  const table = db.pg ? "game.quest_chains" : "game_quest_chains";
  const rows = await db.all<{ body: unknown }>(
    `SELECT ${db.body} AS body FROM ${table} WHERE game = ? ORDER BY slug`,
    game,
  );
  if (!rows.length) return [];
  const evidence = await observedQuestIds(db, game);
  return rows.flatMap((row) => {
    const parsed = questChainSchema.safeParse(fromJson(row.body));
    return parsed.success && validateQuestChain(parsed.data, evidence).status === "published"
      ? [parsed.data]
      : [];
  });
}
export async function readQuestChainProgress(
  db: Db,
  character: Pick<CharacterRow, "id" | "game">,
  slug: string,
) {
  const chain = (await readPublishedQuestChains(db, character.game)).find((c) => c.slug === slug);
  if (!chain) return null;
  const sections = Object.fromEntries(
    (
      await db.all<{ section: string; body: unknown }>(
        `SELECT section, ${db.body} AS body FROM sections_latest WHERE owner_kind = 'char' AND owner_id = ? AND section IN ('questsDone','questLog')`,
        character.id,
      )
    ).map((r) => [r.section, fromJson(r.body)]),
  );
  const progress = questProgress(
    chain.steps.map((s) => s.questID),
    sections.questsDone,
    sections.questLog,
  );
  return {
    game: character.game,
    slug,
    title: chain.title,
    steps: chain.steps.map((s, i) => ({ ...s, ...progress[i]! })),
  };
}
