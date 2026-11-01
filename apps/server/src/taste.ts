import { fromJson, type Db } from "./db.ts";

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
  /** Picks whose plan has progress from the game: the only ones that can be judged. */
  tracked: number;
  finished: number;
  doneSteps: number;
  skippedSteps: number;
  wins: number;
  /** Only with at least 3 picks. */
  rate?: number;
  bonus: number;
};

type Counts = Omit<TasteRow, "category" | "rate" | "bonus">;

/**
 * D191, over tracked picks: rate = (finished + wins + 1) / (tracked + 2), at most 1;
 * bonus round((rate - 0.5) * 30) within ±15. A pick with no progress from the game
 * (never opened, or from before progress named its plan) says nothing either way.
 */
export function tasteBonus(row: Counts): { rate?: number; bonus: number } {
  if (row.tracked < TASTE_MIN_PICKED) return { bonus: 0 };
  const rate = Math.min(1, (row.finished + row.wins + 1) / (row.tracked + 2));
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

function parse<T>(value: unknown): T | undefined {
  return fromJson<T>(value) ?? undefined;
}

export async function computeTaste(
  db: Db,
  account: string,
  characters: { name: string; realm: string }[],
  now = Math.floor(Date.now() / 1000),
): Promise<TasteRow[]> {
  const since = now - TASTE_DAYS * 86_400;
  const own = new Set(characters.map((row) => `${row.name}\0${row.realm}`));
  const mine = (row: { account: string | null; name: string; realm: string }) =>
    (account !== "" && row.account === account) || own.has(`${row.name}\0${row.realm}`);
  const rows = new Map<string, Counts>();
  const bucket = (category: string) => {
    let row = rows.get(category);
    if (!row) {
      row = { picked: 0, tracked: 0, finished: 0, doneSteps: 0, skippedSteps: 0, wins: 0 };
      rows.set(category, row);
    }
    return row;
  };

  // The newest progress per plan: by its generatedAt, else (0.9 and Quick plans) by its step ids.
  const latest = new Map<string, ProgressBody>();
  /** Progress without generatedAt from a delivered plan, by Character and step ids: key, newest post time. */
  const byIds = new Map<string, { key: string; at: number }>();
  const progress = await db.all<{
    account: string;
    realm: string;
    character: string;
    body_json: unknown;
    created_at: number;
  }>(
    `SELECT account, realm, character, ${db.body} AS body_json, created_at FROM progress
     WHERE created_at >= ? ORDER BY id DESC`,
    since,
  );
  for (const row of progress) {
    if (!mine({ account: row.account, name: row.character, realm: row.realm })) continue;
    const body = parse<ProgressBody>(row.body_json);
    if (!body) continue;
    const ids = stepIds(body);
    const key =
      typeof body.generatedAt === "number"
        ? `${row.character}\0${row.realm}\0at:${body.generatedAt}`
        : `${row.character}\0${row.realm}\0ids:${body.source ?? ""}:${ids}`;
    if (latest.has(key)) continue;
    latest.set(key, body);
    if (
      typeof body.generatedAt !== "number" &&
      ids !== "" &&
      !localCategory(body.source ?? null, null)
    ) {
      const join = `${row.character}\0${row.realm}\0${ids}`;
      if (!byIds.has(join)) byIds.set(join, { key, at: row.created_at });
    }
  }

  const used = new Set<string>();
  // Postgres has no rowid: the Request id breaks a tie within one second there.
  const requests = await db.all<{
    account: string | null;
    character_name: string;
    realm: string;
    topic: string | null;
    mode: string | null;
    suggestion_json: unknown;
    generated_at: number | null;
    plan_at: number | null;
    plan_json: unknown;
  }>(
    `SELECT r.account, r.character_name, r.realm, r.topic, r.mode, r.suggestion_json,
            p.generated_at, p.created_at AS plan_at, p.${db.body} AS plan_json
     FROM requests r LEFT JOIN plans p ON p.id = r.plan_id
     WHERE r.type = 'plan' AND r.created_at >= ?
     ORDER BY r.created_at DESC, ${db.pg ? "r.id" : "r.rowid"} DESC`,
    since,
  );
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
    const who = `${request.character_name}\0${request.realm}`;
    let key: string | undefined;
    if (request.generated_at !== null && latest.has(`${who}\0at:${request.generated_at}`)) {
      key = `${who}\0at:${request.generated_at}`;
    } else if (request.plan_json) {
      // Progress from before 0.10 (or a session applied under 0.9) has no generatedAt:
      // it is this plan's when it carries exactly the plan's step ids and came after it.
      // Newest Request first, so a repeated plan joins its latest delivery only.
      const ids = planStepIds(request.plan_json);
      const hit = ids ? byIds.get(`${who}\0${ids}`) : undefined;
      if (hit && !used.has(hit.key) && hit.at >= (request.plan_at ?? 0)) key = hit.key;
    }
    const body = key ? latest.get(key) : undefined;
    if (!key || !body) continue;
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

  const wins = await db.all<{
    account: string;
    character_name: string;
    realm: string;
    body_json: unknown;
  }>(
    `SELECT account, character_name, realm, ${db.body} AS body_json FROM history WHERE kind = 'win' AND at >= ?`,
    since,
  );
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

/** A stored plan's step ids, sorted and joined like `stepIds`; empty when unreadable. */
function planStepIds(planJson: unknown): string {
  const plan = parse<{ tasks?: { id?: unknown }[] }>(planJson);
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  return tasks
    .map((task) => (typeof task?.id === "string" ? task.id : ""))
    .filter((id) => id !== "")
    .sort()
    .join(",");
}

function count(row: Counts, body: ProgressBody): void {
  row.tracked += 1;
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
