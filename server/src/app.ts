import { Hono } from "hono";
import { cors } from "hono/cors";

import { requireRole } from "./auth.ts";
import type { Config } from "./config.ts";
import { handleMcp } from "./mcp.ts";
import { PlanError } from "./plan.ts";
import { sessionSummary, Store } from "./store.ts";

function limitOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function createApp(config: Pick<Config, "companionToken" | "plannerToken" | "dataDir">) {
  const store = new Store(config.dataDir);
  const tokens = { companion: config.companionToken, planner: config.plannerToken };
  const app = new Hono();

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

  app.get("/v1/plan", (c) => {
    const denied = requireRole(c, "companion", tokens);
    if (denied) return denied;
    const stored = store.latestPlan();
    if (!stored) return c.json({ error: "No plan yet." }, 404);
    return c.json({ plan: stored.unb1 });
  });

  app.post("/v1/progress", async (c) => {
    const denied = requireRole(c, "companion", tokens);
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
