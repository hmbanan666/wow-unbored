import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { packIds, type Plan } from "@unbored/contracts";

import type { Store } from "../src/store.ts";
import { addedIds, planTargets, winSummary, type WinEntry } from "../src/wins.ts";
import { ACCOUNT, makeStore, NOW, packCounts, snapshot } from "./helpers.ts";

const DAY = 86_400;

function plan(fields: Record<string, unknown> = {}): Plan {
  return {
    v: 1,
    kind: "plan",
    title: "Cage run",
    generatedAt: NOW,
    tasks: [{ id: "a", title: "A" }],
    ...fields,
  } as unknown as Plan;
}

test("a plan promises its rewards, step rewards, container contents and last-step complete", () => {
  const targets = planTargets(
    plan({
      rewards: ["{item:128025}", "{toy:900001}"],
      contains: { "{item:128025}": ["{mount:900002}", "{pet:900003}"] },
      tasks: [
        { id: "a", title: "A", rewards: ["{ach:900004}", "50 gold"] },
        { id: "b", title: "B", complete: { kind: "mount", mountIDs: [900005, 900006] } },
      ],
    }),
  );
  assert.deepEqual(
    targets.map((target) => target.token).sort(),
    [
      "{ach:900004}",
      "{mount:900002}",
      "{mount:900005}",
      "{mount:900006}",
      "{pet:900003}",
      "{toy:900001}",
    ],
    "the cage with contents is not a target itself; plain text is not one either",
  );
  assert.deepEqual(
    planTargets(
      plan({
        tasks: [{ id: "q", title: "Q", complete: { kind: "quest", questID: 900007 } }],
      }),
    ),
    [{ kind: "quest", id: 900007, token: "{quest:900007}" }],
  );
});

test("only a diff gives added ids: never the first upload or a body version change", () => {
  const base = { section: "mounts", scope: "account" as const, ownerId: "111111", at: NOW };
  assert.deepEqual(
    addedIds({
      ...base,
      kind: "diff",
      versionChanged: false,
      body: { ids: { ids: { added: [5, 7] } } },
    }),
    [5, 7],
  );
  assert.deepEqual(
    addedIds({
      ...base,
      kind: "diff",
      versionChanged: false,
      body: { ids: { items: { added: [[9, 2]] } } },
    }),
    [9],
  );
  assert.deepEqual(
    addedIds({ ...base, kind: "diff", versionChanged: false, body: { initial: true } }),
    [],
  );
  assert.deepEqual(
    addedIds({
      ...base,
      kind: "diff",
      versionChanged: true,
      body: { ids: { ids: { added: [5] } } },
    }),
    [],
  );
});

function ask(store: Store, id: string, body: Plan, at: number, kind = "rare") {
  store.addRequest({
    id,
    deviceId: "pc-1",
    character: "Mira",
    realm: "Realm",
    mode: "fun",
    budget: null,
    wish: null,
    topic: "suggestion",
    account: ACCOUNT,
    suggestionId: `${kind}:${id}`,
    suggestion: { id: `${kind}:${id}`, kind, title: "T", goal: "G", rewards: [] },
    nowSeconds: at,
  });
  const stored = store.putPlan(body, at);
  store.fulfillRequest(id, stored.id, at);
}

function upload(
  store: Store,
  sections: Parameters<typeof snapshot>[0],
  at: number,
  character = "Mira",
) {
  store.putSnapshot(snapshot(sections, { savedAt: at, character }), "pc-1", at);
}

