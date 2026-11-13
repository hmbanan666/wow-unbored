import type { CharacterIdentity } from "#shared/character-page";
import type { JourneyStop, ProfileHome } from "#shared/profile-home";
import type { Sql } from "./db";
import { readCharacterPage } from "./character-page";
import { professionName } from "@unbored/contracts/profession-name";
import { professionSkills } from "@unbored/contracts/skill-route";

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const englishToken = (v: unknown) =>
  text(v)
    ?.replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? null;
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
type Milestone = {
  id: number;
  type: string;
  key: string;
  at: number;
  from_value: string | null;
  to_value: string;
  name: string | null;
};

/** All personal reads repeat Account, Game and character ownership. No HTML calls this reader. */
export async function readProfileHome(
  sql: Sql,
  account: string,
  identity: CharacterIdentity,
): Promise<ProfileHome | null> {
  const character = await readCharacterPage(sql, account, identity);
  if (!character) return null;
  const rows = await sql<{ section: string; body: unknown }[]>`
    SELECT s.section, s.body FROM sections_latest s JOIN characters c ON s.owner_kind = 'char' AND s.owner_id = c.id
    WHERE c.account_id = ${account} AND c.game = ${identity.game} AND c.realm = ${identity.realm} AND c.name = ${identity.name}
      AND s.section IN ('char', 'played', 'sessions', 'professions')`;
  const sections = new Map(rows.map((r) => [r.section, record(r.body)]));
  const char = sections.get("char") ?? {};
  const professions = new Map(
    professionSkills(sections.get("professions")).map((p) => [
      String(p.skillLine),
      professionName(p),
    ]),
  );
  // Rank before filtering: recipe-heavy histories cannot crowd out old levels or first skills.
  const milestones = await sql<Milestone[]>`
    WITH events AS (
      SELECT e.*, row_number() OVER (PARTITION BY e.type, e.key ORDER BY e.at, e.id) AS first_skill,
        row_number() OVER (PARTITION BY e.type, e.at / 86400 ORDER BY e.at, e.id) AS daily_recipe
      FROM character_events e JOIN characters c ON c.id = e.character_id AND c.game = e.game
      WHERE c.account_id = ${account} AND c.game = ${identity.game} AND c.realm = ${identity.realm} AND c.name = ${identity.name}
        AND e.type IN ('level_up', 'skill_step', 'rep_standing', 'recipe_learned')
    ), latest AS (SELECT build FROM game.builds WHERE game = ${identity.game} ORDER BY build_number DESC LIMIT 1)
    SELECT e.*, CASE WHEN e.type = 'recipe_learned' THEN (
      SELECT p.body->>'name' FROM game.profession_recipes p WHERE p.game = ${identity.game} AND p.build = (SELECT build FROM latest)
        AND p.spell_id::text = e.to_value ORDER BY p.skill_line LIMIT 1
    ) WHEN e.type = 'rep_standing' THEN (
      SELECT r.body->>'Name_lang' FROM game.rows r WHERE r.game = ${identity.game} AND r.build = (SELECT build FROM latest)
        AND r.table_name = 'Faction' AND r.locale = 'enUS' AND r.id::text = e.key LIMIT 1
    ) END AS name FROM events e
    WHERE (e.type = 'level_up' AND (e.from_value IS NULL OR e.to_value::numeric > e.from_value::numeric))
      OR (e.type = 'skill_step' AND e.first_skill = 1)
      OR (e.type = 'rep_standing' AND e.from_value IS NOT NULL AND e.to_value::numeric > e.from_value::numeric)
      OR (e.type = 'recipe_learned' AND e.daily_recipe <= 3)
    ORDER BY e.at, e.id`;
  const manyLevels = milestones.filter((e) => e.type === "level_up").length > 12;
  const journey: JourneyStop[] = [];
  for (const e of milestones) {
    const value = Number(e.to_value);
    if (e.type === "level_up" && (!manyLevels || value % 5 === 0))
      journey.push({ at: e.at, kind: "level", label: `Level ${value}` });
    if (e.type === "skill_step")
      journey.push({
        at: e.at,
        kind: "profession",
        label: `${professions.get(e.key) ?? "Profession"} · first recorded skill ${value}`,
      });
    if (e.type === "rep_standing")
      journey.push({
        at: e.at,
        kind: "reputation",
        label: `${e.name ?? "Reputation"} · ${standings[value] ?? "tier increased"}`,
      });
    if (e.type === "recipe_learned" && e.name)
      journey.push({ at: e.at, kind: "recipe", label: `Learned ${e.name}` });
  }
  const sessions = list(sections.get("sessions")?.list).map(record);
  const mapIds = [
    ...new Set(
      sessions.flatMap((s) =>
        list(s.maps)
          .map((m) => num(record(m).mapID))
          .filter((id): id is number => id !== null),
      ),
    ),
  ];
  const maps = mapIds.length
    ? await sql<{ id: number; name: string }[]>`
    SELECT id, body->>'Name_lang' AS name FROM game.rows WHERE game = ${identity.game}
      AND build = (SELECT build FROM game.builds WHERE game = ${identity.game} ORDER BY build_number DESC LIMIT 1)
      AND table_name = 'UiMap' AND locale = 'enUS' AND id = ANY(${mapIds}::int[])`
    : [];
  const mapNames = new Map(maps.map((m) => [m.id, m.name]));
  const days = new Map<number, Map<string, number>>();
  for (const s of sessions) {
    const start = num(s.start);
    const zones = list(s.zones)
      .map(text)
      .filter((z): z is string => z !== null);
    if (start === null || !zones.length) continue;
    const day = Math.floor(start / 86400) * 86400;
    const totals = days.get(day) ?? new Map<string, number>();
    const spent = list(s.maps).map(record);
    for (const m of spent) {
      const minutes = num(m.minutes);
      // A single recorded zone is unambiguous. Multiple zones require an exact map-name match.
      const name = zones.length === 1 ? zones[0] : mapNames.get(num(m.mapID) ?? -1);
      if (minutes !== null && minutes > 0 && name && zones.includes(name))
        totals.set(name, (totals.get(name) ?? 0) + minutes);
    }
    days.set(day, totals);
  }
  for (const [at, totals] of days) {
    const most = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (most) journey.push({ at, kind: "zone", label: `Most time in ${most[0]}` });
  }
  return {
    ...character,
    hero: {
      className:
        char.classFile === "DEATHKNIGHT"
          ? "Death Knight"
          : char.classFile === "DEMONHUNTER"
            ? "Demon Hunter"
            : englishToken(char.classFile ?? char.class),
      race: char.raceFile === "Scourge" ? "Undead" : englishToken(char.raceFile ?? char.race),
      faction: text(char.faction),
      level: num(char.level),
      cap: identity.game === "forever" ? 60 : num(char.levelCap),
      xp: num(char.xp),
      xpMax: num(char.xpMax),
      rested: num(char.rested),
      played: num(sections.get("played")?.total),
      ilvl: num(char.ilvl),
      money: num(char.money),
    },
    journey: journey.sort((a, b) => a.at - b.at),
  };
}
