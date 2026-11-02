import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sha256Hex } from "./auth.ts";
import type { PlanRequest, Store } from "./store.ts";
import { webhookBody } from "./webhook.ts";

const text = readFileSync(
  new URL("../../../packages/contracts/planner/prompt.md", import.meta.url),
  "utf8",
);
const prompt = { text, version: sha256Hex(text).slice(0, 12) };

type Job = {
  request_id: string;
  state: string;
  attempts: number;
  queued_at: number;
  available_at: number;
  last_error: string | null;
  lease_id: string | null;
  lease_token_hash: string | null;
  leased_until: number | null;
  attempt_started_at: number | null;
};

export class LostLease extends Error {
  constructor() {
    super("The lease is no longer live.");
  }
}

export class PlanRunner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private readonly waiters = new Set<() => void>();
  private readonly store: Store;
  private readonly log: (line: string) => void;
  private readonly now: () => number;
  private readonly fallback: { enabled: boolean; seconds: number };
  constructor(
    store: Store,
    log: (line: string) => void,
    now: () => number = () => Math.floor(Date.now() / 1000),
    fallback: { enabled: boolean; seconds: number } = { enabled: false, seconds: 90 },
  ) {
    this.store = store;
    this.log = log;
    this.now = now;
    this.fallback = fallback;
    store.onRequestAdded = () => this.wake();
  }

  wake() {
    for (const wake of this.waiters) wake();
  }

  start() {
    if (this.timer) return;
    this.stopped = false;
    const tick = () => {
      void this.tick().catch(() => this.log("runner maintenance failed"));
    };
    tick();
    this.timer = setInterval(tick, 30_000);
    this.timer.unref();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.wake();
  }

  async poll(wait: number, signal?: AbortSignal) {
    const end = Date.now() + wait * 1000;
    while (!this.stopped && !signal?.aborted) {
      // Subscribe before checking, so an insertion cannot slip between check and wait.
      let release!: () => void;
      const changed = new Promise<void>((resolve) => {
        release = resolve;
      });
      this.waiters.add(release);
      signal?.addEventListener("abort", release, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const lease = await this.claim();
        if (lease || Date.now() >= end || signal?.aborted) return lease;
        timer = setTimeout(release, Math.min(1000, end - Date.now()));
        await changed;
      } finally {
        if (timer) clearTimeout(timer);
        this.waiters.delete(release);
        signal?.removeEventListener("abort", release);
      }
    }
    return undefined;
  }

  private live(job: Job, now = this.now()) {
    return (
      job.state === "leased" &&
      job.leased_until !== null &&
      job.leased_until >= now &&
      job.attempt_started_at !== null &&
      now < job.attempt_started_at + 900
    );
  }

  /** A retry that is due, or a dead lease, left unclaimed for the fallback interval. */
  private stalled(job: Job, now = this.now()) {
    const since =
      job.state === "queued" && job.attempts > 0
        ? job.available_at
        : job.state === "leased" && job.attempts < 3
          ? job.leased_until
          : null;
    return since !== null && since !== undefined && now >= since + this.fallback.seconds;
  }

  async scope(token: string): Promise<PlanRequest | undefined> {
    const job = await this.store.db.get<Job>(
      `SELECT * FROM runner_jobs WHERE lease_token_hash = ?`,
      sha256Hex(token),
    );
    if (!job || !this.live(job)) return undefined;
    const request = await this.store.requestById(job.request_id);
    return request?.status === "pending" ? request : undefined;
  }

  /** Request first, then job: the same order as Forget and Request expiry. */
  private async locked(leaseId: string) {
    const db = this.store.db;
    const found = await db.get<Job>(`SELECT * FROM runner_jobs WHERE lease_id = ?`, leaseId);
    if (!found) return undefined;
    await db.get(
      `SELECT id FROM requests WHERE id = ? ${db.pg ? "FOR UPDATE" : ""}`,
      found.request_id,
    );
    return db.get<Job>(
      `SELECT * FROM runner_jobs WHERE lease_id = ? ${db.pg ? "FOR UPDATE" : ""}`,
      leaseId,
    );
  }

  async withLease<T>(token: string, work: (request: PlanRequest) => Promise<T>): Promise<T> {
    return this.store.tx(async () => {
      const found = await this.store.db.get<Job>(
        `SELECT * FROM runner_jobs WHERE lease_token_hash = ?`,
        sha256Hex(token),
      );
      const job = found?.lease_id ? await this.locked(found.lease_id) : undefined;
      const request = job ? await this.store.requestById(job.request_id) : undefined;
      if (
        !job ||
        !this.live(job) ||
        job.lease_token_hash !== sha256Hex(token) ||
        request?.status !== "pending"
      )
        throw new LostLease();
      const result = await work(request);
      // Validation or reads may have taken time: never commit a stale answer.
      if (!this.live(job)) throw new LostLease();
      if ((await this.store.requestById(job.request_id))?.status !== "pending")
        await this.done(job);
      return result;
    });
  }

  private async done(job: Job) {
    const now = this.now();
    await this.store.db.run(
      `UPDATE runner_jobs SET state = 'done', finished_at = ?, lease_token_hash = NULL WHERE request_id = ?`,
      now,
      job.request_id,
    );
    this.log(
      `runner req=${job.request_id} attempt=${job.attempts} done ms=${(now - (job.attempt_started_at ?? now)) * 1000}`,
    );
  }

  async heartbeat(leaseId: string) {
    return this.store.tx(async () => {
      const job = await this.locked(leaseId);
      if (
        !job ||
        !this.live(job) ||
        (await this.store.requestById(job.request_id))?.status !== "pending"
      )
        return undefined;
      const expiresAt = Math.min(this.now() + 180, job.attempt_started_at! + 900);
      await this.store.db.run(
        `UPDATE runner_jobs SET leased_until = ? WHERE lease_id = ?`,
        expiresAt,
        leaseId,
      );
      return { expiresAt };
    });
  }

  async finish(leaseId: string, outcome: { ok: boolean; error?: string }) {
    return this.store.tx(async () => {
      const job = await this.locked(leaseId);
      if (!job) return false;
      if (job.state === "done") return true;
      if (!this.live(job)) return false;
      if ((await this.store.requestById(job.request_id))?.status !== "pending") {
        await this.done(job);
        return true;
      }
      const error = outcome.ok ? "no answer" : outcome.error?.slice(0, 200) || "no answer";
      if (job.attempts >= 3) await this.exhaust(job, error);
      else {
        const delay = job.attempts === 1 ? 15 : 60;
        await this.store.db.run(
          `UPDATE runner_jobs SET state = 'queued', available_at = ?, lease_token_hash = NULL,
          last_error = ? WHERE request_id = ?`,
          this.now() + delay,
          error,
          job.request_id,
        );
        // Arbitrary runner error text stays in storage, never in logs.
        this.log(
          `runner req=${job.request_id} attempt=${job.attempts} failed no answer, retry in ${delay}s`,
        );
      }
      return true;
    });
  }

  private async handoff(job: Job, why: string) {
    await this.store.db.run(
      `UPDATE runner_jobs SET state = 'handed_off', finished_at = ?, lease_token_hash = NULL WHERE request_id = ?`,
      this.now(),
      job.request_id,
    );
    this.log(`runner req=${job.request_id} handed to webhook (${why})`);
  }

  private async exhaust(job: Job, error: string) {
    await this.store.db.run(
      `UPDATE runner_jobs SET last_error = ? WHERE request_id = ?`,
      error,
      job.request_id,
    );
    if (this.fallback.enabled) await this.handoff(job, "attempts exhausted");
    else {
      const request = await this.store.requestById(job.request_id);
      const reason =
        request?.lang === "ru"
          ? "Не удалось собрать план. Давай попробуем ещё раз."
          : "I couldn't put a plan together. Let's try again.";
      await this.store.failRequest(job.request_id, reason, this.now(), "planner_failed");
      await this.store.db.run(
        `UPDATE runner_jobs SET state = 'failed', finished_at = ?, lease_token_hash = NULL WHERE request_id = ?`,
        this.now(),
        job.request_id,
      );
      this.log(
        `runner req=${job.request_id} attempt=${job.attempts} failed attempts exhausted, request failed`,
      );
    }
  }

  async tick() {
    await this.store.expireRequests(this.now());
    const rows = await this.store.db.all<Job>(
      `SELECT j.* FROM runner_jobs j JOIN requests r ON r.id = j.request_id
      WHERE j.state IN ('queued', 'leased') AND (r.status <> 'pending'
        OR (j.attempts >= 3 AND (j.state = 'queued' OR j.leased_until < ? OR j.attempt_started_at + 900 <= ?))
        OR (j.attempts = 0 AND j.queued_at <= ?)
        OR (j.state = 'queued' AND j.attempts > 0 AND j.available_at <= ?)
        OR (j.state = 'leased' AND j.attempts < 3 AND j.leased_until <= ?))`,
      this.now(),
      this.now(),
      this.fallback.enabled ? this.now() - this.fallback.seconds : -1,
      this.fallback.enabled ? this.now() - this.fallback.seconds : -1,
      this.fallback.enabled ? this.now() - this.fallback.seconds : -1,
    );
    for (const row of rows) {
      await this.store.tx(async () => {
        const db = this.store.db;
        await db.get(
          `SELECT id FROM requests WHERE id = ? ${db.pg ? "FOR UPDATE" : ""}`,
          row.request_id,
        );
        const job = await db.get<Job>(
          `SELECT * FROM runner_jobs WHERE request_id = ? ${db.pg ? "FOR UPDATE SKIP LOCKED" : ""}`,
          row.request_id,
        );
        if (!job || !["queued", "leased"].includes(job.state)) return;
        if ((await this.store.requestById(job.request_id))?.status !== "pending") {
          await this.done(job);
          return;
        }
        if (job.attempts >= 3 && !this.live(job)) await this.exhaust(job, "lease expired");
        else if (
          job.attempts === 0 &&
          this.fallback.enabled &&
          this.now() >= job.queued_at + this.fallback.seconds
        )
          await this.handoff(job, "unclaimed");
        else if (this.fallback.enabled && this.stalled(job))
          // A retry or a dead lease nobody picked up again: the runner is gone.
          await this.handoff(job, "runner idle");
      });
    }
  }

  async claim() {
    await this.tick();
    const db = this.store.db;
    return db.tx(async () => {
      const now = this.now();
      const job = await db.get<Job>(
        `SELECT j.* FROM runner_jobs j JOIN requests r ON r.id = j.request_id
         WHERE r.status = 'pending' AND j.attempts < 3 AND
           ((j.state = 'queued' AND j.available_at <= ?) OR (j.state = 'leased' AND j.leased_until < ?))
         ORDER BY r.created_at, r.id ${db.pg ? "FOR UPDATE OF j SKIP LOCKED" : ""} LIMIT 1`,
        now,
        now,
      );
      if (!job) return undefined;
      const leaseId = randomUUID();
      const leaseToken = randomBytes(32).toString("base64url");
      const attempt = job.attempts + 1;
      const expiresAt = now + 180;
      await db.run(
        `UPDATE runner_jobs SET state = 'leased', attempts = ?, lease_id = ?, lease_token_hash = ?,
        leased_until = ?, attempt_started_at = ?, claimed_at = ?, prompt_version = ?, last_error = ? WHERE request_id = ?`,
        attempt,
        leaseId,
        sha256Hex(leaseToken),
        expiresAt,
        now,
        now,
        prompt.version,
        job.state === "leased" ? "lease expired" : job.last_error,
        job.request_id,
      );
      const request = (await this.store.requestById(job.request_id))!;
      if (job.state === "leased")
        this.log(
          `runner req=${request.id} attempt=${job.attempts} failed lease expired, retry in 0s`,
        );
      this.log(
        `runner req=${request.id} type=${request.type} attempt=${attempt} claimed wait=${now - job.queued_at}s`,
      );
      return {
        leaseId,
        leaseToken,
        expiresAt,
        attempt,
        request: webhookBody(request),
        prompt,
        mcpPath: "/mcp",
      };
    });
  }
}
