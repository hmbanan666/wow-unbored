import { clientIp, RegisterLimiter } from "./devices.ts";
import { z } from "zod";
import { ActivePathError, pathSelectionSchema } from "./active-path.ts";
import type { Hono, Context } from "hono";
import { WEB_SESSION_DAYS } from "@unbored/contracts";
import { presentedBearer } from "./auth.ts";
import type { Store } from "./store.ts";

const selectionBody = z
  .object({
    character: z.string().trim().min(1).max(80),
    realm: z.string().trim().min(1).max(80),
    path: pathSelectionSchema,
    expectedActive: pathSelectionSchema.nullable().optional(),
  })
  .strict();

/** The bearer is the opaque row id held only inside the website's sealed cookie. */
export function registerWebPaths(app: Hono, store: Store, origin: string) {
  const sessions = new RegisterLimiter();
  const addresses = new RegisterLimiter();
  const live = webSession(store);
  app.use("/v1/web/paths/*", async (c, next) => {
    c.header("cache-control", "private, no-store");
    await next();
  });
  app.get("/v1/web/paths/progress", (c) =>
    live(c, async (account) => {
      if (Object.keys(c.req.query()).length) return c.json({ error: "invalid_query" }, 400);
      const progress = await store.pathProgress({ account });
      const characters = [];
      for (const { game, character, realm, paths } of progress) {
        const active = await store.activePaths.get({ account, character, realm });
        characters.push({ game, character, realm, paths, active: active.path });
      }
      return c.json({ characters });
    }),
  );
  app.put("/v1/web/paths/active", (c) =>
    live(c, async (account) => {
      if (
        c.req.header("origin") !== origin ||
        (c.req.header("sec-fetch-site") && c.req.header("sec-fetch-site") !== "same-origin") ||
        c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
      )
        return c.json({ error: "same_origin_required" }, 403);
      const session = presentedBearer(c.req.header("authorization"))!;
      const ip = clientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
      if (!sessions.allow(session) || !addresses.allow(ip))
        return c.json({ error: "too_many_attempts" }, 429);
      const parsed = selectionBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_selection" }, 400);
      const { character, realm, path, expectedActive } = parsed.data;
      if (
        !(await store.data.characters(account)).some(
          (row) => row.game === "retail" && row.name === character && row.realm === realm,
        )
      )
        return c.json({ error: "character_not_found" }, 404);
      const who = { account, character, realm };
      const current = (await store.activePaths.get(who)).path;
      const same = (
        a: { kind: string; slug: string; locale: string } | null | undefined,
        b: { kind: string; slug: string; locale: string } | null | undefined,
      ) => a?.kind === b?.kind && a?.slug === b?.slug && a?.locale === b?.locale;
      if (!same(current, path) && !same(current, expectedActive))
        return c.json({ error: "replacement_required", current }, 409);
      try {
        const result = await store.activePaths.set({ ...who, path });
        return c.json({ path: result.path });
      } catch (error) {
        if (error instanceof ActivePathError) return c.json({ error: "unavailable_path" }, 400);
        throw error;
      }
    }),
  );
}

export function webSession(store: Store) {
  const unauthorized = (c: Context) => c.json({ error: "session_closed" }, 401);
  return async (c: Context, work: (account: string, deviceId: string) => Promise<Response>) => {
    if (!store.db.pg) return c.json({ error: "unavailable" }, 503);
    const id = presentedBearer(c.req.header("authorization"));
    if (!id) return unauthorized(c);
    const session = await store.db.get<{ device_id: string; account_id: string }>(
      "SELECT device_id, account_id FROM web.sessions WHERE id = ?",
      id,
    );
    if (!session) return unauthorized(c);
    // Same device -> Account lock order as uploads and Forget my data.
    return (
      (await store.asDevice(session.device_id, async () => {
        // Erasure on another Device locks the Account before closing every session.
        await store.db.lockKey(`account:${session.account_id}`);
        const row = await store.db.get<{ account_id: string }>(
          `SELECT account_id FROM web.sessions WHERE id = ? AND device_id = ? AND account_id = ?
         AND ended_at IS NULL AND created_at > ? FOR SHARE`,
          id,
          session.device_id,
          session.account_id,
          Math.floor(Date.now() / 1000) - WEB_SESSION_DAYS * 86400,
        );
        if (!row) return unauthorized(c);
        return work(row.account_id, session.device_id);
      })) ?? unauthorized(c)
    );
  };
}
