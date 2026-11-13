import type { Hono } from "hono";
import { z } from "zod";
import type { Store } from "./store.ts";
import { webSession } from "./web-paths.ts";
import { todayGoals } from "./today-goals.ts";
const query = z
  .object({
    game: z.enum(["forever", "retail"]),
    character: z.string().min(1).max(80),
    realm: z.string().min(1).max(80),
  })
  .strict();
export function registerWebToday(app: Hono, store: Store) {
  const live = webSession(store);
  app.get("/v1/web/today", async (c) => {
    c.header("cache-control", "private, no-store");
    return live(c, async (accountId) => {
      const parsed = query.safeParse(c.req.query());
      if (!parsed.success) return c.json({ error: "invalid_query" }, 400);
      const { game, character, realm } = parsed.data;
      const row = await store.db.get<{ id: string }>(
        "SELECT id FROM characters WHERE account_id = ? AND game = ? AND name = ? AND realm = ?",
        accountId,
        game,
        character,
        realm,
      );
      if (!row) return c.json({ error: "character_not_found" }, 404);
      const sets = await todayGoals(store.db, { accountId, game, characterId: row.id });
      return c.json({ sets });
    });
  });
}
