import type { DatabaseSync } from "node:sqlite";

/**
 * Taste (docs/adr/0053): per Account, what the player picked, finished and won
 * over the last 60 days, per category, and the small score nudge it gives.
 */
export const TASTE_DAYS = 60;
export const TASTE_MIN_PICKED = 3;
export const TASTE_MAX_BONUS = 15;
/** A category skipped this much more than done is nudged down at least this far. */
export const TASTE_SKIP_BONUS = -5;

export type TasteRow = {
  category: string;
  picked: number;
  finished: number;
  doneSteps: number;
  skippedSteps: number;
  wins: number;
  /** Only with at least 3 picks. */
  rate?: number;
  bonus: number;
};

type Counts = Omit<TasteRow, "category" | "rate" | "bonus">;

/** D191: rate = (finished + wins + 1) / (picked + 2); bonus round((rate - 0.5) * 30) within ±15. */
export function tasteBonus(row: Counts): { rate?: number; bonus: number } {
  if (row.picked < TASTE_MIN_PICKED) return { bonus: 0 };
  const rate = (row.finished + row.wins + 1) / (row.picked + 2);
  let bonus = Math.round((rate - 0.5) * 30);
  bonus = Math.max(-TASTE_MAX_BONUS, Math.min(TASTE_MAX_BONUS, bonus));
  if (row.skippedSteps > 2 * row.doneSteps) bonus = Math.min(bonus, TASTE_SKIP_BONUS);
  return { rate: Math.round(rate * 1000) / 1000, bonus: bonus === 0 ? 0 : bonus };
}

/** The category of a Request: its idea kind, `surprise`, or `preset:<topic>` (D189). */
export function requestCategory(input: {
  topic: string | null;
  mode: string | null;
  suggestionKind?: string | null;
}): string {
  if (input.suggestionKind) return input.suggestionKind;
  if (input.topic === "surprise") return "surprise";
  return `preset:${input.topic || input.mode || "plan"}`;
}

/** A local plan has no Request: its progress source names it (a chain Quick plan is `chain`). */
function localCategory(source: string | null, mode: string | null): string | undefined {
  if (source === "chain") return "chain";
  if (source === "provider") return `preset:${mode || "plan"}`;
  return undefined;
}

type ProgressBody = {
  mode?: string | null;
  source?: string | null;
  generatedAt?: number;
  done?: { id: string }[];
  skipped?: { id: string }[];
  remaining?: string[];
};

function parse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export function computeTaste(
  db: DatabaseSync,
  account: string,
  characters: { name: string; realm: string }[],
  now = Math.floor(Date.now() / 1000),
): TasteRow[] {
  const since = now - TASTE_DAYS * 86_400;
  const own = new Set(characters.map((row) => `${row.name}\0${row.realm}`));
  const mine = (row: { account: string | null; name: string; realm: string }) =>
    (account !== "" && row.account === account) || own.has(`${row.name}\0${row.realm}`);
  const rows = new Map<string, Counts>();
  const bucket = (category: string) => {
    let row = rows.get(category);
    if (!row) {
      row = { picked: 0, finished: 0, doneSteps: 0, skippedSteps: 0, wins: 0 };
      rows.set(category, row);
    }
    return row;
  };

  // The newest progress per plan: by its generatedAt, else (0.9 and Quick plans) by its step ids.
  const latest = new Map<string, ProgressBody>();
  const progress = db
    .prepare(
      `SELECT account, realm, character, body_json FROM progress WHERE created_at >= ? ORDER BY id DESC`,
    )
    .all(since) as { account: string; realm: string; character: string; body_json: string }[];
  for (const row of progress) {
    if (!mine({ account: row.account, name: row.character, realm: row.realm })) continue;
    const body = parse<ProgressBody>(row.body_json);
    if (!body) continue;
    const key =
      typeof body.generatedAt === "number"
        ? `${row.character}\0${row.realm}\0at:${body.generatedAt}`
        : `${row.character}\0${row.realm}\0ids:${body.source ?? ""}:${stepIds(body)}`;
    if (!latest.has(key)) latest.set(key, body);
  }

  const used = new Set<string>();
  const requests = db
    .prepare(
      `SELECT r.account, r.character_name, r.realm, r.topic, r.mode, r.suggestion_json, p.generated_at
       FROM requests r LEFT JOIN plans p ON p.id = r.plan_id
       WHERE r.type = 'plan' AND r.created_at >= ?`,
    )
    .all(since) as {
    account: string | null;
    character_name: string;
    realm: string;
    topic: string | null;
    mode: string | null;
    suggestion_json: string | null;
    generated_at: number | null;
  }[];
  for (const request of requests) {
    if (!mine({ account: request.account, name: request.character_name, realm: request.realm }))
      continue;
    const suggestion = request.suggestion_json
      ? parse<{ kind?: string }>(request.suggestion_json)
      : undefined;
    const row = bucket(
      requestCategory({
        topic: request.topic,
        mode: request.mode,
        suggestionKind: suggestion?.kind ?? null,
      }),
    );
    row.picked += 1;
    if (request.generated_at === null) continue;
    const key = `${request.character_name}\0${request.realm}\0at:${request.generated_at}`;
    const body = latest.get(key);
    if (!body) continue;
    used.add(key);
    count(row, body);
  }

  for (const [key, body] of latest) {
    if (used.has(key) || key.includes("\0at:")) continue;
    const category = localCategory(body.source ?? null, body.mode ?? null);
    if (!category) continue;
    const row = bucket(category);
    row.picked += 1;
    count(row, body);
  }

  const wins = db
    .prepare(
      `SELECT account, character_name, realm, body_json FROM history WHERE kind = 'win' AND at >= ?`,
    )
    .all(since) as { account: string; character_name: string; realm: string; body_json: string }[];
  for (const win of wins) {
    if (!mine({ account: win.account, name: win.character_name, realm: win.realm })) continue;
    const category = parse<{ category?: string }>(win.body_json)?.category;
    if (category) bucket(category).wins += 1;
  }

  return [...rows.entries()]
    .map(([category, row]) => ({ category, ...row, ...tasteBonus(row) }))
    .sort((a, b) => b.picked - a.picked || a.category.localeCompare(b.category));
}

function stepIds(body: ProgressBody): string {
  const ids = [
    ...(body.done ?? []).map((row) => row.id),
    ...(body.skipped ?? []).map((row) => row.id),
    ...(body.remaining ?? []),
  ];
  return ids.sort().join(",");
}

function count(row: Counts, body: ProgressBody): void {
  const done = body.done?.length ?? 0;
  const skipped = body.skipped?.length ?? 0;
  row.doneSteps += done;
  row.skippedSteps += skipped;
  if (done > 0 && (body.remaining?.length ?? 0) === 0) row.finished += 1;
}

/** Bonus per category, for Suggestions and Ready now. */
export function tasteMap(rows: TasteRow[]): Map<string, number> {
  return new Map(rows.filter((row) => row.bonus !== 0).map((row) => [row.category, row.bonus]));
}
