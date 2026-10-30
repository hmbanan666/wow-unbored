import { gunzipSync } from "node:zlib";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { presentedBearer, requireRole, sha256Hex, tokenMatches } from "./auth.ts";
import type { Config } from "./config.ts";
import { clientIp, cleanRegistration, PENDING_CAP, RegisterLimiter } from "./devices.ts";
import { cleanSnapshot, SNAPSHOT_MAX_COMPRESSED, SNAPSHOT_MAX_INFLATED } from "./data.ts";
import { handleMcp } from "./mcp.ts";
import { cleanPlanRequest, PlanError } from "./plan.ts";
import { cleanProfile } from "./profile.ts";
import { publicDevice, publicRequest, sessionSummary, Store, type PlanRequest } from "./store.ts";
import { PlannerWebhook, webhookFromEnv, type FetchLike, type WebhookConfig } from "./webhook.ts";

function limitOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function createApp(
  config: Pick<Config, "companionToken" | "plannerToken" | "dataDir"> & {
    webhook?: WebhookConfig;
    webhookFetch?: FetchLike;
    webhookNow?: () => number;
    /** One line per request (docs/adr/0013). Defaults to stdout. */
    log?: (line: string) => void;
  },
) {
  const store = new Store(config.dataDir);
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

  const allowCompanion = (c: Parameters<typeof requireRole>[0]) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    if (tokenMatches(presented, tokens.companion)) return { deviceId: "legacy" };
    const device = store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device || device.status !== "approved") return c.json({ error: "Unauthorized" }, 401);
    store.touchDevice(device.id);
    return { deviceId: device.id };
  };

  const requestWithPlan = (request: PlanRequest) => {
    const plan = request.planId ? store.planById(request.planId) : undefined;
    return { ...publicRequest(request), plan: plan?.unb1 ?? null, eta: store.planEta() };
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
    const result = store.registerDevice({
      id: cleaned.id,
      name: cleaned.name,
      secretHash: cleaned.secretHash,
      nowSeconds: Math.floor(Date.now() / 1000),
      pendingCap: PENDING_CAP,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(publicDevice(result.device), result.created ? 201 : 200);
  });

  app.get("/v1/devices/me", (c) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    const device = store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device) return c.json({ error: "Unauthorized" }, 401);
    store.touchDevice(device.id);
    const fresh = store.findDeviceBySecretHash(sha256Hex(presented)) ?? device;
    return c.json(publicDevice(fresh));
  });

  app.post("/v1/requests", async (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "The request must be JSON." }, 400);
    }
    try {
      const cleaned = cleanPlanRequest(body);
      const saved = store.addRequest({
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
        nowSeconds: cleaned.createdAt ?? Math.floor(Date.now() / 1000),
      });
      if (saved.created) {
        await webhook.notify(saved.request);
      }
      return c.json(publicRequest(saved.request), saved.created ? 201 : 200);
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/v1/requests/latest", (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    store.expireRequests();
    const request = store.latestRequestForDevice(access.deviceId);
    if (!request) return c.json({ error: "No request yet." }, 404);
    return c.json(requestWithPlan(request));
  });

  // The exact Request the game waits for (D82); another device's id is 404.
  app.get("/v1/requests/:id", (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    store.expireRequests();
    const request = store.requestById(c.req.param("id"));
    if (!request || request.deviceId !== access.deviceId)
      return c.json({ error: "No such request." }, 404);
    return c.json(requestWithPlan(request));
  });

  // Personal advice for this device's characters (docs/adr/0019).
  app.get("/v1/advice", (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    return c.json({ characters: store.adviceForDevice(access.deviceId) });
  });

  app.get("/v1/plan", (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    const stored = store.latestPlan();
    if (!stored) return c.json({ error: "No plan yet." }, 404);
    return c.json({ id: stored.id, createdAt: stored.createdAt, plan: stored.unb1 });
  });

  app.post("/v1/progress", async (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Progress must be JSON." }, 400);
    }
    try {
      const stored = store.addProgress(body);
      return c.json({ ok: true, id: stored.id });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.post("/v1/profile", async (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "The profile must be JSON." }, 400);
    }
    try {
      const saved = store.putProfile({ ...cleanProfile(body), deviceId: access.deviceId });
      return c.json({ ok: true, updated: saved.updated, updatedAt: saved.profile.updatedAt });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  // Game data Sections that changed, gzip JSON (docs/adr/0029).
  app.post("/v1/snapshot", async (c) => {
    const access = allowCompanion(c);
    if (access instanceof Response) return access;
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > SNAPSHOT_MAX_COMPRESSED) {
      return c.json({ error: "The game data is too large." }, 413);
    }
    const raw = Buffer.from(await c.req.arrayBuffer());
    if (raw.length > SNAPSHOT_MAX_COMPRESSED) {
      return c.json({ error: "The game data is too large." }, 413);
    }
    let body: unknown;
    try {
      const gzip = (c.req.header("content-encoding") ?? "").toLowerCase().includes("gzip");
      const bytes = gzip ? gunzipSync(raw, { maxOutputLength: SNAPSHOT_MAX_INFLATED }) : raw;
      body = JSON.parse(bytes.toString("utf8"));
    } catch {
      return c.json({ error: "The game data must be JSON, optionally gzip." }, 400);
    }
    try {
      const result = store.putSnapshot(cleanSnapshot(body), access.deviceId);
      return c.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  // The Data explorer as JSON, for quick checks with the owner bearer (docs/adr/0030).
  app.get("/owner/data", (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json(store.data.catalog({ account: c.req.query("account") || undefined }));
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
      if (requestId && !store.requestById(requestId)) {
        return c.json({ error: "No request with that id." }, 404);
      }
      const stored = store.putPlan(stripRequestId(body));
      const request = requestId ? store.fulfillRequest(requestId, stored.id) : undefined;
      return c.json({
        id: stored.id,
        createdAt: stored.createdAt,
        plan: stored.unb1,
        stored: stored.plan,
        request: request ? publicRequest(request) : null,
      });
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/v1/progress", (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      latest: store.latestProgress() ?? null,
      characters: store.latestPerCharacter(),
    });
  });

  app.get("/v1/progress/history", (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      progress: store.progressHistory(limitOf(c.req.query("limit"), 50)),
    });
  });

  app.get("/v1/sessions", (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return c.json({
      sessions: store.listPlans(limitOf(c.req.query("limit"), 20)).map(sessionSummary),
    });
  });

  app.all("/mcp", async (c) => {
    const denied = requireRole(c, "planner", tokens);
    if (denied) return denied;
    return handleMcp(c, store, config.dataDir);
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
