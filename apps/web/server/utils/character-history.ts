import { professionSkills } from "@unbored/contracts/skill-route";
import type {
  CharacterEvent,
  CharacterEventType,
  HistoryFilter,
} from "@unbored/contracts/character-history";
import { eventLabel, type CharacterHistory, type HistoryChart } from "#shared/character-history";
import type { CharacterIdentity } from "#shared/character-page";
import type { Sql } from "./db";
type EventRow = {
  id: number;
  type: CharacterEventType;
  key: string;
  at: number;
  from_value: string | null;
  to_value: string;
};
const event = (r: EventRow): CharacterEvent => ({
  id: r.id,
  type: r.type,
  key: r.key,
  at: r.at,
  from: r.from_value === null ? null : Number(r.from_value),
  to: Number(r.to_value),
});

export async function readHistoryPage(
  sql: Sql,
  account: string,
  identity: CharacterIdentity,
  filter: HistoryFilter = {},
): Promise<CharacterHistory | null> {
  const [character] = await sql<{ id: string; professions: unknown }[]>`
    SELECT c.id, p.body AS professions FROM characters c
    LEFT JOIN sections_latest p ON p.owner_kind = 'char' AND p.owner_id = c.id AND p.section = 'professions'
    WHERE c.account_id = ${account} AND c.game = ${identity.game} AND c.realm = ${identity.realm} AND c.name = ${identity.name}`;
  if (!character) return null;
  // Every data query repeats ownership: Forget my data/reassignment between queries cannot leak rows.
  const rows = await sql<EventRow[]>`
    SELECT e.* FROM character_events e JOIN characters c ON c.id = e.character_id
    WHERE c.account_id = ${account} AND c.game = ${identity.game} AND e.game = c.game AND c.id = ${character.id}
      ${filter.types?.length ? sql`AND e.type = ANY(${filter.types}::text[])` : sql``}
      ${filter.cursor ? sql`AND (e.at, e.id) < (${filter.cursor.at}, ${filter.cursor.id})` : sql``}
    ORDER BY e.at DESC, e.id DESC LIMIT 101`;
  const events = rows.slice(0, 100).map(event);
  // One last point per UTC day per series; chart data is independent of timeline filters/pages.
  const points = await sql<EventRow[]>`
    SELECT DISTINCT ON (e.type, e.key, e.at / 86400) e.*
    FROM character_events e JOIN characters c ON c.id = e.character_id
    WHERE c.account_id = ${account} AND c.game = ${identity.game} AND e.game = c.game AND c.id = ${character.id}
      AND e.type IN ('level_up', 'gold_close', 'skill_step')
    ORDER BY e.type, e.key, e.at / 86400, e.at DESC, e.id DESC`;
  const professions = new Map(
    professionSkills(character.professions).map((p) => [String(p.skillLine), p.name]),
  );
  const ids = events.filter((e) => e.type === "recipe_learned").map((e) => e.to);
  const names = ids.length
    ? await sql<{ spell_id: number; name: string | null }[]>`
    SELECT spell_id, body->>'name' AS name FROM game.profession_recipes
    WHERE game = ${identity.game} AND build = (SELECT build FROM game.builds WHERE game = ${identity.game} ORDER BY build_number DESC LIMIT 1)
      AND spell_id = ANY(${ids}::int[]) ORDER BY skill_line`
    : [];
  const recipes = new Map(names.flatMap((r) => (r.name ? [[r.spell_id, r.name] as const] : [])));
  const charts = new Map<string, HistoryChart>();
  for (const row of points) {
    const key = `${row.type}:${row.key}`;
    let chart = charts.get(key);
    if (!chart) {
      chart = {
        key,
        title:
          row.type === "level_up"
            ? "Level over time"
            : row.type === "gold_close"
              ? "Gold over time"
              : `${professions.get(row.key) ?? `Profession ${row.key}`} skill`,
        money: row.type === "gold_close",
        points: [],
      };
      charts.set(key, chart);
    }
    chart.points.push({ at: row.at, value: Number(row.to_value) });
  }
  const last = events.at(-1);
  return {
    ...identity,
    events: events.map((e) => ({ ...e, label: eventLabel(e, recipes, professions) })),
    charts: [...charts.values()].sort((a, b) => {
      const rank = (c: HistoryChart) => (c.key.startsWith("level_up") ? 0 : c.money ? 1 : 2);
      return rank(a) - rank(b) || a.title.localeCompare(b.title);
    }),
    next: rows.length > 100 && last ? { at: last.at, id: last.id } : null,
  };
}
