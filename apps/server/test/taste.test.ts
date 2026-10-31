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
  finished,
  wins,
  doneSteps,
  skippedSteps,
});

test("taste math: (finished + wins + 1) / (picked + 2), ±15, and a skip-heavy category at most -5", () => {
  assert.deepEqual(tasteBonus(counts(2, 2)), { bonus: 0 }, "fewer than 3 picks: no nudge");
  assert.deepEqual(tasteBonus(counts(3, 3)), { rate: 0.8, bonus: 9 });
  assert.equal(tasteBonus(counts(10, 10, 10)).bonus, 15, "clamped at +15");
  assert.equal(tasteBonus(counts(30, 0)).bonus, -14);
  assert.equal(tasteBonus(counts(300, 0)).bonus, -15, "clamped at -15");
  assert.equal(tasteBonus(counts(4, 3, 0, 2, 5)).bonus, -5, "skipped > 2 x done");
  assert.equal(tasteBonus(counts(4, 0, 0, 1, 10)).bonus, -10, "already below -5 stays");
  assert.equal(tasteBonus(counts(3, 1)).bonus, -3);
  assert.equal(Object.is(tasteBonus(counts(4, 1)).bonus, -0), false, "no negative zero");
});

test("a Request's category is its idea kind, surprise, or preset:<topic>", () => {
  assert.equal(
    requestCategory({ topic: "suggestion", mode: "fun", suggestionKind: "rare" }),
    "rare",
  );
  assert.equal(requestCategory({ topic: "surprise", mode: "fun" }), "surprise");
  assert.equal(requestCategory({ topic: "mount", mode: "farm" }), "preset:mount");
  assert.equal(requestCategory({ topic: null, mode: "roam" }), "preset:roam");
});

function pick(
  store: Store,
  id: string,
  options: { topic?: string; kind?: string; generatedAt: number; at: number },
) {
  store.addRequest({
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
  const plan = store.putPlan(
    {
      v: 1,
      kind: "plan",
      title: `Plan ${id}`,
      generatedAt: options.generatedAt,
      tasks: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    },
    options.at,
  );
  store.fulfillRequest(id, plan.id, options.at);
}

function progress(
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
  store.addProgress(
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

test("progress joins its plan by generatedAt and Character; finished, steps and picks per category", () => {
  const store = makeStore();
  try {
    for (const [n, finished] of [
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ] as const) {
      pick(store, `r${n}`, { kind: "rare", generatedAt: NOW + n, at: NOW + n });
      progress(
        store,
        finished
          ? { generatedAt: NOW + n, done: ["a"], remaining: ["b"] }
          : { generatedAt: NOW + n, done: [], skipped: ["a"], remaining: ["b"] },
        NOW + 10 + n,
      );
      if (finished)
        progress(store, { generatedAt: NOW + n, done: ["a", "b"], remaining: [] }, NOW + 20 + n);
    }
    pick(store, "s1", { topic: "surprise", generatedAt: NOW + 50, at: NOW + 50 });
    // A 0.9 progress post without generatedAt is still stored and never joins a plan.
    progress(store, { done: ["a", "b"], remaining: [] }, NOW + 60);
    // A chain Quick plan has no Request: its source names it.
    progress(store, { done: ["q1"], remaining: [], source: "chain" }, NOW + 70);

    const taste = Object.fromEntries(
      store.taste(ACCOUNT, NOW + 100).map((row) => [row.category, row]),
    );
    assert.deepEqual(taste.rare, {
      category: "rare",
      picked: 4,
      finished: 3,
      doneSteps: 6,
      skippedSteps: 1,
      wins: 0,
      rate: 0.667,
      bonus: 5,
    });
    assert.equal(taste.surprise?.picked, 1);
    assert.equal(taste.surprise?.finished, 0);
    assert.equal(taste.surprise?.bonus, 0);
    assert.equal(taste.chain?.picked, 1);
    assert.equal(taste.chain?.finished, 1);

    // Older than 60 days is left out.
    assert.equal(store.taste(ACCOUNT, NOW + 61 * 86_400).length, 0);
  } finally {
    store.close();
  }
});

test("plans stored before 0.10 get generated_at from their body", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "unbored-backfill-"));
  const db = new DatabaseSync(sqlitePath(dir));
  db.exec(`CREATE TABLE plans (id INTEGER PRIMARY KEY, player_key TEXT NOT NULL, created_at INTEGER NOT NULL,
    body_json TEXT NOT NULL, unb1 TEXT NOT NULL)`);
  db.prepare(
    `INSERT INTO plans (player_key, created_at, body_json, unb1) VALUES ('self', ?, ?, '')`,
  ).run(NOW, JSON.stringify({ v: 1, kind: "plan", generatedAt: NOW - 5, tasks: [] }));
  db.close();
  const store = new Store(dir);
  try {
    store.addRequest({
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
    store.fulfillRequest("old", 1, NOW);
    progress(store, { generatedAt: NOW - 5, done: ["a"], remaining: [] }, NOW + 1);
    const row = store.taste(ACCOUNT, NOW + 2).find((item) => item.category === "preset:mount");
    assert.equal(row?.finished, 1);
  } finally {
    store.close();
  }
});

test("taste nudges an idea kind before the per-rule cut", () => {
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

test("an achievement 80% done or more becomes an Almost there idea; earned or below 80% does not", () => {
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
