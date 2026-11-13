import { professionName } from "@unbored/contracts/profession-name";
import { feedHref, type FeedPage, type FeedPost } from "#shared/character-feed";
import type { Sql } from "./db";
const stub = (): FeedPage => ({ shared: false, posts: [], next: null });
const standings = [
  "",
  "Hated",
  "Hostile",
  "Unfriendly",
  "Neutral",
  "Friendly",
  "Honored",
  "Revered",
  "Exalted",
];
export async function sharedFeedPaths(sql: Sql) {
  const rows = await sql<
    { realm_slug: string; name_slug: string }[]
  >`SELECT s.realm_slug, s.name_slug FROM character_sharing s JOIN characters c ON c.id = s.character_id WHERE s.enabled AND c.account_id = s.account_id AND c.game = 'forever' ORDER BY s.realm_slug, s.name_slug`;
  return rows.map((r) => feedHref(r.realm_slug, r.name_slug));
}
export async function readCharacterFeed(
  sql: Sql,
  realm: string,
  name: string,
  cursor?: string,
): Promise<FeedPage> {
  return readFeed(sql, { realm, name }, cursor);
}
export async function readCommunityFeed(sql: Sql, cursor?: string): Promise<FeedPage> {
  return readFeed(sql, undefined, cursor);
}
async function readFeed(
  sql: Sql,
  identity?: { realm: string; name: string },
  cursor?: string,
): Promise<FeedPage> {
  let before: { at: number; id: string } | null = null;
  if (cursor) {
    const match = /^(\d{1,12}):(e\d+|s[0-9a-f-]{36})$/.exec(cursor);
    if (!match) throw new Error("Invalid feed page");
    before = { at: Number(match[1]), id: match[2]! };
  }
  // One statement: visibility and posts share the same database snapshot. No identity escapes for a stub.
  const rows = await sql<
    {
      name: string;
      realm: string;
      realm_slug: string;
      name_slug: string;
      posts: FeedPost[];
    }[]
  >`
    WITH shared AS (
      SELECT c.id, c.account_id, c.name, c.realm, s.realm_slug, s.name_slug, s.history_after FROM character_sharing s
      JOIN characters c ON c.id = s.character_id WHERE s.enabled AND c.account_id = s.account_id AND c.game = 'forever'
      ${identity ? sql`AND s.realm_slug = ${identity.realm} AND s.name_slug = ${identity.name}` : sql``}
    ), events AS (
      SELECT e.*, row_number() OVER (PARTITION BY e.character_id, e.type, e.key ORDER BY e.at, e.id) first_skill,
        row_number() OVER (PARTITION BY e.character_id, e.type, e.at / 86400 ORDER BY e.at, e.id) daily_recipe
      FROM character_events e JOIN shared s ON s.id = e.character_id
      WHERE e.game = 'forever' AND e.at >= s.history_after AND e.type IN ('level_up', 'skill_step', 'recipe_learned', 'rep_standing')
    ), named AS (
      SELECT e.*, CASE WHEN e.type = 'recipe_learned' THEN (
        SELECT p.body->>'name' FROM game.profession_recipes p WHERE p.game = 'forever'
          AND p.build = (SELECT build FROM game.builds WHERE game = 'forever' ORDER BY build_number DESC LIMIT 1)
          AND p.spell_id::text = e.to_value ORDER BY p.skill_line LIMIT 1
      ) WHEN e.type = 'rep_standing' THEN (
        SELECT r.body->>'Name_lang' FROM game.rows r WHERE r.game = 'forever'
          AND r.build = (SELECT build FROM game.builds WHERE game = 'forever' ORDER BY build_number DESC LIMIT 1)
          AND r.table_name = 'Faction' AND r.locale = 'enUS' AND r.id::text = e.key LIMIT 1
      ) END AS title FROM events e
    ), posts AS (
      SELECT 'e' || e.id AS id, e.character_id, e.at, e.type, e.key, e.to_value, e.title, NULL::jsonb image
      FROM named e WHERE (e.type = 'level_up' AND (e.from_value IS NULL OR e.to_value::numeric > e.from_value::numeric))
        OR (e.type = 'skill_step' AND e.first_skill = 1)
        OR (e.type = 'rep_standing' AND e.from_value IS NOT NULL AND e.to_value::numeric > e.from_value::numeric)
        OR (e.type = 'recipe_learned' AND e.daily_recipe <= 3 AND e.title IS NOT NULL)
      UNION ALL
      SELECT 's' || p.id, p.character_id, p.at, 'screenshot', '', '', '',
        jsonb_build_object('id', p.id, 'width', p.width, 'height', p.height, 'variants', p.variants)
      FROM character_screenshots p JOIN shared s ON s.id = p.character_id AND s.account_id = p.account_id
    ), page AS (
      SELECT p.*, s.name, s.realm, s.realm_slug, s.name_slug FROM posts p JOIN shared s ON s.id = p.character_id
      ${before ? sql`WHERE (p.at, p.id) < (${before.at}, ${before.id})` : sql``}
      ORDER BY p.at DESC, p.id DESC LIMIT 25
    ) SELECT s.name, s.realm, s.realm_slug, s.name_slug,
      COALESCE((SELECT jsonb_agg(row_to_json(p) ORDER BY p.at DESC, p.id DESC) FROM page p), '[]'::jsonb) posts
      FROM shared s LIMIT 1`;
  const row = rows[0];
  if (!row) return identity ? stub() : { shared: true, posts: [], next: null };
  type Raw = {
    id: string;
    at: number;
    type: string;
    key: string;
    to_value: string;
    title: string | null;
    name: string;
    realm: string;
    realm_slug: string;
    name_slug: string;
    image?: FeedPost["image"];
  };
  const raw = row.posts as unknown as Raw[];
  const posts: FeedPost[] = raw.slice(0, 24).map((p) => {
    const value = Number(p.to_value);
    const kind =
      p.type === "level_up"
        ? "level"
        : p.type === "skill_step"
          ? "profession"
          : p.type === "recipe_learned"
            ? "recipe"
            : p.type === "rep_standing"
              ? "reputation"
              : "screenshot";
    const label =
      kind === "level"
        ? `Level ${value}`
        : kind === "profession"
          ? `${professionName({ skillLine: Number(p.key), name: "Profession" }) ?? "Profession"} · first recorded skill ${value}`
          : kind === "recipe"
            ? `Learned ${p.title}`
            : kind === "reputation"
              ? `${p.title ?? "Reputation"} · ${standings[value] ?? "tier increased"}`
              : "A moment in WoW Forever";
    return {
      id: p.id,
      at: p.at,
      name: p.name,
      realm: p.realm,
      href: feedHref(p.realm_slug, p.name_slug),
      kind,
      label,
      ...(p.image ? { image: p.image } : {}),
    };
  });
  const last = posts.at(-1);
  return {
    shared: true,
    ...(identity ? { name: row.name, realm: row.realm } : {}),
    posts,
    next: raw.length > 24 && last ? `${last.at}:${last.id}` : null,
  };
}