test("a promised mount newly learned after the plan is one win, attributed to the plan", () => {
  const store = makeStore();
  try {
    store.registerDevice({
      id: "pc-1",
      name: "Desk PC",
      secretHash: "h1",
      nowSeconds: NOW,
      pendingCap: 10,
    });
    // Already owned before the first upload: the initial upload never counts.
    upload(store, { mounts: { at: NOW, body: { ids: packIds([900002]) } } }, NOW);
    ask(
      store,
      "r1",
      plan({ rewards: ["{mount:900002}", "{mount:900010}", "{ach:900011}"] }),
      NOW + 10,
    );
    upload(
      store,
      { mounts: { at: NOW + 100, body: { ids: packIds([900002, 900010]) } } },
      NOW + 100,
    );
    // Seen again in a later upload (relearned or re-read): still one win.
    upload(store, { mounts: { at: NOW + 200, body: { ids: packIds([900003]) } } }, NOW + 200);
    upload(
      store,
      { mounts: { at: NOW + 300, body: { ids: packIds([900003, 900010]) } } },
      NOW + 300,
    );
    upload(
      store,
      { achievementsMine: { at: NOW + 400, body: { ids: packIds([900011]) } } },
      NOW + 400,
    );
    upload(
      store,
      { achievementsMine: { at: NOW + 500, body: { ids: packIds([900011, 900012]) } } },
      NOW + 500,
    );

    const listed = store.listWins({ limit: 100 });
    assert.deepEqual(
      listed.wins.map((win) => win.token),
      ["{mount:900010}"],
      "the first achievementsMine upload is initial, so the achievement already earned is not a win",
    );
    const win = listed.wins[0]!;
    assert.equal(win.planTitle, "Cage run");
    assert.equal(win.category, "rare");
    assert.equal(win.requestId, "r1");
    assert.equal(win.character, "Mira");
    assert.equal(listed.totals.mount, 1);
    assert.equal(listed.days[0]!.day, new Date((NOW + 100) * 1000).toISOString().slice(0, 10));

    const history = store.history({ kinds: ["win"], limit: 10 });
    assert.equal(history.length, 1);
    assert.equal(history[0]!.ref, "mount:900010");
  } finally {
    store.close();
  }
});

test("a change older than the plan, or a plan older than 30 days, gives no win", () => {
  const store = makeStore();
  try {
    store.registerDevice({
      id: "pc-1",
      name: "Desk PC",
      secretHash: "h1",
      nowSeconds: NOW,
      pendingCap: 10,
    });
    upload(store, { toys: { at: NOW, body: { ids: packIds([1]) } } }, NOW);
    ask(store, "r1", plan({ rewards: ["{toy:900020}", "{toy:900021}"] }), NOW + 100);
    // Read before the plan was made, uploaded after.
    upload(store, { toys: { at: NOW + 50, body: { ids: packIds([1, 900020]) } } }, NOW + 200);
    upload(
      store,
      { toys: { at: NOW + 31 * DAY, body: { ids: packIds([1, 900020, 900021]) } } },
      NOW + 31 * DAY,
    );
    assert.equal(store.listWins({ limit: 100 }).wins.length, 0);
  } finally {
    store.close();
  }
});

test("an item moved from the bank to bags, or held by an alt, is not a win", () => {
  const store = makeStore();
  try {
    store.registerDevice({
      id: "pc-1",
      name: "Desk PC",
      secretHash: "h1",
      nowSeconds: NOW,
      pendingCap: 10,
    });
    upload(
      store,
      {
        bags: { body: { items: packCounts({ 1: 1 }) } },
        bank: { body: { items: packCounts({ 900030: 1 }) } },
      },
      NOW,
    );
    upload(store, { bags: { body: { items: packCounts({ 900031: 1 }) } } }, NOW, "Alt");
    ask(
      store,
      "r1",
      plan({ rewards: ["{item:900030}", "{item:900031}", "{item:900032}"] }),
      NOW + 10,
    );
    upload(
      store,
      {
        bags: {
          at: NOW + 100,
          body: { items: packCounts({ 1: 1, 900030: 1, 900031: 1, 900032: 1 }) },
        },
        bank: { at: NOW + 100, body: { items: packCounts({ 2: 1 }) } },
      },
      NOW + 100,
    );
    assert.deepEqual(
      store.listWins({ limit: 100 }).wins.map((win) => win.token),
      ["{item:900032}"],
    );
  } finally {
    store.close();
  }
});

test("list_wins totals every kind and groups by UTC day, newest first", () => {
  const entry = (at: number, kind: WinEntry["kind"], id: number): WinEntry => ({
    at,
    account: "111111",
    character: "Mira",
    realm: "Realm",
    kind,
    id,
    token: `{${kind}:${id}}`,
    planId: 1,
    requestId: "r1",
    planTitle: null,
    category: "rare",
  });
  const summary = winSummary([
    entry(NOW + DAY, "mount", 1),
    entry(NOW, "toy", 2),
    entry(NOW + 1, "toy", 3),
  ]);
  assert.deepEqual(summary.totals, { mount: 1, ach: 0, toy: 2, pet: 0, item: 0, quest: 0 });
  assert.equal(summary.days.length, 2);
  assert.equal(summary.days[0]!.wins[0]!.kind, "mount");
  assert.equal(summary.days[1]!.wins.length, 2);
});
