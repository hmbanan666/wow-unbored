import { GameImportError, validGameBuild } from "./game-db.ts";
import { ContentError, ContentStore } from "./content.ts";
import { GameWatch } from "./game-watch.ts";
import { gunzipSync } from "node:zlib";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { presentedBearer, requireRole, sha256Hex, tokenMatches } from "./auth.ts";
import type { Config } from "./config.ts";
import type { Sql } from "./postgres.ts";
import { clientIp, cleanRegistration, PENDING_CAP, RegisterLimiter } from "./devices.ts";
import { cleanSnapshot, SNAPSHOT_MAX_COMPRESSED, SNAPSHOT_MAX_INFLATED } from "./data.ts";
import {
  blizzardFromEnv,
  BlizzardIds,
  type BlizzardConfig,
  type GameDataFetch,
} from "./blizzard.ts";
import { PlanRunner } from "./runner.ts";
import { handleMcp } from "./mcp.ts";
import { cleanPlanRequest, PlanError, planMarkupIds } from "./plan.ts";
import { checkOutcome, OutcomeError } from "./outcome.ts";
import { planForAddon } from "./plan-delivery.ts";
import { cleanProfile } from "./profile.ts";
import {
  accountKey,
  legacyOf,
  publicDevice,
  publicRequest,
  sessionSummary,
  Store,
  type PlanRequest,
} from "./store.ts";
import { accountForDevice, issuePageLink, redeemPageLink } from "./page-link.ts";
import { PlannerWebhook, webhookFromEnv, type FetchLike, type WebhookConfig } from "./webhook.ts";

function limitOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

/** Stop at the compressed cap even when Content-Length is absent or incorrect. */
async function snapshotBytes(body: Request["body"]): Promise<Buffer | null> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  let bytes = Buffer.alloc(0);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return bytes.subarray(0, size);
      const nextSize = size + value.byteLength;
      if (nextSize > SNAPSHOT_MAX_COMPRESSED) {
        // A producer's slow or failed cleanup must not delay the 413 response.
        void reader.cancel().catch(() => {});
        return null;
      }
      if (nextSize > bytes.length) {
        // Bound storage as well as bytes: millions of tiny chunks must not build
        // an unbounded list of Buffer objects. Grow only as data arrives.
        const capacity = Math.min(
          SNAPSHOT_MAX_COMPRESSED,
          Math.max(nextSize, bytes.length * 2, 64 * 1024),
        );
        const grown = Buffer.allocUnsafe(capacity);
        bytes.copy(grown, 0, 0, size);
        bytes = grown;
      }
      bytes.set(value, size);
      size = nextSize;
    }
  } finally {
    reader.releaseLock();
  }
}

