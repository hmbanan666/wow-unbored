import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";

import { packIds } from "@unbored/contracts";

import { sqlitePath } from "../src/config.ts";
import type { SectionRow } from "../src/data.ts";
import { Store } from "../src/store.ts";
import { suggest } from "../src/suggestions.ts";
import { requestCategory, tasteBonus } from "../src/taste.ts";
import { ACCOUNT, makeStore, NOW } from "./helpers.ts";
import { database, onPostgres } from "./backend.ts";

const rowBase = {
  ownerKind: "char" as const,
  ownerId: "Realm/Mira",
  v: 1,
  hash: "",
  at: NOW,
  savedAt: NOW,
  updatedAt: NOW,
  src: null,
  unknown: false,
  bytes: 0,
};

const counts = (picked: number, finished: number, wins = 0, doneSteps = 1, skippedSteps = 0) => ({
  picked,
  tracked: picked,
  finished,
  wins,
  doneSteps,
  skippedSteps,
});

test("taste math: (finished + wins + 1) / (tracked + 2), ±15, and a skip-heavy category at most -5", async () => {
  assert.deepEqual(tasteBonus(counts(2, 2)), { bonus: 0 }, "fewer than 3 picks: no nudge");
  assert.deepEqual(
    tasteBonus({ ...counts(10, 0), tracked: 2 }),
    { bonus: 0 },
    "picks without progress are not held against the category",
  );
  assert.equal(tasteBonus({ ...counts(3, 3), wins: 9 }).rate, 1, "rate is at most 1");
  assert.deepEqual(tasteBonus(counts(3, 3)), { rate: 0.8, bonus: 9 });
  assert.equal(tasteBonus(counts(10, 10, 10)).bonus, 15, "clamped at +15");
  assert.equal(tasteBonus(counts(30, 0)).bonus, -14);
  assert.equal(tasteBonus(counts(300, 0)).bonus, -15, "clamped at -15");
  assert.equal(tasteBonus(counts(4, 3, 0, 2, 5)).bonus, -5, "skipped > 2 x done");
  assert.equal(tasteBonus(counts(4, 0, 0, 1, 10)).bonus, -10, "already below -5 stays");
  assert.equal(tasteBonus(counts(3, 1)).bonus, -3);
  assert.equal(Object.is(tasteBonus(counts(4, 1)).bonus, -0), false, "no negative zero");
});

test("a Request's category is its idea kind, surprise, or preset:<topic>", async () => {
  assert.equal(
    requestCategory({ topic: "suggestion", mode: "fun", suggestionKind: "rare" }),
    "rare",
  );
  assert.equal(requestCategory({ topic: "surprise", mode: "fun" }), "surprise");
  assert.equal(requestCategory({ topic: "mount", mode: "farm" }), "preset:mount");
  assert.equal(requestCategory({ topic: null, mode: "roam" }), "preset:roam");
});

async function pick(
  store: Store,
  id: string,
  options: { topic?: string; kind?: string; generatedAt: number; at: number; tasks?: string[] },
) {
  await store.addRequest({
    id,
    deviceId: "pc-1",
    character: "Mira",
    realm: "Realm",
    mode: "fun",
    budget: null,
    wish: null,
    topic: options.kind ? "suggestion" : (options.topic ?? "surprise"),
    account: ACCOUNT,
    ...(options.kind
      ? {
          suggestionId: `${options.kind}:${id}`,
          suggestion: {
            id: `${options.kind}:${id}`,
            kind: options.kind,
            title: "T",
            goal: "G",
            rewards: [],
          },
        }
      : {}),
    nowSeconds: options.at,
  });
  const plan = await store.putPlan(
    {
      v: 1,
      kind: "plan",
      title: `Plan ${id}`,
      generatedAt: options.generatedAt,
      tasks: (options.tasks ?? ["a", "b"]).map((task) => ({ id: task, title: task.toUpperCase() })),
    },
    options.at,
  );
  await store.fulfillRequest(id, plan.id, options.at);
}

async function progress(
  store: Store,
  body: {
    generatedAt?: number;
    done: string[];
    skipped?: string[];
    remaining: string[];
    source?: string;
    mode?: string;
  },
  at: number,
) {
  await store.addProgress(
    {
      account: ACCOUNT,
      realm: "Realm",
      character: "Mira",
      progress: {
        v: 1,
        kind: "progress",
        source: body.source ?? "companion",
        mode: body.mode ?? "custom",
        ...(body.generatedAt !== undefined ? { generatedAt: body.generatedAt } : {}),
        done: body.done.map((id) => ({ id, at })),
        skipped: (body.skipped ?? []).map((id) => ({ id, at })),
        remaining: body.remaining,
      },
    },
    at,
  );
}

