import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Store } from "./store.ts";
import { FeedError, sharingState, setSharing, uploadScreenshot } from "./character-sharing.ts";
const identity = z.object({ realm: z.string().min(1).max(80), name: z.string().min(1).max(80) });
/** Device credentials can reach only characters last uploaded by that approved Device. */
export function registerDeviceFeed(
  app: Hono,
  store: Store,
  authenticate: (c: Context) => Promise<Response | { deviceId: string }>,
) {
  app.use("/v1/feed/*", bodyLimit({ maxSize: 12 * 1024 * 1024 }));
  app.use("/v1/feed/*", async (c, next) => {
    c.header("cache-control", "private, no-store");
    if (!store.db.pg) return c.json({ message: "Sharing is unavailable." }, 503);
    try {
      await next();
    } catch (error) {
      if (error instanceof FeedError)
        return c.json({ message: error.message }, error.status as 400);
      throw error;
    }
  });
  const owner = async (
    c: Context,
    who: { realm: string; name: string },
    work: (account: string) => Promise<Response>,
  ) => {
    const auth = await authenticate(c);
    if (auth instanceof Response) return auth;
    if (auth.deviceId === "legacy")
      return c.json({ message: "Connect this Companion first." }, 401);
    return (
      (await store.asDevice(auth.deviceId, async () => {
        const row = await store.db.get<{ account_id: string }>(
          "SELECT account_id FROM characters WHERE device_id = ? AND game = 'forever' AND realm = ? AND name = ?",
          auth.deviceId,
          who.realm,
          who.name,
        );
        if (!row) return c.json({ message: "Character not found." }, 404);
        await store.db.lockKey(`account:${row.account_id}`);
        return work(row.account_id);
      })) ?? c.json({ message: "Connect this Companion first." }, 401)
    );
  };
  app.get("/v1/feed/sharing", async (c) => {
    const who = identity.strict().safeParse(c.req.query());
    if (!who.success) return c.json({ message: "Choose a character." }, 400);
    return owner(c, who.data, async (account) =>
      c.json(await sharingState(store.db, account, who.data)),
    );
  });
  app.put("/v1/feed/sharing", async (c) => {
    const parsed = identity
      .extend({ enabled: z.boolean() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "Choose a character and sharing setting." }, 400);
    return owner(c, parsed.data, async (account) =>
      c.json(await setSharing(store.db, account, parsed.data, parsed.data.enabled)),
    );
  });
  app.post("/v1/feed/screenshots", async (c) => {
    const parsed = identity
      .extend({ generation: z.string().uuid(), at: z.coerce.number().int().nonnegative() })
      .strict()
      .safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ message: "Choose a new screenshot while sharing is on." }, 400);
    return owner(c, parsed.data, async (account) =>
      c.json(
        await uploadScreenshot(
          store.db,
          account,
          parsed.data,
          Buffer.from(await c.req.arrayBuffer()),
          parsed.data.generation,
          parsed.data.at,
        ),
      ),
    );
  });
}
