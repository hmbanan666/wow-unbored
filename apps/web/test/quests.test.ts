import { test, expect } from "vite-plus/test";
import { testDatabase, hasPostgres } from "../../server/test/postgres-db.ts";
import {
  readPublicQuests,
  readPublicQuestChains,
  readQuestOverlay,
} from "../server/utils/quests.ts";
import { Store } from "../../server/src/store.ts";
import { cleanSnapshot } from "../../server/src/data.ts";
import { publishQuestChains } from "../../server/src/quest-chains.ts";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { NOW } from "../../server/test/helpers.ts";
const dbTest = test.skipIf(!hasPostgres);
dbTest(
  "quest pages aggregate English observations, stable slugs and ownership-checked progress",
  async () => {
    const db = await testDatabase();
    const dir = mkdtempSync(path.join(import.meta.dirname, ".quests-"));
    const store = new Store(dir, { postgres: db.sql });
    const identity = { game: "forever" as const, name: "Hero", realm: "Realm" };
    try {
      await store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          game: "forever",
          account: "owner",
          character: "Hero",
          realm: "Realm",
          savedAt: NOW,
          sections: {
            questSeen: {
              scope: "char",
              v: 1,
              at: NOW,
              body: {
                entries: [42, 43].map((questID) => ({
                  questID,
                  locale: "enUS",
                  title: "A Beginning",
                  level: 5,
                  acceptedAt: NOW,
                  seenAt: NOW,
                  accept: { npcId: 123, npcName: "Marshal", uiMapID: 37, x: 12.3, y: 45.6 },
                })),
              },
            },
            questsDone: { scope: "char", v: 1, at: NOW, body: { ids: ["ids1", "16"], count: 1 } },
            questLog: { scope: "char", v: 1, at: NOW, body: { quests: [{ questID: 43 }] } },
          },
        }),
        "device",
        NOW,
      );
      const quests = await readPublicQuests(db.sql);
      expect(quests.map((q) => q.slug)).toEqual(["a-beginning", "a-beginning-43"]);
      expect(JSON.stringify(quests)).not.toMatch(/owner|Hero|account_id/);
      await db.sql`UPDATE quest_sightings SET title = 'Renamed'`;
      expect((await readPublicQuests(db.sql)).map((q) => q.slug)).toEqual([
        "a-beginning",
        "a-beginning-43",
      ]);
      const chain = {
        slug: "a-chain",
        title: "A chain",
        faction: "Both",
        zone: "Elwynn Forest",
        status: "published",
        steps: [
          { questID: 42, title: "A Beginning" },
          { questID: 43, title: "Next" },
        ],
      };
      await publishQuestChains(store.db, [chain]);
      expect(await readPublicQuestChains(db.sql)).toHaveLength(1);
      expect(
        await readQuestOverlay(db.sql, "stranger", identity, "quests", "a-beginning"),
      ).toBeNull();
      const overlay = await readQuestOverlay(db.sql, "owner", identity, "quest-chains", "a-chain");
      expect(overlay?.steps.map((s) => ({ done: s.done, inLog: s.inLog, next: s.next }))).toEqual([
        { done: true, inLog: false, next: false },
        { done: false, inLog: true, next: true },
      ]);
      await store.deleteAccountData("owner");
      expect(await readPublicQuests(db.sql)).toEqual([]);
      expect(await readPublicQuestChains(db.sql)).toEqual([]);
    } finally {
      store.close();
      await db.drop();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