test("progress joins its plan by generatedAt and Character; finished, steps and picks per category", async () => {
  const store = makeStore();
  try {
    for (const [n, finished] of [
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ] as const) {
      await pick(store, `r${n}`, { kind: "rare", generatedAt: NOW + n, at: NOW + n });
      await progress(
        store,
        finished
          ? { generatedAt: NOW + n, done: ["a"], remaining: ["b"] }
          : { generatedAt: NOW + n, done: [], skipped: ["a"], remaining: ["b"] },
        NOW + 10 + n,
      );
      if (finished)
        await progress(
          store,
          { generatedAt: NOW + n, done: ["a", "b"], remaining: [] },
          NOW + 20 + n,
        );
    }
    await pick(store, "s1", {
      topic: "surprise",
      generatedAt: NOW + 50,
      at: NOW + 50,
      tasks: ["s", "t"],
    });
    // A 0.9 progress post without generatedAt and with other step ids joins no plan.
    await progress(store, { done: ["x", "y"], remaining: [] }, NOW + 60);
    // A chain Quick plan has no Request: its source names it.
    await progress(store, { done: ["q1"], remaining: [], source: "chain" }, NOW + 70);

    const taste = Object.fromEntries(
      (await store.taste(ACCOUNT, NOW + 100)).map((row) => [row.category, row]),
    );
    assert.deepEqual(taste.rare, {
      category: "rare",
      picked: 4,
      tracked: 4,
      finished: 3,
      doneSteps: 6,
      skippedSteps: 1,
      wins: 0,
      rate: 0.667,
      bonus: 5,
    });
    assert.equal(taste.surprise?.picked, 1);
    assert.equal(taste.surprise?.tracked, 0);
    assert.equal(taste.surprise?.finished, 0);
    assert.equal(taste.surprise?.bonus, 0);
    assert.equal(taste.chain?.picked, 1);
    assert.equal(taste.chain?.finished, 1);

    // Older than 60 days is left out.
    assert.equal((await store.taste(ACCOUNT, NOW + 61 * 86_400)).length, 0);
  } finally {
    store.close();
  }
});

test("progress without generatedAt joins its plan by step ids; picks never played are not a penalty", async () => {
  const store = makeStore();
  try {
    // Four Surprise picks under 0.9: the game never sent progress for three of them.
    for (const n of [1, 2, 3, 4]) {
      await pick(store, `s${n}`, {
        topic: "surprise",
        generatedAt: NOW + n,
        at: NOW + n,
        tasks: [`p${n}:a`, `p${n}:b`],
      });
    }
    // The fourth was played to the end; its posts have no generatedAt (session applied under 0.9).
    await progress(store, { done: ["p4:a"], remaining: ["p4:b"] }, NOW + 10);
    await progress(store, { done: ["p4:a", "p4:b"], remaining: [] }, NOW + 11);
    // Same step ids, but posted before the plan existed: not this plan's.
    await pick(store, "late", {
      topic: "mount",
      generatedAt: NOW + 30,
      at: NOW + 30,
      tasks: ["m:a"],
    });
    await progress(store, { done: ["m:a"], remaining: [] }, NOW + 20);

    const taste = Object.fromEntries(
      (await store.taste(ACCOUNT, NOW + 100)).map((row) => [row.category, row]),
    );
    assert.equal(taste.surprise?.picked, 4);
    assert.equal(taste.surprise?.tracked, 1);
    assert.equal(taste.surprise?.finished, 1);
    assert.equal(taste.surprise?.doneSteps, 2, "the newest post of that plan");
    assert.equal(taste.surprise?.bonus, 0, "one tracked plan is too few to judge, and no -10");
    assert.equal(taste["preset:mount"]?.tracked, 0);
  } finally {
    store.close();
  }
});

