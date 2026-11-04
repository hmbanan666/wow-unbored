import type { BlizzardIds } from "./blizzard.ts";
import type { GameDb } from "./game-db.ts";
import type { GameFields as Row, GameTable } from "./game-content.ts";

export type InstanceQuery = { instanceID?: number; achievementID?: number; lang?: "en" | "ru" };
type Requirement = {
  achievementID: number;
  criteriaTreeID: number;
  criteriaID: number;
  description: string;
  amount: number;
  type?: number;
  asset?: number;
};
type GuideCriterion = Requirement & {
  achievement?: { id: number; name: string; description: string };
  requirements: Requirement[];
  evidence: { criteriaID: number; encounterID: number; via: string }[];
};
type Boss = {
  encounterID: number;
  dungeonEncounterID?: number;
  name: string;
  order: number;
  point?: { uiMapID: number; x: number; y: number; name: string };
  criteria: GuideCriterion[];
};

function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Public DB2 facts only: journal order is not a doorway/portal graph. */
export async function getInstanceGuide(
  game: GameDb,
  query: InstanceQuery,
  options: { gameIds?: BlizzardIds } = {},
) {
  if (!query.instanceID && !query.achievementID)
    throw new Error("Supply instanceID or achievementID.");
  for (const id of [query.instanceID, query.achievementID]) {
    if (id !== undefined && !positive(id)) throw new Error("Ids must be positive integers.");
  }
  const locale = query.lang === "ru" ? "ruRU" : "enUS";
  const build = await game.currentBuild();
  if (!build)
    throw new Error("Game DB unavailable; import the current build before requesting a guide.");
  const read = async (table: GameTable, id: number) =>
    (await game.row(table, id, locale, build))?.fields;
  const related = async (table: GameTable, field: string, id: number) => {
    const rows = await game.related(table, field, id, build, locale);
    if (rows.length > 256) throw new Error(`Oversized ${table} relationship; guide unavailable.`);
    return rows;
  };
  const achievementByID = new Map<number, Row>();
  const achievement = async (id: number) => {
    if (!achievementByID.has(id)) {
      const row = await read("Achievement", id);
      if (row) achievementByID.set(id, row);
    }
    return achievementByID.get(id);
  };
  async function leaves(achievementID: number): Promise<Requirement[]> {
    const row = await achievement(achievementID);
    if (!row) throw new Error(`No achievement ${achievementID} in instance data.`);
    const root = positive(row.Criteria_tree);
    if (!root || !(await read("CriteriaTree", root)))
      throw new Error(`Achievement ${achievementID} has no criteria tree.`);
    const out: Requirement[] = [];
    const seen = new Set<number>();
    async function walk(id: number) {
      if (seen.has(id) || seen.size >= 2048) throw new Error("Invalid or oversized criteria tree.");
      seen.add(id);
      const tree = (await read("CriteriaTree", id))!;
      const criteriaID = positive(tree.CriteriaID);
      if (criteriaID) {
        const criterion = await read("Criteria", criteriaID);
        out.push({
          achievementID,
          criteriaTreeID: id,
          criteriaID,
          description: String(tree.Description_lang),
          amount: Number(tree.Amount),
          ...(criterion ? { type: Number(criterion.Type), asset: Number(criterion.Asset) } : {}),
        });
      }
      const children = await related("CriteriaTree", "Parent", id);
      children.sort(
        (a, b) => Number(a.OrderIndex) - Number(b.OrderIndex) || Number(a.ID) - Number(b.ID),
      );
      for (const child of children) await walk(Number(child.ID));
    }
    await walk(root);
    return out;
  }
  const visitedAchievements = new Set<number>();
  const expanded = new Map<number, Requirement[]>();
  async function hasTree(id: number | undefined): Promise<boolean> {
    if (id === undefined) return false;
    const row = await achievement(id);
    const root = positive(row?.Criteria_tree);
    return !!root && !!(await read("CriteriaTree", root));
  }
  async function expand(achievementID: number, stack: number[] = []): Promise<Requirement[]> {
    const cached = expanded.get(achievementID);
    if (cached) return cached;
    if (stack.includes(achievementID) || stack.length >= 16 || visitedAchievements.size >= 256)
      throw new Error("Invalid or oversized child achievement graph.");
    visitedAchievements.add(achievementID);
    const result: Requirement[] = [];
    for (const leaf of await leaves(achievementID)) {
      const requirements =
        leaf.type === 8 && (await hasTree(leaf.asset))
          ? await expand(leaf.asset!, [...stack, achievementID])
          : [leaf];
      result.push(...requirements);
      if (result.length > 2048) throw new Error("Oversized child achievement requirements.");
    }
    if (result.length > 2048) throw new Error("Oversized child achievement requirements.");
    expanded.set(achievementID, result);
    return result;
  }
  const goal = query.achievementID ? await achievement(query.achievementID) : undefined;
  if (query.achievementID && !goal)
    throw new Error(`No achievement ${query.achievementID} in instance data.`);
  const requirements = query.achievementID ? await expand(query.achievementID) : [];
  // Achievement.Instance_ID is a Map.db2 id, never a UiMap or journal id.
  const mapIDs = new Set<number>();
  for (const id of visitedAchievements) {
    const mapID = positive(achievementByID.get(id)?.Instance_ID);
    if (mapID) mapIDs.add(mapID);
  }
  for (const requirement of requirements) {
    if (requirement.type !== 165) continue;
    for (const encounter of await related(
      "JournalEncounter",
      "DungeonEncounterID",
      requirement.asset!,
    )) {
      const instance = await read("JournalInstance", Number(encounter.JournalInstanceID));
      const mapID = positive(instance?.MapID);
      if (mapID) mapIDs.add(mapID);
    }
  }
  const candidates: Row[] = [];
  for (const mapID of mapIDs)
    candidates.push(...(await related("JournalInstance", "MapID", mapID)));
  candidates.sort((a, b) => Number(a.ID) - Number(b.ID));
  const instance = query.instanceID
    ? await read("JournalInstance", query.instanceID)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (query.instanceID && !instance)
    throw new Error(
      `No journal instance ${query.instanceID}. Use a journal id, not a lockout map id.`,
    );
  const encounters = instance
    ? await related("JournalEncounter", "JournalInstanceID", Number(instance.ID))
    : [];
  const bosses: Boss[] = await Promise.all(
    encounters
      .sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex) || Number(a.ID) - Number(b.ID))
      .map(async (row) => {
        const uiMapID = positive(row.UiMapID);
        const x = Number(row.Map_0);
        const y = Number(row.Map_1);
        return {
          encounterID: Number(row.ID),
          dungeonEncounterID: positive(row.DungeonEncounterID),
          name: String(row.Name_lang),
          order: Number(row.OrderIndex),
          ...(uiMapID && x >= 0 && x <= 1 && y >= 0 && y <= 1
            ? {
                point: {
                  uiMapID,
                  x,
                  y,
                  name: String(
                    (await related("UiMapGroupMember", "UiMapID", uiMapID)).at(-1)?.Name_lang ||
                      (await read("UiMap", uiMapID))?.Name_lang ||
                      "",
                  ),
                },
              }
            : {}),
          criteria: [],
        };
      }),
  );
  const creatures = new Map<number, number[]>();
  if (options.gameIds?.enabled && requirements.some((r) => r.type === 0)) {
    // Bound concurrent public-document requests even for large journals.
    for (let i = 0; i < bosses.length; i += 3) {
      await Promise.all(
        bosses.slice(i, i + 3).map(async (boss) => {
          const ids = await options.gameIds!.journalCreatures(boss.encounterID, query.lang);
          if (ids) creatures.set(boss.encounterID, ids);
        }),
      );
    }
  }
  const unmapped: GuideCriterion[] = [];
  for (const leaf of query.achievementID ? await leaves(query.achievementID) : []) {
    const child = leaf.type === 8 ? await achievement(leaf.asset!) : undefined;
    const requirements =
      child && (await hasTree(Number(child.ID))) ? await expand(Number(child.ID)) : [leaf];
    const evidence: GuideCriterion["evidence"] = [];
    for (const requirement of requirements) {
      for (const boss of bosses) {
        const encounter = requirement.type === 165 && boss.dungeonEncounterID === requirement.asset;
        const creature =
          requirement.type === 0 && creatures.get(boss.encounterID)?.includes(requirement.asset!);
        if (encounter || creature)
          evidence.push({
            criteriaID: requirement.criteriaID,
            encounterID: boss.encounterID,
            via: encounter
              ? "Criteria.Type=165 / JournalEncounter.DungeonEncounterID"
              : "Criteria.Type=0 / journal-encounter.creatures.id",
          });
      }
    }
    const criterion: GuideCriterion = {
      ...leaf,
      ...(child
        ? {
            achievement: {
              id: Number(child.ID),
              name: String(child.Title_lang),
              description: String(child.Description_lang),
            },
          }
        : {}),
      requirements,
      evidence,
    };
    const ids = new Set(evidence.map((e) => e.encounterID));
    // A partial child match cannot silently hide another boss's requirements.
    const complete =
      requirements.length > 0 &&
      requirements.every((r) => evidence.some((e) => e.criteriaID === r.criteriaID));
    const boss =
      ids.size === 1 && complete ? bosses.find((b) => ids.has(b.encounterID)) : undefined;
    if (boss) boss.criteria.push(criterion);
    else unmapped.push(criterion);
  }
  return {
    source: "https://wago.tools/db2",
    locale,
    instance: instance
      ? { instanceID: Number(instance.ID), mapID: Number(instance.MapID), name: instance.Name_lang }
      : null,
    candidates: instance
      ? []
      : candidates.map((row) => ({ instanceID: Number(row.ID), name: row.Name_lang })),
    achievement: goal
      ? { id: Number(goal.ID), name: goal.Title_lang, description: goal.Description_lang }
      : undefined,
    entrance: null,
    routing:
      "Journal order and floor points only; entrance, doors and portals are not supplied by these tables.",
    bosses,
    unmapped,
  };
}
