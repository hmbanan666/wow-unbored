import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

export type CriteriaHit = {
  achievementId: number;
  criteriaTreeId: number;
  criteriaID: number;
  criteriaIndex: number;
  description: string;
};

type TreeNode = {
  id: number;
  parent: number;
  criteriaId: number;
  orderIndex: number;
  description: string;
};

const TREE_URL = "https://wago.tools/db2/CriteriaTree/csv";
const ACH_URL = "https://wago.tools/db2/Achievement/csv";
const MAX_BYTES = 20_000_000;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.length > 0));
}

function column(header: string[], name: string): number {
  const index = header.findIndex((value) => value === name);
  if (index < 0) throw new Error(`CSV is missing ${name}.`);
  return index;
}

export function lookupCriteria(
  treeCsv: string,
  achievementCsv: string,
  achievementId: number,
  criteriaTreeId: number,
): CriteriaHit {
  const treeRows = parseCsv(treeCsv);
  const treeHeader = treeRows[0] ?? [];
  const idCol = column(treeHeader, "ID");
  const parentCol = column(treeHeader, "Parent");
  const criteriaCol = column(treeHeader, "CriteriaID");
  const orderCol = column(treeHeader, "OrderIndex");
  const descCol = column(treeHeader, "Description_lang");
  const nodes = new Map<number, TreeNode>();
  const children = new Map<number, TreeNode[]>();
  for (const row of treeRows.slice(1)) {
    const id = Number(row[idCol]);
    if (!Number.isInteger(id)) continue;
    const node: TreeNode = {
      id,
      parent: Number(row[parentCol]) || 0,
      criteriaId: Number(row[criteriaCol]) || 0,
      orderIndex: Number(row[orderCol]) || 0,
      description: row[descCol] ?? "",
    };
    nodes.set(id, node);
    const list = children.get(node.parent) ?? [];
    list.push(node);
    children.set(node.parent, list);
  }
  const node = nodes.get(criteriaTreeId);
  if (!node) throw new Error(`No criteria tree ${criteriaTreeId}.`);

  const achRows = parseCsv(achievementCsv);
  const achHeader = achRows[0] ?? [];
  const achIdCol = column(achHeader, "ID");
  const rootCol = column(achHeader, "Criteria_tree");
  let root = 0;
  for (const row of achRows.slice(1)) {
    if (Number(row[achIdCol]) === achievementId) {
      root = Number(row[rootCol]) || 0;
      break;
    }
  }
  if (!root) throw new Error(`Achievement ${achievementId} has no criteria tree.`);

  let cursor: TreeNode | undefined = node;
  let guard = 0;
  while (cursor && cursor.id !== root && guard < 40) {
    cursor = cursor.parent ? nodes.get(cursor.parent) : undefined;
    guard += 1;
  }
  if (!cursor || cursor.id !== root) {
    throw new Error(`Criteria tree ${criteriaTreeId} is not part of achievement ${achievementId}.`);
  }
  if (node.criteriaId <= 0) {
    throw new Error(`Criteria tree ${criteriaTreeId} is a parent row. Use one of its children.`);
  }

  const leaves: TreeNode[] = [];
  const walk = (id: number) => {
    const kids = (children.get(id) ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
    for (const kid of kids) {
      if (kid.criteriaId > 0) leaves.push(kid);
      walk(kid.id);
    }
  };
  walk(root);
  const index = leaves.findIndex((leaf) => leaf.id === criteriaTreeId);
  return {
    achievementId,
    criteriaTreeId,
    criteriaID: node.criteriaId,
    criteriaIndex: index >= 0 ? index + 1 : node.orderIndex || 1,
    description: node.description,
  };
}

async function cachedCsv(dir: string, name: string, url: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  try {
    const stat = statSync(file);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000 && stat.size > 0 && stat.size <= MAX_BYTES) {
      return readFileSync(file, "utf8");
    }
  } catch {
    // download
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${name} (${response.status}).`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error(`${name} is larger than the cache limit.`);
  writeFileSync(file, text);
  return text;
}

export async function resolveCriteria(
  dataDir: string,
  achievementId: number,
  criteriaTreeId: number,
): Promise<CriteriaHit> {
  const dir = path.join(dataDir, "wago");
  const [treeCsv, achievementCsv] = await Promise.all([
    cachedCsv(dir, "CriteriaTree.csv", TREE_URL),
    cachedCsv(dir, "Achievement.csv", ACH_URL),
  ]);
  return lookupCriteria(treeCsv, achievementCsv, achievementId, criteriaTreeId);
}
