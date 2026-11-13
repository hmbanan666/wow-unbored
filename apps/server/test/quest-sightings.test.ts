import { test, expect } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { Store } from "../src/store.ts";
import { cleanSnapshot } from "../src/data.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
import { readQuestSightings } from "../src/quest-sightings.ts";
import { NOW } from "./helpers.ts";
const pg = postgresPerFile();
for (const backend of BACKENDS)
  test(`quest observations are idempotent, game-scoped and erased (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".quests-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      const upload = (account: string, title = "A Beginning", locale = "enUS") =>
        store.putSnapshot(
          cleanSnapshot({
            schema: 2,
            game: "forever",
            account,
            character: account,
            realm: "Realm",
            savedAt: NOW,
            sections: {
              questSeen: {
                scope: "char",
                v: 1,
                at: NOW,
                body: {
                  entries: [
                    {
                      questID: 42,
                      title,
                      locale,
                      level: 5,
                      seenAt: NOW,
                      acceptedAt: NOW,
                      accept: { npcId: 123, npcName: "Teacher", uiMapID: 37, x: 12.34, y: 45.67 },
                    },
                  ],
                },
              },
            },
          }),
          account,
          NOW,
        );
      await upload("a");
      await upload("a");
      await upload("b");
      const rows = await readQuestSightings(store.db, "forever");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        questID: 42,
        title: "A Beginning",
        slug: "a-beginning",
        level: 5,
        accept: [{ npcId: 123, npcName: "Teacher", uiMapID: 37, x: 12.3, y: 45.7 }],
      });
      expect(JSON.stringify(rows)).not.toContain("account");
      expect(await readQuestSightings(store.db, "retail")).toEqual([]);
      await store.forgetDevice("a", NOW + 1);
      expect(await readQuestSightings(store.db, "forever")).toHaveLength(1);
      await store.deleteAccountData("b");
      expect(await readQuestSightings(store.db, "forever")).toEqual([]);
      await upload("c", "Не английский", "ruRU");
      expect((await readQuestSightings(store.db, "forever"))[0]).toMatchObject({
        title: null,
        slug: "a-beginning",
        accept: [{ npcName: null }],
      });
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

for (const backend of BACKENDS)
  test(`quest sightings keep the first acceptance, latest turn-in and reject malformed fields (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".quest-updates-"));
    const store = new Store(dir, { postgres: pg(backend) });
    try {
      const { readFileSync } = await import("node:fs");
      const fixture = JSON.parse(
        readFileSync(
          new URL("../../../packages/contracts/fixtures/quest-sightings.json", import.meta.url),
          "utf8",
        ),
      );
      const upload = (at: number, entries: unknown[]) =>
        store.putSnapshot(
          cleanSnapshot({
            ...fixture,
            account: "a",
            savedAt: at,
            sections: { questSeen: { scope: "char", v: 1, at, body: { entries } } },
          }),
          "a",
          at,
        );
      const entry = fixture.sections.questSeen.body.entries[0];
      await upload(NOW, [{ ...entry, seenAt: NOW, acceptedAt: NOW - 10, turnedInAt: NOW }]);
      await upload(NOW + 100, [
        {
          ...entry,
          seenAt: NOW + 100,
          acceptedAt: NOW + 10,
          turnedInAt: NOW + 100,
          accept: { ...entry.accept, npcId: 555, x: 99 },
          turnIn: { ...entry.turnIn, npcId: 666, x: 10 },
        },
        { ...entry, questID: -1 },
        { ...entry, questID: 999, seenAt: NOW + 1000 },
        {
          ...entry,
          questID: 1000,
          title: "|Hplayer:bad",
          seenAt: NOW,
          acceptedAt: NOW,
          turnedInAt: undefined,
          accept: { npcName: "Player name", x: -1, y: 101 },
        },
      ]);
      const rows = await readQuestSightings(store.db, "forever");
      expect(rows.find((q) => q.questID === 42)).toMatchObject({
        accept: [{ npcId: 123, x: 12.3 }],
        turnIn: [{ npcId: 666, x: 10 }],
      });
      expect(rows.find((q) => q.questID === 1000)).toMatchObject({
        title: null,
        accept: [{ npcId: null, npcName: null, x: null, y: null }],
      });
      expect(rows.map((q) => q.questID).sort((a, b) => a - b)).toEqual([42, 1000]);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