test("a repeated plan's progress counts once, for its newest delivery", async () => {
  const store = makeStore();
  try {
    await pick(store, "first", {
      topic: "nearby",
      generatedAt: NOW + 1,
      at: NOW + 1,
      tasks: ["x", "y"],
    });
    await pick(store, "again", {
      topic: "nearby",
      generatedAt: NOW + 2,
      at: NOW + 2,
      tasks: ["x", "y"],
    });
    await progress(store, { done: ["x"], remaining: ["y"] }, NOW + 3);
    const row = (await store.taste(ACCOUNT, NOW + 10)).find(
      (item) => item.category === "preset:nearby",
    );
    assert.equal(row?.picked, 2);
    assert.equal(row?.tracked, 1);
    assert.equal(row?.doneSteps, 1);
  } finally {
    store.close();
  }
});

// SQLite file migrations; Postgres starts from migrations/0001.
test.skipIf(onPostgres)("plans stored before 0.10 get generated_at from their body", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "unbored-backfill-"));
  const db = new DatabaseSync(sqlitePath(dir));
  db.exec(`CREATE TABLE plans (id INTEGER PRIMARY KEY, player_key TEXT NOT NULL, created_at INTEGER NOT NULL,
    body_json TEXT NOT NULL, unb1 TEXT NOT NULL)`);
  db.prepare(
    `INSERT INTO plans (player_key, created_at, body_json, unb1) VALUES ('self', ?, ?, '')`,
  ).run(NOW, JSON.stringify({ v: 1, kind: "plan", generatedAt: NOW - 5, tasks: [] }));
  db.close();
  const store = new Store(dir, { postgres: database() });
  try {
    await store.addRequest({
      id: "old",
      deviceId: "pc-1",
      character: "Mira",
      realm: "Realm",
      mode: "fun",
      budget: null,
      wish: null,
      topic: "mount",
      account: ACCOUNT,
      nowSeconds: NOW,
    });
    await store.fulfillRequest("old", 1, NOW);
    await progress(store, { generatedAt: NOW - 5, done: ["a"], remaining: [] }, NOW + 1);
    const row = (await store.taste(ACCOUNT, NOW + 2)).find(
      (item) => item.category === "preset:mount",
    );
    assert.equal(row?.finished, 1);
  } finally {
    store.close();
  }
});

test("taste nudges an idea kind before the per-rule cut", async () => {
  const achProgress = {
    ownerKind: "char" as const,
    ownerId: "Realm/Mira",
    section: "achProgress",
    v: 1,
    hash: "",
    at: NOW,
    savedAt: NOW,
    updatedAt: NOW,
    src: null,
    unknown: false,
    bytes: 0,
    body: { rows: [{ id: 77, d: 9, t: 10 }] },
  };
  const base = {
    now: NOW,
    sections: new Map([["achProgress", achProgress]]),
    altQuests: [],
    characters: 1,
  };
  const catalog = {
    holidays: [],
    achievements: [],
    exploration: [],
    rares: [],
    farm: [{ id: "a", fallbackTitle: "A", mounts: [1] }],
  };
  assert.deepEqual(
    suggest(base, catalog).map((idea) => idea.kind),
    ["achievement", "collection"],
  );
  const nudged = suggest(
    {
      ...base,
      taste: new Map([
        ["achievement", -15],
        ["collection", 15],
      ]),
    },
    catalog,
  );
  assert.deepEqual(
    nudged.map((idea) => idea.kind),
    ["collection", "achievement"],
    "a nudge reorders, it never hides",
  );
});

test("an achievement 80% done or more becomes an Almost there idea; earned or below 80% does not", async () => {
  const sections = (rows: object[], earned: number[] = []) =>
    new Map<string, SectionRow>([
      ["achProgress", { ...rowBase, section: "achProgress", body: { rows } }],
      [
        "achievementsMine",
        { ...rowBase, section: "achievementsMine", body: { ids: packIds(earned) } },
      ],
    ]);
  const empty = { holidays: [], achievements: [], exploration: [], rares: [], farm: [] };
  const ideas = suggest(
    {
      now: NOW,
      sections: sections(
        [
          { id: 77, d: 8, t: 10 },
          { id: 78, d: 7, t: 10 },
          { id: 79, d: 9, t: 10 },
        ],
        [79],
      ),
      altQuests: [],
      characters: 1,
    },
    empty,
  );
  assert.deepEqual(
    ideas.map((idea) => idea.id),
    ["ach:77"],
  );
  assert.equal(ideas[0]!.why, "8 of 10 done");
  assert.deepEqual(ideas[0]!.rewards, ["{ach:77}"]);
});
