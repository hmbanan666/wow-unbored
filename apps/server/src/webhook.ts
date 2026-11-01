import type { PlayerContext, RequestItem, RequestType } from "./plan.ts";
import type { PlanRequest, Store } from "./store.ts";

export type WebhookConfig = {
  url: string;
  key: string;
  headerName: string;
};

export function webhookFromEnv(env: NodeJS.ProcessEnv = process.env): WebhookConfig {
  return {
    url: env.UNBORED_PLANNER_WEBHOOK_URL?.trim() ?? "",
    key: env.UNBORED_PLANNER_WEBHOOK_KEY?.trim() ?? "",
    headerName: env.UNBORED_PLANNER_WEBHOOK_KEY_HEADER?.trim() ?? "",
  };
}

export type WebhookBody = {
  requestId: string;
  type: RequestType;
  question: string | null;
  topic: string | null;
  item: RequestItem | null;
  character: string;
  realm: string;
  mode: string;
  budget: number | null;
  wish: string | null;
  context: PlayerContext | null;
  /** Answer in this language ("en" or "ru"). */
  lang: string | null;
  account: string | null;
};

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

/** Seconds to wait after the 1st, 2nd, ... failed attempt. The last one ends the retries. */
export const RETRY_DELAYS = [30, 60, 120, 300, 600, 900, 1800, 3600];
export const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;
/** Pending requests older than this are not sent again (a player gave up long ago). */
export const RETRY_WINDOW_SECONDS = 24 * 3600;
const TIMEOUT_MS = 10_000;

export function webhookBody(request: PlanRequest): WebhookBody {
  return {
    requestId: request.id,
    type: request.type,
    question: request.question,
    topic: request.topic,
    item: request.item,
    character: request.character,
    realm: request.realm,
    mode: request.mode,
    budget: request.budget,
    wish: request.wish,
    context: request.context,
    lang: request.lang,
    account: request.account || null,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "an invalid URL";
  }
}

// Only a short reason: an error message can carry the URL, and the URL can carry a secret.
function errorCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    const cause = (error as { cause?: { code?: unknown } }).cause;
    if (cause && typeof cause.code === "string") return cause.code;
    return error.name;
  }
  return "error";
}

/**
 * Tells the planner about every new pending request (plan, question, item).
 * Each attempt is stored and logged; failures are retried with backoff by tick().
 */
export class PlannerWebhook {
  private readonly inFlight = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly config: WebhookConfig;
  private readonly store: Store;
  private readonly log: (line: string) => void;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;

  constructor(
    config: WebhookConfig,
    store: Store,
    log: (line: string) => void,
    fetchImpl: FetchLike = fetch,
    now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.config = config;
    this.store = store;
    this.log = log;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  get enabled(): boolean {
    return this.config.url !== "";
  }

  describe(): string {
    if (!this.enabled)
      return "webhook off: UNBORED_PLANNER_WEBHOOK_URL is not set, new requests wait for the planner to poll";
    const key = this.config.key ? "with key" : "without UNBORED_PLANNER_WEBHOOK_KEY";
    return `webhook on: ${hostOf(this.config.url)} ${key}`;
  }

  /** One attempt for one request. Returns true when the planner took it. */
  async notify(request: PlanRequest): Promise<boolean> {
    if (!this.enabled) {
      this.log(
        `webhook req=${request.id} type=${request.type} skipped: UNBORED_PLANNER_WEBHOOK_URL is not set`,
      );
      return false;
    }
    if (this.inFlight.has(request.id)) return false;
    this.inFlight.add(request.id);
    try {
      return await this.attempt(request);
    } finally {
      this.inFlight.delete(request.id);
    }
  }

  /** Retries every pending request whose next attempt is due. */
  async tick(): Promise<void> {
    if (!this.enabled) return;
    const now = this.now();
    const due = await this.store.webhookDue({
      nowSeconds: now,
      sinceSeconds: now - RETRY_WINDOW_SECONDS,
      maxAttempts: MAX_ATTEMPTS,
    });
    for (const request of due) {
      await this.notify(request);
    }
  }

  start(intervalMs = 30_000): void {
    if (this.timer || !this.enabled) return;
    const run = () => {
      this.tick().catch((error: unknown) =>
        this.log(`webhook retry loop failed: ${errorCode(error)}`),
      );
    };
    this.timer = setInterval(run, intervalMs);
    this.timer.unref?.();
    run();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.key) {
      headers.authorization = `Bearer ${this.config.key}`;
      const name = this.config.headerName;
      if (name && name.toLowerCase() !== "authorization") headers[name] = this.config.key;
    }
    return headers;
  }

  private async attempt(request: PlanRequest): Promise<boolean> {
    const started = Date.now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      const response = await this.fetchImpl(this.config.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(webhookBody(request)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      if (!response.ok) error = `status ${response.status}`;
    } catch (caught) {
      error = errorCode(caught);
    }
    const ok = error === null;
    const attempts = ((await this.store.webhookDelivery(request.id))?.attempts ?? 0) + 1;
    const delay = ok ? null : (RETRY_DELAYS[attempts - 1] ?? null);
    const now = this.now();
    await this.store.recordWebhookAttempt(
      request.id,
      { ok, status, error, nextAt: delay === null ? null : now + delay },
      now,
    );
    const head = `webhook req=${request.id} type=${request.type} attempt=${attempts}`;
    const ms = Date.now() - started;
    if (ok) {
      this.log(`${head} ok status=${status} ms=${ms}`);
    } else if (delay !== null) {
      this.log(`${head} failed ${error} ms=${ms}, retry in ${delay}s`);
    } else {
      this.log(
        `${head} failed ${error} ms=${ms}, giving up; the request stays pending for list_requests`,
      );
    }
    return ok;
  }
}