export function createApp(
  config: Pick<Config, "companionToken" | "plannerToken" | "dataDir"> & {
    plannerRoute?: Config["plannerRoute"];
    runnerToken?: string;
    runnerFallbackSeconds?: number;
    runnerNow?: () => number;
    webhook?: WebhookConfig;
    webhookFetch?: FetchLike;
    webhookNow?: () => number;
    blizzard?: BlizzardConfig | null;
    blizzardFetch?: GameDataFetch;
    gameDbFetch?: typeof fetch;
    /** One line per request (docs/adr/0013). Defaults to stdout. */
    log?: (line: string) => void;
    /** Postgres from DATABASE_URL, migrated (ADR 0057); the caller closes it. */
    database?: Sql;
    /** Public site origin for sign-in links. Falls back to the request host. */
    webOrigin?: string;
    /**
     * How `POST /v1/snapshot` stores an upload on Postgres: "inbox" (the
     * default) queues it and answers 202; "inline" ingests on the request
     * path and answers 200 as on SQLite. SQLite is always inline.
     */
    ingest?: "inbox" | "inline";
  },
) {
  const log = config.log ?? ((line: string) => console.log(line));
  const store = new Store(config.dataDir, {
    postgres: config.database,
    log,
    plannerRoute: config.plannerRoute,
    runnerNow: config.runnerNow,
  });
  const inbox = config.ingest === "inline" ? undefined : store.inbox;
  const gameWatch = new GameWatch(store.game, config.gameDbFetch, log);
  const tokens = { companion: config.companionToken, planner: config.plannerToken };
  const registerLimiter = new RegisterLimiter();
  const app = new Hono();
  const webhook = new PlannerWebhook(
    config.webhook ?? webhookFromEnv(),
    store,
    log,
    config.webhookFetch,
    config.webhookNow,
  );
  const runner =
    store.plannerRoute === "runner"
      ? new PlanRunner(store, log, config.runnerNow, {
          enabled: webhook.enabled,
          seconds: config.runnerFallbackSeconds ?? 90,
        })
      : undefined;
  log(webhook.describe());
  const gameIds = new BlizzardIds(
    config.blizzard === undefined ? blizzardFromEnv() : config.blizzard,
    store.gameIds,
    config.blizzardFetch,
  );
  log(gameIds.describe());
  // Russian rare names for ideas come from the same Blizzard credentials (D154).
  store.suggestions.names = {
    many: (npcIDs, locale) => store.creatureNames.many(npcIDs, locale),
    warm: (npcIDs, locales) => gameIds.warmCreatureNames(store.creatureNames, npcIDs, locales),
  };

  // Method, path, status, and why a request was refused. Never headers or bodies.
  app.use("*", async (c, next) => {
    await next();
    if (c.req.path === "/health") return;
    if (c.req.method === "POST" && c.req.path === "/v1/runner/claim" && c.res.status === 204)
      return;
    let reason = "";
    if (c.res.status >= 400) {
      try {
        const body = (await c.res.clone().json()) as { error?: unknown };
        if (typeof body.error === "string")
          reason = ` reason=${JSON.stringify(body.error.slice(0, 200))}`;
      } catch {
        // Not JSON; the status says enough.
      }
    }
    log(`${c.req.method} ${c.req.path} ${c.res.status}${reason}`);
  });

  const allowCompanion = async (c: Parameters<typeof requireRole>[0]) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    if (tokenMatches(presented, tokens.companion)) return { deviceId: "legacy" };
    const device = await store.authenticateDevice(sha256Hex(presented));
    if (!device || device.status !== "approved") return c.json({ error: "Unauthorized" }, 401);
    await store.touchDevice(device.id);
    return { deviceId: device.id };
  };
  const unauthorized = (c: Parameters<typeof requireRole>[0]) =>
    c.json({ error: "Unauthorized" }, 401);

  const requestWithPlan = async (request: PlanRequest, addonVersion: string | undefined) => {
    const plan = request.planId ? await store.planById(request.planId) : undefined;
    return {
      ...publicRequest(request),
      plan: plan
        ? await planForAddon(plan, addonVersion, () =>
            store.data.latestCurrenciesForDevice(request.deviceId),
          )
        : null,
      eta: await store.planEta(),
    };
  };

  app.use(
    "/mcp",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "mcp-session-id",
        "mcp-protocol-version",
        "Last-Event-ID",
      ],
      exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
    }),
  );

  app.get("/health", async (c) =>
    c.json({
      ok: true,
      planner: store.plannerRoute,
      webhook: webhook.enabled ? "on" : "off",
      gameDb: await store.game.status(),
    }),
  );

  app.use("/v1/runner/*", async (c, next) => {
    if (!runner || !config.runnerToken) return c.notFound();
    const token = presentedBearer(c.req.header("authorization"));
    if (!token || !tokenMatches(token, config.runnerToken)) return unauthorized(c);
    await next();
  });
  app.post("/v1/runner/claim", async (c) => {
    const wait = Number(c.req.query("wait") ?? 0);
    if (!Number.isFinite(wait) || wait < 0 || wait > 25)
      return c.json({ error: "wait must be from 0 to 25 seconds." }, 400);
    const lease = await runner!.poll(wait, c.req.raw.signal);
    return lease ? c.json(lease) : c.body(null, 204);
  });

  app.post("/v1/runner/leases/:leaseId/heartbeat", async (c) => {
    const result = await runner!.heartbeat(c.req.param("leaseId"));
    return result ? c.json(result) : c.json({ error: "Lost lease." }, 409);
  });
  app.post("/v1/runner/leases/:leaseId/finish", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Finish must be JSON." }, 400);
    }
    if (
      !body ||
      typeof body.ok !== "boolean" ||
      (body.error !== undefined && typeof body.error !== "string")
    )
      return c.json({ error: "Finish needs ok and an optional error string." }, 400);
    const finished = await runner!.finish(c.req.param("leaseId"), body);
    return finished ? c.json({ ok: true }) : c.json({ error: "Lost lease." }, 409);
  });

  app.post("/v1/devices/register", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
    if (!registerLimiter.allow(ip)) {
      return c.json({ error: "Too many registration attempts." }, 429);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Registration must be JSON." }, 400);
    }
    const cleaned = cleanRegistration(body);
    if ("error" in cleaned) return c.json({ error: cleaned.error }, 400);
    const result = await store.registerDevice({
      id: cleaned.id,
      name: cleaned.name,
      secretHash: cleaned.secretHash,
      nowSeconds: Math.floor(Date.now() / 1000),
      pendingCap: PENDING_CAP,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(publicDevice(result.device), result.created ? 201 : 200);
  });

  // After Forget my data the player connects again from this PC (docs/adr/0045).
  // Same registration checks as a first install; the old secret is the proof.
  app.post("/v1/devices/me/reconnect", async (c) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    if (tokenMatches(presented, tokens.companion)) {
      return c.json(
        { error: "Connect again needs the Companion on this PC, not the shared token." },
        403,
      );
    }
    const ip = clientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
    if (!registerLimiter.allow(ip)) {
      return c.json({ error: "Too many registration attempts." }, 429);
    }
    const device = await store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device) return c.json({ error: "Unauthorized" }, 401);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Registration must be JSON." }, 400);
    }
    const cleaned = cleanRegistration(body);
    if ("error" in cleaned) return c.json({ error: cleaned.error }, 400);
    const result = await store.reconnectForgotten({
      oldId: device.id,
      id: cleaned.id,
      name: cleaned.name,
      secretHash: cleaned.secretHash,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(publicDevice(result.device), 201);
  });

  app.get("/v1/devices/me", async (c) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    const device = await store.authenticateDevice(sha256Hex(presented));
    if (!device) return c.json({ error: "Unauthorized" }, 401);
    await store.touchDevice(device.id);
    const fresh = (await store.authenticateDevice(sha256Hex(presented))) ?? device;
    return c.json(publicDevice(fresh));
  });

  // Forget my data (PRIVACY.md): the device secret alone is enough, whatever
  // the pairing status, so a revoked or never approved PC can still erase.
  app.post("/v1/devices/me/forget", async (c) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    if (tokenMatches(presented, tokens.companion)) {
      return c.json(
        { error: "Forget my data needs a paired Companion, not the shared token." },
        403,
      );
    }
    const device = await store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device) return c.json({ error: "Unauthorized" }, 401);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Send {"confirm": true} as JSON.' }, 400);
    }
    if ((body as { confirm?: unknown } | null)?.confirm !== true) {
      return c.json({ error: 'Send {"confirm": true} as JSON.' }, 400);
    }
    return c.json({ ok: true, ...(await store.forgetDevice(device.id)) });
  });

  const redeemLimiter = new RegisterLimiter();
  app.post("/v1/devices/me/page-link", async (c) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    if (tokenMatches(presented, tokens.companion)) {
      return c.json({ error: "My page needs a paired Companion, not the shared token." }, 403);
    }
    const device = await store.authenticateDevice(sha256Hex(presented));
    if (!device) return c.json({ error: "Unauthorized" }, 401);
    if (device.status !== "approved") {
      return c.json({ error: "This PC is not connected yet." }, 403);
    }
    const accountId = await accountForDevice(store.db, device.id);
    if (!accountId) return c.json({ error: "no_characters" }, 409);
    const link = await issuePageLink(store.db, {
      deviceId: device.id,
      accountId,
      now: Math.floor(Date.now() / 1000),
      origin: config.webOrigin || DEFAULT_WEB_ORIGIN,
    });
    return c.json(link);
  });

  app.post("/v1/page-links/redeem", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
    if (!redeemLimiter.allow(ip)) return c.json({ error: "Too many attempts." }, 429);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "unknown" }, 404);
    }
    const token = (body as { token?: unknown } | null)?.token;
    if (typeof token !== "string") return c.json({ error: "unknown" }, 404);
    const result = await redeemPageLink(store.db, token, Math.floor(Date.now() / 1000));
    if (!result.ok) {
      const status = result.error === "unknown" ? 404 : 410;
      return c.json({ error: result.error }, status);
    }
    return c.json({ sessionId: result.sessionId, accountId: result.accountId });
  });

  app.post("/v1/requests", async (c) => {
    const admitted = await allowCompanion(c);
    if (admitted instanceof Response) return admitted;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "The request must be JSON." }, 400);
    }
    // Reading the body yielded: Forget or owner revoke may have completed.
    // Checked again inside the write transaction (asDevice), Account migration included.
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    try {
      const cleaned = cleanPlanRequest(body);
      // Postgres inbox: the save just before this Request is ingested first (up to 10 s).
      if (inbox) await store.settle(cleaned.account ? accountKey(cleaned.account) : undefined);
      const saved = await store.asDevice(access.deviceId, () =>
        store.addRequest({
          id: cleaned.id,
          deviceId: access.deviceId,
          character: cleaned.character,
          realm: cleaned.realm,
          mode: cleaned.mode,
          budget: cleaned.budget,
          wish: cleaned.wish,
          type: cleaned.type,
          question: cleaned.question,
          topic: cleaned.topic,
          item: cleaned.item,
          context: cleaned.context,
          lang: cleaned.lang,
          account: cleaned.account,
          accountLegacy: legacyOf(body),
          suggestionId: cleaned.suggestionId,
          suggestion: cleaned.suggestion,
          nowSeconds: cleaned.createdAt ?? Math.floor(Date.now() / 1000),
        }),
      );
      if (!saved) return unauthorized(c);
      if (saved.created) runner?.wake();
      if (saved.created && !runner) {
        await webhook.notify(saved.request);
      }
      return c.json(publicRequest(saved.request), saved.created ? 201 : 200);
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/v1/requests/latest", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    await store.expireRequests();
    const request = await store.latestRequestForDevice(access.deviceId);
    if (!request) return c.json({ error: "No request yet." }, 404);
    return c.json(await requestWithPlan(request, c.req.header("X-Unbored-Addon-Version")));
  });

  // The exact Request the game waits for (D82); another device's id is 404.
  app.get("/v1/requests/:id", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    await store.expireRequests();
    const request = await store.requestById(c.req.param("id"));
    if (!request || request.deviceId !== access.deviceId)
      return c.json({ error: "No such request." }, 404);
    return c.json(await requestWithPlan(request, c.req.header("X-Unbored-Addon-Version")));
  });

  // Personal advice for this device's characters (docs/adr/0019) and the
  // Account holdings index (docs/adr/0048).
  app.get("/v1/advice", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    const holdings = await store.holdingsForDevice(access.deviceId);
    return c.json({
      characters: await store.adviceForDevice(access.deviceId),
      ...(holdings ? { holdings } : {}),
    });
  });

  // Ideas from the player's data for the choice Bubble (docs/adr/0040).
  app.get("/v1/suggestions", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    return c.json(await store.suggestionsForDevice(access.deviceId));
  });

  app.get("/v1/plan", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    const stored = await store.latestPlanForDevice(access.deviceId);
    if (!stored) return c.json({ error: "No plan yet." }, 404);
    return c.json({
      id: stored.id,
      createdAt: stored.createdAt,
      plan: await planForAddon(stored, c.req.header("X-Unbored-Addon-Version"), () =>
        store.data.latestCurrenciesForDevice(access.deviceId),
      ),
    });
  });

  app.post("/v1/progress", async (c) => {
    const admitted = await allowCompanion(c);
    if (admitted instanceof Response) return admitted;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Progress must be JSON." }, 400);
    }
    // Reading the body yielded: Forget or owner revoke may have completed.
    // Checked again inside the write transaction (asDevice), Account migration included.
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    try {
      const stored = await store.asDevice(access.deviceId, () => store.addProgress(body));
      if (!stored) return unauthorized(c);
      return c.json({ ok: true, id: stored.id });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.post("/v1/profile", async (c) => {
    const admitted = await allowCompanion(c);
    if (admitted instanceof Response) return admitted;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "The profile must be JSON." }, 400);
    }
    // Reading the body yielded: Forget or owner revoke may have completed.
    // Checked again inside the write transaction (asDevice), Account migration included.
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    try {
      const cleaned = cleanProfile(body);
      const saved = await store.asDevice(access.deviceId, async () => {
        cleaned.account = await store.bindAccount(cleaned.account, legacyOf(body));
        return store.putProfile({ ...cleaned, deviceId: access.deviceId });
      });
      if (!saved) return unauthorized(c);
      return c.json({ ok: true, updated: saved.updated, updatedAt: saved.profile.updatedAt });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  // Game data Sections that changed, gzip JSON (docs/adr/0029).
  app.post("/v1/snapshot", async (c) => {
    const admitted = await allowCompanion(c);
    if (admitted instanceof Response) return admitted;
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > SNAPSHOT_MAX_COMPRESSED) {
      return c.json({ error: "The game data is too large." }, 413);
    }
    let body: unknown;
    let inflated: Buffer;
    let gzipped: Buffer | null;
    try {
      const raw = await snapshotBytes(c.req.raw.body);
      if (raw === null) return c.json({ error: "The game data is too large." }, 413);
      const gzip = (c.req.header("content-encoding") ?? "").toLowerCase().includes("gzip");
      inflated = gzip ? gunzipSync(raw, { maxOutputLength: SNAPSHOT_MAX_INFLATED }) : raw;
      gzipped = gzip ? raw : null;
      body = JSON.parse(inflated.toString("utf8"));
    } catch {
      return c.json({ error: "The game data must be JSON, optionally gzip." }, 400);
    }
    // Reading the body yielded: Forget or owner revoke may have completed.
    // Checked again inside the write transaction (asDevice), Account migration included.
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    try {
      const cleaned = cleanSnapshot(body);
      if (inbox) {
        // ADR 0057: checked here, ingested by the worker. 202 is a 2xx, so the
        // Companion marks the Sections sent; everything it could reject is rejected above.
        const queued = await store.asDevice(access.deviceId, async () => {
          cleaned.account = await store.bindAccount(cleaned.account, legacyOf(body));
          return inbox.enqueue({ deviceId: access.deviceId, snapshot: cleaned, inflated, gzipped });
        });
        if (!queued) return unauthorized(c);
        return c.json({ ok: true, upload: queued.id, state: queued.state }, 202);
      }
      const result = await store.asDevice(access.deviceId, async () => {
        cleaned.account = await store.bindAccount(cleaned.account, legacyOf(body));
        return store.putSnapshot(cleaned, access.deviceId);
      });
      if (!result) return unauthorized(c);
      return c.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  // Where a queued upload is (ADR 0057): queued, done with what was stored, or failed.
  app.get("/v1/uploads/:id", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    const status = await store.inbox?.status(c.req.param("id"), access.deviceId);
    if (!status) return c.json({ error: "No such upload." }, 404);
    return c.json(status);
  });

  // The Data explorer as JSON, for quick checks with the owner bearer (docs/adr/0030).
  app.get("/owner/data", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      ...(await store.data.catalog({ account: c.req.query("account") || undefined })),
      gameDb: await store.game.status(),
    });
  });

  app.post("/owner/game/import", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    const body = await c.req.json().catch(() => null);
    if (!validGameBuild(body?.build))
      return c.json({ error: "Supply a build such as 12.0.1.66337." }, 400);
    try {
      return c.json(await store.game.importBuild(body.build, config.gameDbFetch));
    } catch (error) {
      if (error instanceof GameImportError) return c.json({ error: error.message }, 502);
      throw error;
    }
  });

  // Authored site content (ADR 0072, 0074): save a checked draft, then publish it.
  const content = new ContentStore(store.db, store.game);
  const contentFailed = (c: Parameters<typeof requireRole>[0], error: unknown) => {
    if (error instanceof ContentError)
      return c.json({ error: error.message, problems: error.problems }, 400);
    throw error;
  };
  app.put("/owner/content", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    if (!content.available) return c.json({ error: "Site content needs Postgres." }, 503);
    const body = await c.req.json().catch(() => null);
    try {
      return c.json(await content.saveDraft(body));
    } catch (error) {
      return contentFailed(c, error);
    }
  });
  app.post("/owner/content/:kind/:slug/publish", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    if (!content.available) return c.json({ error: "Site content needs Postgres." }, 503);
    const kind = c.req.param("kind");
    const locale = c.req.query("locale") === "ru" ? "ru" : "en";
    if (kind !== "path" && kind !== "collection") return c.json({ error: "No such kind." }, 404);
    try {
      return c.json(await content.publish(kind, c.req.param("slug"), locale));
    } catch (error) {
      return contentFailed(c, error);
    }
  });

  app.put("/v1/plan", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "The plan must be JSON." }, 400);
    }
    try {
      const requestId = requestIdOf(body);
      const asked = requestId ? await store.requestById(requestId) : undefined;
      if (requestId && !asked) {
        return c.json({ error: "No request with that id." }, 404);
      }
      const plan = stripRequestId(body);
      if (typeof plan !== "object" || plan === null || Array.isArray(plan))
        throw new PlanError("The plan must be a JSON object.");
      if (inbox) await store.settle(asked?.account);
      const notes = await checkOutcome(
        (plan as Record<string, unknown>).outcome,
        store.data,
        asked,
      );
      const warnings: string[] = [];
      const build = await store.game.currentBuild();
      if (!build)
        notes.push("Game DB is not imported; ids and outcome existence remain unverified.");
      const missing = build ? undefined : await gameIds.missing(planMarkupIds(plan));
      // One transaction: Forget my data cannot erase the Request between the two.
      const { stored, request } = await store.tx(async () => {
        const stored = await store.putPlan(
          plan,
          undefined,
          { gameBuild: build, missing, warnings, context: asked?.context, wish: asked?.wish },
          requestId,
        );
        const request = requestId ? await store.fulfillRequest(requestId, stored.id) : undefined;
        return { stored, request };
      });
      return c.json({
        id: stored.id,
        createdAt: stored.createdAt,
        plan: stored.unb1,
        stored: stored.plan,
        request: request ? publicRequest(request) : null,
        notes,
        warnings,
      });
    } catch (error) {
      if (error instanceof PlanError || error instanceof OutcomeError)
        return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/v1/progress", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      latest: (await store.latestProgress()) ?? null,
      characters: await store.latestPerCharacter(),
    });
  });

  app.get("/v1/progress/history", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      progress: await store.progressHistory(limitOf(c.req.query("limit"), 50)),
    });
  });

  app.get("/v1/sessions", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      sessions: (await store.listPlans(limitOf(c.req.query("limit"), 20))).map(sessionSummary),
    });
  });

  app.all("/mcp", async (c) => {
    const token = presentedBearer(c.req.header("authorization"));
    if (!token) return unauthorized(c);
    if (tokenMatches(token, tokens.planner))
      return handleMcp(c, store, config.dataDir, gameIds, { settle: inbox !== undefined });
    if (!runner || !(await runner.scope(token))) return unauthorized(c);
    return handleMcp(c, store, config.dataDir, gameIds, {
      settle: inbox !== undefined,
      lease: { runner, token },
    });
  });

  let reconnectTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectCleanup: Promise<void> | undefined;
  const startReconnectCleanup = () => {
    if (reconnectTimer) return;
    const tick = () => {
      if (reconnectCleanup) return;
      reconnectCleanup = store
        .expireReconnects()
        .catch(() => log("device reconnect cleanup failed"))
        .finally(() => {
          reconnectCleanup = undefined;
        });
    };
    reconnectTimer = setInterval(tick, 10 * 60_000);
    reconnectTimer.unref();
    tick();
  };

  return {
    app,
    store,
    webhook,
    runner,
    gameWatch,
    startReconnectCleanup,
    /** The upload worker; index.ts starts it. Undefined on SQLite or inline ingest. */
    inbox,
    close: async () => {
      clearInterval(reconnectTimer);
      reconnectTimer = undefined;
      runner?.stop();
      webhook.stop();
      await gameWatch.stop();
      await reconnectCleanup;
      store.close();
    },
  };
}

/** Sign-in links never take their origin from request headers. */
const DEFAULT_WEB_ORIGIN = "https://unbored.kosarev.space";

function requestIdOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>).requestId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripRequestId(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const copy = { ...(body as Record<string, unknown>) };
  delete copy.requestId;
  return copy;
}
