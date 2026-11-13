import {
  aggregateQuests,
  completedQuestIds,
  questChainSchema,
  questProgress,
  validateQuestChain,
  QUEST_SIGHTING_COLUMNS,
  type QuestSighting,
} from "@unbored/contracts/quests";
import type { Sql } from "./db";
import type { CharacterIdentity } from "#shared/character-page";
import type { PublicQuestChain, QuestOverlay } from "#shared/quests";

/** No session or Account identity enters the public result. */
export async function readPublicQuests(sql: Sql, slug?: string) {
  const rows = await sql<(QuestSighting & { zone_name: string | null })[]>`
    SELECT ${sql(QUEST_SIGHTING_COLUMNS.split(", ").map((c) => `q.${c}`))}, s.slug, z.body->>'Name_lang' AS zone_name
    FROM quest_sightings q JOIN game.quest_slugs s ON s.game = q.game AND s.quest_id = q.quest_id
    LEFT JOIN game.rows z ON z.game = q.game AND z.table_name = 'UiMap' AND z.locale = 'enUS' AND z.id = q.ui_map_id
      AND z.build = (SELECT build FROM game.builds WHERE game = 'forever' ORDER BY build_number DESC LIMIT 1)
    WHERE q.game = 'forever' AND (${slug ?? null}::text IS NULL OR s.slug = ${slug ?? null})
    ORDER BY q.quest_id, q.kind, q.npc_id, q.ui_map_id, q.x, q.y, q.npc_name`;
  const zones = new Map(
    rows.flatMap((r) => (r.ui_map_id && r.zone_name ? [[r.ui_map_id, r.zone_name] as const] : [])),
  );
  return aggregateQuests(rows, zones);
}
export async function readPublicQuestChains(sql: Sql): Promise<PublicQuestChain[]> {
  const rows = await sql<
    { body: unknown }[]
  >`SELECT body FROM game.quest_chains WHERE game = 'forever' AND body->>'status' = 'published' ORDER BY slug`;
  if (!rows.length) return [];
  const sightings = await sql<
    { quest_id: number; slug: string }[]
  >`SELECT DISTINCT q.quest_id, s.slug FROM quest_sightings q JOIN game.quest_slugs s USING (game, quest_id) WHERE q.game = 'forever'`;
  const observed = new Set(sightings.map((r) => r.quest_id));
  const slugs = new Map(sightings.map((r) => [r.quest_id, r.slug]));
  // Covers old snapshots before the one-time completed-id backfill too.
  for (const r of await sql<
    { body: unknown }[]
  >`SELECT s.body FROM sections_latest s JOIN characters c ON c.id = s.owner_id WHERE s.owner_kind = 'char' AND s.section = 'questsDone' AND c.game = 'forever'`)
    for (const id of completedQuestIds(r.body)) observed.add(id);
  return rows.flatMap((r) => {
    const parsed = questChainSchema.safeParse(r.body);
    if (!parsed.success || validateQuestChain(parsed.data, observed).status !== "published")
      return [];
    return [
      {
        ...parsed.data,
        steps: parsed.data.steps.map((s) => ({ ...s, slug: slugs.get(s.questID) ?? null })),
      },
    ];
  });
}
export async function readQuestOverlay(
  sql: Sql,
  account: string,
  identity: CharacterIdentity,
  kind: "quests" | "quest-chains",
  slug: string,
): Promise<QuestOverlay | null> {
  if (identity.game !== "forever") return null;
  const [character] = await sql<{ done: unknown; log: unknown }[]>`
    SELECT d.body AS done, l.body AS log FROM characters c
    LEFT JOIN sections_latest d ON d.owner_kind = 'char' AND d.owner_id = c.id AND d.section = 'questsDone'
    LEFT JOIN sections_latest l ON l.owner_kind = 'char' AND l.owner_id = c.id AND l.section = 'questLog'
    WHERE c.account_id = ${account} AND c.game = ${identity.game} AND c.realm = ${identity.realm} AND c.name = ${identity.name}`;
  if (!character) return null;
  const chains = await readPublicQuestChains(sql);
  const ids =
    kind === "quests"
      ? (await readPublicQuests(sql, slug)).map((q) => q.questID)
      : (chains.find((c) => c.slug === slug)?.steps.map((s) => s.questID) ?? []);
  if (!ids.length) return null;
  const steps = questProgress(ids, character.done, character.log);
  if (kind === "quest-chains") return { character: identity, steps };
  const nextChains = chains
    .filter((c) =>
      questProgress(
        c.steps.map((s) => s.questID),
        character.done,
        character.log,
      ).some((s) => s.questID === ids[0] && s.next),
    )
    .map((c) => ({ slug: c.slug, title: c.title }));
  steps[0]!.next = nextChains.length > 0;
  return { character: identity, steps, nextChains };
}
