import { expect, test } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { Store } from "../src/store.ts";
import { cleanSnapshot } from "../src/data.ts";
import { todayGoals } from "../src/today-goals.ts";
import { BACKENDS, postgresPerFile } from "./postgres-db.ts";
const pg = postgresPerFile();
for (const backend of BACKENDS)
  test(`Today sets persist per UTC day and tick on ingest (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".today-"));
    const store = new Store(dir, { postgres: pg(backend) });
    const day = Math.floor(Date.now() / 86400000) * 86400;
    const owner = { accountId: "a", game: "forever" as const, characterId: "forever/Realm/Kania" };
    const upload = (now: number, read = false, max = 150) =>
      store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          game: "forever",
          account: "a",
          realm: "Realm",
          character: "Kania",
          savedAt: now,
          sections: {
            professions: {
              scope: "char",
              v: 1,
              at: now,
              body: { list: [{ skillLine: 333, name: "Enchanting", skill: 150, max }] },
            },
            ...(read
              ? {
                  recipes: {
                    scope: "char",
                    v: 1,
                    at: now,
                    body: { byProfession: { 333: { learned: ["ids1"] } } },
                  },
                }
              : {}),
          },
        }),
        "pc",
        now,
      );
    try {
      await upload(day);
      expect(await todayGoals(store.db, owner, { now: day, create: false })).toEqual([]);
      const first = (await todayGoals(store.db, owner, { now: day + 1 }))[0]!;
      expect(first.goals[0]?.target.kind).toBe("window");
      expect(await todayGoals(store.db, owner, { now: day + 2 })).toEqual([first]);
      expect(
        await todayGoals(store.db, { ...owner, accountId: "other" }, { now: day + 3 }),
      ).toEqual([]);
      expect(await todayGoals(store.db, { ...owner, game: "retail" }, { now: day + 3 })).toEqual(
        [],
      );
      await upload(day + 4, true);
      const ticked = (await todayGoals(store.db, owner, { now: day + 5, create: false }))[0]!;
      expect(ticked.goals[0]?.completedAt).toBe(day + 4);
      const next = (await todayGoals(store.db, owner, { now: day + 6 }))[0]!;
      expect(next.id).not.toBe(first.id);
      expect(next.goals[0]?.target.kind).toBe("rank");
      const tomorrow = (await todayGoals(store.db, owner, { now: day + 86400 }))[0]!;
      expect(tomorrow.id).not.toBe(next.id);
      expect(tomorrow.day).toBe(Math.floor(day / 86400) + 1);
      expect(tomorrow.goals[0]?.id).toBe(next.goals[0]?.id);
      await upload(day + 86401, true, 225);
      expect(
        (await todayGoals(store.db, owner, { now: day + 86402, create: false }))[0]?.goals[0]
          ?.completedAt,
      ).toBe(day + 86401);
      const finished = (await todayGoals(store.db, owner, { now: day + 86403 }))[0]!;
      expect(finished.id).toBe(tomorrow.id);
      expect(finished.goals[0]!.completedAt).toBe(day + 86401);
      await store.data.deleteAccount("a");
      expect(await store.db.all("SELECT * FROM character_goals")).toEqual([]);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

for (const backend of BACKENDS)
  test(`coverage ticks only for fresh own-Account profession sightings, including an Alt (${backend})`, async () => {
    const dir = mkdtempSync(path.join(import.meta.dirname, ".today-"));
    const store = new Store(dir, { postgres: pg(backend) });
    const now = Math.floor(Date.now() / 1000);
    const owner = { accountId: "a", game: "forever" as const, characterId: "forever/Realm/Kania" };
    const upload = (
      account: string,
      character: string,
      at: number,
      skillLine: number,
      kind = "trainerSeen",
    ) =>
      store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          game: "forever",
          account,
          realm: "Realm",
          character,
          savedAt: at,
          sections: {
            [kind]: {
              scope: "char",
              v: 1,
              at,
              body: {
                entries: [
                  {
                    npcId: 8,
                    npcName: "Observed teacher",
                    spellId: 2,
                    itemId: 20,
                    numAvailable: -1,
                    skillLine,
                    seenAt: at,
                  },
                ],
              },
            },
          },
        }),
        "pc",
        at,
      );
    try {
      const builds = store.db.pg ? "game.builds" : "game_builds";
      const recipes = store.db.pg ? "game.profession_recipes" : "game_profession_recipes";
      await store.db.run(
        `INSERT INTO ${builds} (game, build, build_number, imported_at, achievements) VALUES ('forever', 'fixture', 1, ?, 0)`,
        now,
      );
      await store.db.run(
        `INSERT INTO ${recipes} (game, build, skill_line, spell_id, ${store.db.body}) VALUES ('forever', 'fixture', 333, 1, ?)`,
        JSON.stringify({
          spellId: 1,
          skillLine: 333,
          name: "Unseen enchant",
          category: { id: 1, name: "Enchants", order: 1 },
          minSkill: 1,
          thresholds: { orange: 1, yellow: 150, green: 160, grey: 170 },
          skillUps: 1,
          acquireMethod: 0,
          reagents: [],
          craftedItems: [],
          teachingItems: [],
        }),
      );
      await store.putSnapshot(
        cleanSnapshot({
          schema: 2,
          game: "forever",
          account: "a",
          realm: "Realm",
          character: "Kania",
          savedAt: now,
          sections: {
            professions: {
              scope: "char",
              v: 1,
              at: now,
              body: { list: [{ skillLine: 333, name: "Enchanting", skill: 145, max: 150 }] },
            },
            recipes: {
              scope: "char",
              v: 1,
              at: now,
              body: { byProfession: { 333: { learned: ["ids1"] } } },
            },
          },
        }),
        "pc",
        now,
      );
      const [first, concurrent] = await Promise.all([
        todayGoals(store.db, owner, { now }),
        todayGoals(store.db, owner, { now }),
      ]);
      expect(concurrent).toEqual(first);
      expect(first[0]!.goals.map((g) => g.target.kind)).toEqual(["coverage"]);
      await upload("b", "Stranger", now + 1, 333);
      await upload("a", "Alt", now + 2, 197);
      expect(
        (await todayGoals(store.db, owner, { now: now + 3 }))[0]!.goals[0]!.completedAt,
      ).toBeNull();
      await upload("a", "Alt", now + 4, 333, "merchantSeen");
      const ticked = (await todayGoals(store.db, owner, { now: now + 5, create: false }))[0]!;
      expect(ticked.goals[0]!.completedAt).toBe(now + 4);
      const next = (await todayGoals(store.db, owner, { now: now + 6 }))[0]!;
      expect(next.id).not.toBe(first[0]!.id);
      expect(next.goals[0]!.completedAt).toBeNull();
      await upload("a", "Alt", now + 4, 333, "merchantSeen");
      expect(
        (await todayGoals(store.db, owner, { now: now + 7 }))[0]!.goals[0]!.completedAt,
      ).toBeNull();
      await store.forgetDevice("pc", now + 8);
      expect(await store.db.all("SELECT * FROM character_goals")).toEqual([]);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

test("opening an existing SQLite database adds Today storage and character deletion cascades", async () => {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".today-migration-"));
  let store = new Store(dir);
  try {
    await store.db.run(
      "INSERT INTO accounts (id, label, first_seen, last_seen) VALUES ('existing', 'existing', 1, 2)",
    );
    await store.db.run("DROP TABLE character_goals");
    store.close();
    store = new Store(dir);
    expect((await store.data.accounts())[0]?.id).toBe("existing");
    await store.db.run(
      "INSERT INTO characters (id, account_id, name, realm, game, last_seen) VALUES ('forever/R/C', 'existing', 'C', 'R', 'forever', 1)",
    );
    await store.db.run(
      "INSERT INTO character_goals (character_id, skill_line, position, set_id, goal_id, day, created_at, goal_body) VALUES ('forever/R/C', 333, 0, 's', 'g', 1, 1, '{}')",
    );
    await store.db.run(
      "DELETE FROM characters WHERE id = 'forever/R/C' AND account_id = 'existing'",
    );
    expect(await store.db.all("SELECT * FROM character_goals")).toEqual([]);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
