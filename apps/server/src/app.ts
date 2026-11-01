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
import { handleMcp } from "./mcp.ts";
import { cleanPlanRequest, PlanError, planMarkupIds } from "./plan.ts";
import { cleanProfile } from "./profile.ts";
import {
  legacyOf,
  publicDevice,
  publicRequest,
  sessionSummary,
  Store,
  type PlanRequest,
} from "./store.ts";
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
    webhook?: WebhookConfig;
    webhookFetch?: FetchLike;
    webhookNow?: () => number;
    blizzard?: BlizzardConfig | null;
    blizzardFetch?: GameDataFetch;
    /** One line per request (docs/adr/0013). Defaults to stdout. */
    log?: (line: string) => void;
    /** Postgres from DATABASE_URL, migrated (ADR 0057); the caller closes it. */
    database?: Sql;
  },
) {
  const store = new Store(config.dataDir, { postgres: config.database });
  const tokens = { companion: config.companionToken, planner: config.plannerToken };
  const registerLimiter = new RegisterLimiter();
  const app = new Hono();
  const log = config.log ?? ((line: string) => console.log(line));
  const webhook = new PlannerWebhook(
    config.webhook ?? webhookFromEnv(),
    store,
    log,
    config.webhookFetch,
    config.webhookNow,
  );
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
    const device = await store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device || device.status !== "approved") return c.json({ error: "Unauthorized" }, 401);
    await store.touchDevice(device.id);
    return { deviceId: device.id };
  };
  const unauthorized = (c: Parameters<typeof requireRole>[0]) =>
    c.json({ error: "Unauthorized" }, 401);

  const requestWithPlan = async (request: PlanRequest) => {
    const plan = request.planId ? await store.planById(request.planId) : undefined;
    return { ...publicRequest(request), plan: plan?.unb1 ?? null, eta: await store.planEta() };
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

  app.get("/health", (c) => c.json({ ok: true, webhook: webhook.enabled ? "on" : "off" }));

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
    const device = await store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device) return c.json({ error: "Unauthorized" }, 401);
    await store.touchDevice(device.id);
    const fresh = (await store.findDeviceBySecretHash(sha256Hex(presented))) ?? device;
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
      if (saved.created) {
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
    return c.json(await requestWithPlan(request));
  });

  // The exact Request the game waits for (D82); another device's id is 404.
  app.get("/v1/requests/:id", async (c) => {
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    await store.expireRequests();
    const request = await store.requestById(c.req.param("id"));
    if (!request || request.deviceId !== access.deviceId)
      return c.json({ error: "No such request." }, 404);
    return c.json(await requestWithPlan(request));
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
    return c.json({ id: stored.id, createdAt: stored.createdAt, plan: stored.unb1 });
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
    try {
      const raw = await snapshotBytes(c.req.raw.body);
      if (raw === null) return c.json({ error: "The game data is too large." }, 413);
      const gzip = (c.req.header("content-encoding") ?? "").toLowerCase().includes("gzip");
      const bytes = gzip ? gunzipSync(raw, { maxOutputLength: SNAPSHOT_MAX_INFLATED }) : raw;
      body = JSON.parse(bytes.toString("utf8"));
    } catch {
      return c.json({ error: "The game data must be JSON, optionally gzip." }, 400);
    }
    // Reading the body yielded: Forget or owner revoke may have completed.
    // Checked again inside the write transaction (asDevice), Account migration included.
    const access = await allowCompanion(c);
    if (access instanceof Response) return access;
    try {
      const cleaned = cleanSnapshot(body);
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

  // The Data explorer as JSON, for quick checks with the owner bearer (docs/adr/0030).
  app.get("/owner/data", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json(await store.data.catalog({ account: c.req.query("account") || undefined }));
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
      if (requestId && !(await store.requestById(requestId))) {
        return c.json({ error: "No request with that id." }, 404);
      }
      const plan = stripRequestId(body);
      const warnings: string[] = [];
      const missing = await gameIds.missing(planMarkupIds(plan));
      // One transaction: Forget my data cannot erase the Request between the two.
      const { stored, request } = await store.tx(async () => {
        const stored = await store.putPlan(plan, undefined, { missing, warnings }, requestId);
        const request = requestId ? await store.fulfillRequest(requestId, stored.id) : undefined;
        return { stored, request };
      });
      return c.json({
        id: stored.id,
        createdAt: stored.createdAt,
        plan: stored.unb1,
        stored: stored.plan,
        request: request ? publicRequest(request) : null,
        warnings,
      });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
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
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return handleMcp(c, store, config.dataDir, gameIds);
  });

  return {
    app,
    store,
    webhook,
    close: () => {
      webhook.stop();
      store.close();
    },
  };
}

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
