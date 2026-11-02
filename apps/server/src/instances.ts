import path from "node:path";
import type { BlizzardIds } from "./blizzard.ts";
import { cachedCsv, parseCsv } from "./criteria.ts";

export type InstanceQuery = { instanceID?: number; achievementID?: number; lang?: "en" | "ru" };
type Row = Record<string, string>;
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

function rows(csv: string, required: string[]): Row[] {
  const [header = [], ...body] = parseCsv(csv);
  for (const field of ["ID", ...required]) {
    if (!header.includes(field)) throw new Error(`Instance data is missing ${field}.`);
  }
  return body.map((cells) => Object.fromEntries(header.map((field, i) => [field, cells[i] ?? ""])));
}
function index(rows: Row[]) {
  return new Map(rows.map((row) => [Number(row.ID), row]));
}
function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Public DB2 facts only: journal order is not a doorway/portal graph. */
export async function getInstanceGuide(
  dataDir: string,
  query: InstanceQuery,
  options: { fetchImpl?: typeof fetch; gameIds?: BlizzardIds } = {},
) {
  if (!query.instanceID && !query.achievementID)
    throw new Error("Supply instanceID or achievementID.");
  for (const id of [query.instanceID, query.achievementID]) {
    if (id !== undefined && !positive(id)) throw new Error("Ids must be positive integers.");
  }
  const locale = query.lang === "ru" ? "ruRU" : "enUS";
  const dir = path.join(dataDir, "wago");
  const read = async (table: string, fields: string[], localized = true) => {
    const suffix = localized && locale === "ruRU" ? ".ruRU" : "";
    const url = `https://wago.tools/db2/${table}/csv${suffix ? "?locale=ruRU" : ""}`;
    return rows(await cachedCsv(dir, `${table}${suffix}.csv`, url, options.fetchImpl), fields);
  };
  const [instances, encounters, achievements, trees, criteria, maps, floors] = await Promise.all([
    read("JournalInstance", ["Name_lang", "MapID"]),
    read("JournalEncounter", [
      "Name_lang",
      "JournalInstanceID",
      "DungeonEncounterID",
      "OrderIndex",
      "UiMapID",
      "Map_0",
      "Map_1",
    ]),
    read("Achievement", ["Title_lang", "Description_lang", "Instance_ID", "Criteria_tree"]),
    read("CriteriaTree", ["Parent", "CriteriaID", "OrderIndex", "Description_lang", "Amount"]),
    read("Criteria", ["Type", "Asset"], false),
    read("UiMap", ["Name_lang"]),
    read("UiMapGroupMember", ["UiMapID", "Name_lang"]),
  ]);
  const achievementByID = index(achievements);
  const treeByID = index(trees);
  const criteriaByID = index(criteria);
  const mapByID = index(maps);
  const floorNames = new Map(floors.map((row) => [Number(row.UiMapID), row.Name_lang]));
  const children = new Map<number, Row[]>();
  for (const tree of trees) {
    const parent = Number(tree.Parent);
    const list = children.get(parent) ?? [];
    list.push(tree);
    children.set(parent, list);
  }
  for (const list of children.values())
    list.sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex) || Number(a.ID) - Number(b.ID));
  function leaves(achievementID: number): Requirement[] {
    const achievement = achievementByID.get(achievementID);
    if (!achievement) throw new Error(`No achievement ${achievementID} in instance data.`);
    const root = positive(achievement.Criteria_tree);
    if (!root || !treeByID.has(root))
      throw new Error(`Achievement ${achievementID} has no criteria tree.`);
    const out: Requirement[] = [];
    const seen = new Set<number>();
    function walk(id: number) {
      if (seen.has(id) || seen.size >= 2048) throw new Error("Invalid or oversized criteria tree.");
      seen.add(id);
      const tree = treeByID.get(id)!;
      const criteriaID = positive(tree.CriteriaID);
      if (criteriaID) {
        const criterion = criteriaByID.get(criteriaID);
        out.push({
          achievementID,
          criteriaTreeID: id,
          criteriaID,
          description: tree.Description_lang,
          amount: Number(tree.Amount),
          ...(criterion ? { type: Number(criterion.Type), asset: Number(criterion.Asset) } : {}),
        });
      }
      for (const child of children.get(id) ?? []) walk(Number(child.ID));
    }
    walk(root);
    return out;
  }
  const visitedAchievements = new Set<number>();
  const expanded = new Map<number, Requirement[]>();
  function hasTree(id: number | undefined): boolean {
    return id !== undefined && treeByID.has(Number(achievementByID.get(id)?.Criteria_tree));
  }
  function expand(achievementID: number, stack: number[] = []): Requirement[] {
    const cached = expanded.get(achievementID);
    if (cached) return cached;
    if (stack.includes(achievementID) || stack.length >= 16 || visitedAchievements.size >= 256)
      throw new Error("Invalid or oversized child achievement graph.");
    visitedAchievements.add(achievementID);
    const result = leaves(achievementID).flatMap((leaf) =>
      leaf.type === 8 && hasTree(leaf.asset)
        ? expand(leaf.asset!, [...stack, achievementID])
        : [leaf],
    );
    if (result.length > 2048) throw new Error("Oversized child achievement requirements.");
    expanded.set(achievementID, result);
    return result;
  }
  const goal = query.achievementID ? achievementByID.get(query.achievementID) : undefined;
  if (query.achievementID && !goal)
    throw new Error(`No achievement ${query.achievementID} in instance data.`);
  const requirements = query.achievementID ? expand(query.achievementID) : [];
  // Achievement.Instance_ID is a Map.db2 id, never a UiMap or journal id.
  const mapIDs = new Set<number>();
  for (const id of visitedAchievements) {
    const mapID = positive(achievementByID.get(id)?.Instance_ID);
    if (mapID) mapIDs.add(mapID);
  }
  for (const requirement of requirements) {
    if (requirement.type !== 165) continue;
    for (const encounter of encounters.filter(
      (e) => Number(e.DungeonEncounterID) === requirement.asset,
    )) {
      const instance = instances.find((i) => i.ID === encounter.JournalInstanceID);
      const mapID = positive(instance?.MapID);
      if (mapID) mapIDs.add(mapID);
    }
  }
  const candidates = instances.filter((row) => mapIDs.has(Number(row.MapID)));
  const instance = query.instanceID
    ? instances.find((row) => Number(row.ID) === query.instanceID)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (query.instanceID && !instance)
    throw new Error(
      `No journal instance ${query.instanceID}. Use a journal id, not a lockout map id.`,
    );
  const bosses: Boss[] = encounters
    .filter((row) => instance && row.JournalInstanceID === instance.ID)
    .sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex) || Number(a.ID) - Number(b.ID))
    .map((row) => {
      const uiMapID = positive(row.UiMapID);
      const x = row.Map_0.trim() ? Number(row.Map_0) : NaN;
      const y = row.Map_1.trim() ? Number(row.Map_1) : NaN;
      return {
        encounterID: Number(row.ID),
        dungeonEncounterID: positive(row.DungeonEncounterID),
        name: row.Name_lang,
        order: Number(row.OrderIndex),
        ...(uiMapID && x >= 0 && x <= 1 && y >= 0 && y <= 1
          ? {
              point: {
                uiMapID,
                x,
                y,
                name: floorNames.get(uiMapID) || mapByID.get(uiMapID)?.Name_lang || "",
              },
            }
          : {}),
        criteria: [],
      };
    });
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
  for (const leaf of query.achievementID ? leaves(query.achievementID) : []) {
    const child = leaf.type === 8 ? achievementByID.get(leaf.asset!) : undefined;
    const requirements = child && hasTree(Number(child.ID)) ? expand(Number(child.ID)) : [leaf];
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
              name: child.Title_lang,
              description: child.Description_lang,
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
