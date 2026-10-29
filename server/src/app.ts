import { Hono } from "hono";
import { cors } from "hono/cors";

import { presentedBearer, requireRole, sha256Hex, tokenMatches } from "./auth.ts";
import type { Config } from "./config.ts";
import { clientIp, cleanRegistration, PENDING_CAP, RegisterLimiter } from "./devices.ts";
import { handleMcp } from "./mcp.ts";
import { PlanError } from "./plan.ts";
import { publicDevice, sessionSummary, Store } from "./store.ts";

function limitOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function createApp(config: Pick<Config, "companionToken" | "plannerToken" | "dataDir">) {
  const store = new Store(config.dataDir);
  const tokens = { companion: config.companionToken, planner: config.plannerToken };
  const registerLimiter = new RegisterLimiter();
  const app = new Hono();

  const allowCompanion = (c: Parameters<typeof requireRole>[0]) => {
    const presented = presentedBearer(c.req.header("authorization"));
    if (!presented) return c.json({ error: "Unauthorized" }, 401);
    if (tokenMatches(presented, tokens.companion)) return undefined;
    const device = store.findDeviceBySecretHash(sha256Hex(presented));
    if (!device || device.status !== "approved") return c.json({ error: "Unauthorized" }, 401);
    store.touchDevice(device.id);
    return undefined;
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

  app.get("/health", (c) => c.json({ ok: true }));

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

  app.get("/v1/plan", (c) => {
    const denied = allowCompanion(c);
    if (denied) return denied;
    const stored = store.latestPlan();
    if (!stored) return c.json({ error: "No plan yet." }, 404);
    return c.json({ plan: stored.unb1 });
  });

  app.post("/v1/progress", async (c) => {
    const denied = allowCompanion(c);
    if (denied) return denied;
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
      const stored = store.putPlan(body);
      return c.json({
        id: stored.id,
        createdAt: stored.createdAt,
        plan: stored.unb1,
        stored: stored.plan,
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
    return handleMcp(c, store);
  });

  return { app, store, close: () => store.close() };
}
