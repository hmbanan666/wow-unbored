import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Store } from "./store.ts";
import { webSession } from "./web-paths.ts";
import { FeedError, sharingState, setSharing, uploadScreenshot } from "./character-sharing.ts";
const identity = z
  .object({ realm: z.string().min(1).max(80), name: z.string().min(1).max(80) })
  .strict();
export function registerWebFeed(app: Hono, store: Store, origin: string) {
  const live = webSession(store);
  app.use("/v1/web/feed/*", bodyLimit({ maxSize: 12 * 1024 * 1024 }));
  app.use("/v1/web/feed/*", async (c, next) => {
    c.header("cache-control", "private, no-store");
    c.header("x-robots-tag", "noindex");
    if (c.req.method !== "GET" && c.req.header("origin") !== origin)
      return c.json({ message: "Open your character on the website to change sharing." }, 403);
    try {
      await next();
    } catch (error) {
      if (error instanceof FeedError)
        return c.json({ message: error.message }, error.status as 400);
      throw error;
    }
  });
  app.get("/v1/web/feed/sharing", (c) =>
    live(c, async (account) => {
      const parsed = identity.safeParse(c.req.query());
      if (!parsed.success) return c.json({ message: "Character not found." }, 400);
      return c.json(await sharingState(store.db, account, parsed.data));
    }),
  );
  app.put("/v1/web/feed/sharing", (c) =>
    live(c, async (account) => {
      const parsed = identity
        .extend({ enabled: z.boolean() })
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success)
        return c.json({ message: "Choose a character and sharing setting." }, 400);
      return c.json(await setSharing(store.db, account, parsed.data, parsed.data.enabled));
    }),
  );
  app.post("/v1/web/feed/screenshots", (c) =>
    live(c, async (account) => {
      const parsed = identity
        .extend({ generation: z.string().uuid(), own: z.literal("yes") })
        .safeParse(c.req.query());
      if (!parsed.success)
        return c.json({ message: "Confirm that this is your own game screenshot." }, 400);
      return c.json(
        await uploadScreenshot(
          store.db,
          account,
          parsed.data,
          Buffer.from(await c.req.arrayBuffer()),
          parsed.data.generation,
        ),
      );
    }),
  );
}
