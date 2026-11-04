import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { packIds } from "@unbored/contracts";
import { createApp } from "../src/app.ts";
import { ContentStore } from "../src/content.ts";
import { coreResponse } from "./game-content-fixture.ts";
import { snapshot, NOW, ACCOUNT_KEY } from "./helpers.ts";
import { hasPostgres, postgresPerFile } from "./postgres-db.ts";

const pg = postgresPerFile();
const runnerToken = "path-runner-test-token-with-32-characters";
const who = { account: ACCOUNT_KEY, character: "Mira", realm: "Realm" };
const reference = { kind: "path", slug: "first-adventure", locale: "en", version: 1 };
const item = {
  source: { type: "quest", text: "A small adventure" },
  chance: false,
  note: "Finish the adventure.",
};
const document = {
  kind: "path",
  slug: reference.slug,
  locale: "en",
  tier: "basic",
  title: "First adventure",
  description: "A small adventure and its rewards.",
  items: [
    { ...item, kind: "level", name: "Level 80", level: 80 },
    { ...item, kind: "quest", id: 90001, name: "A small adventure" },
    { ...item, kind: "questLine", id: 10, name: "A new beginning" },
    { ...item, kind: "mount", id: 6, name: "Brown Horse", chance: true },
    { ...item, kind: "currency", id: 2000, name: "Test currency", amount: 50, required: false },
    { ...item, kind: "achievement", id: 964, name: "Going Down?" },
    { ...item, kind: "renown", id: 72, name: "Stormwind", level: 10 },
  ],
};
const plan = {
  title: "A small adventure",
  outcome: { kind: "achievement", achievementID: 964 },
  tasks: [{ id: "quest:90001", title: "Finish {quest:90001}" }],
};
async function setup(
  requestOverrides: Record<string, unknown> = {},
  pickedDocument: Omit<typeof document, "tier"> & { tier?: string } = document,
) {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".path-plan-"));
  const built = createApp({
    dataDir: dir,
    database: pg("postgres"),
    ingest: "inline",
    companionToken: "c",
    plannerToken: "p",
    plannerRoute: "runner",
    runnerToken,
    runnerNow: () => NOW,
    log: () => {},
  });
  await built.store.db.run("DELETE FROM content.paths");
  await built.store.game.importBuild("12.0.1.66337", coreResponse);
  const content = new ContentStore(built.store.db, built.store.game);
  await content.saveDraft(pickedDocument);
  await content.publish(pickedDocument.kind as "path" | "collection", pickedDocument.slug);
  await built.store.putSnapshot(
    snapshot({ char: { body: { level: 80, lang: "en" } } }),
    "device",
    NOW,
  );
  await built.store.activePaths.set({
    ...who,
    path: {
      kind: pickedDocument.kind as "path" | "collection",
      slug: pickedDocument.slug,
      locale: "en",
    },
  });
  const idea = (await built.store.suggestionsForDevice("device")).characters["Realm-Mira"][0];
  const post = (url: string, body?: unknown, token = runnerToken, method = "POST") =>
    built.app.request(url, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const added = await post(
    "/v1/requests",
    {
      ...who,
      id: "picked-path",
      type: "plan",
      mode: "roam",
      topic: "suggestion",
      createdAt: NOW,
      suggestionId: idea.id,
      suggestion: idea,
      ...requestOverrides,
    },
    "c",
  );
  assert.equal(added.status, 201, await added.clone().text());
  const claim = await post("/v1/runner/claim");
  assert.equal(claim.status, 200);
  const lease = await claim.json();
  const call = async (name: string, args = {}, token = lease.leaseToken) => {
    const response = await built.app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const result = (await response.json()).result;
    return { ...result, data: JSON.parse(result.content[0].text) };
  };
  return {
    ...built,
    content,
    post,
    call,
    lease,
    close() {
      built.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test.skipIf(!hasPostgres)(
  "runner receives unfinished required goals from the picked Path version",
  async () => {
    const app = await setup();
    try {
      await app.content.saveDraft({
        ...document,
        title: "A new edition",
        items: [document.items[0]],
      });
      await app.content.publish("path", reference.slug);
      await app.store.activePaths.set({ ...who, path: null });
      const request = await app.call("get_request");
      assert.equal(request.isError, false);
      assert.deepEqual(request.data.path.reference, reference);
      assert.equal(request.data.path.title, "First adventure");
      assert.deepEqual(
        request.data.path.nextGoals.map((goal: { position: number }) => goal.position),
        [1, 2, 3, 5, 6],
      );
      assert.deepEqual(
        request.data.path.nextGoals.map((goal: { outcome?: unknown }) => goal.outcome ?? null),
        [
          null,
          null,
          null,
          { kind: "achievement", achievementID: 964 },
          { kind: "renown", factionID: 72, level: 10 },
        ],
      );
      assert.equal(request.data.path.nextGoals[0].note, "Finish the adventure.");
    } finally {
      app.close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "runner corrects an unrelated outcome in the same lease and finishing its Plan moves Path progress",
  async () => {
    const app = await setup();
    try {
      const rejected = await app.call("put_plan", {
        requestId: "picked-path",
        plan: { ...plan, outcome: { kind: "currency", currencyID: 2000, amount: 50 } },
      });
      assert.equal(rejected.isError, true);
      assert.match(rejected.data.error, /unfinished required Path goal/);
      assert.match(rejected.data.error, /retry/i);
      assert.equal((await app.store.requestById("picked-path"))?.status, "pending");
      assert.equal(await app.store.latestPlan(), undefined);
      assert.equal((await app.call("get_request")).isError, false);
      const accepted = await app.call("put_plan", { requestId: "picked-path", plan });
      assert.equal(accepted.isError, false, JSON.stringify(accepted));
      assert.deepEqual(accepted.data.stored.outcome, { kind: "achievement", achievementID: 964 });
      assert.equal((await app.store.activePaths.get(who)).path?.done, 1);
      await app.store.putSnapshot(
        snapshot(
          { achievements: { at: NOW + 1, body: { ids: packIds([964]) } } },
          { savedAt: NOW + 1 },
        ),
        "device",
        NOW + 1,
      );
      assert.equal((await app.store.activePaths.get(who)).path?.done, 2);
      const next = await app.call("list_requests", { status: "fulfilled" }, "p");
      assert.equal(
        next.data.requests[0].path.nextGoals.some(
          (goal: { kind: string }) => goal.kind === "achievement",
        ),
        false,
      );
    } finally {
      app.close();
    }
  },
);

for (const submission of ["put_plan", "answer_request", "http"] as const) {
  test.skipIf(!hasPostgres)(
    `${submission} enforces exact Path targets and rechecks progress after the claim`,
    async () => {
      const app = await setup();
      try {
        const submit = async (outcome: unknown) => {
          const candidate = { ...plan, outcome };
          if (submission === "http") {
            const response = await app.post(
              "/v1/plan",
              { ...candidate, requestId: "picked-path" },
              "p",
              "PUT",
            );
            return { isError: response.status === 400, data: await response.json() };
          }
          return app.call(submission, {
            requestId: "picked-path",
            plan: candidate,
            ...(submission === "answer_request" ? { message: "A little adventure awaits." } : {}),
          });
        };
        for (const outcome of [
          { kind: "renown", factionID: 72, level: 9 },
          { kind: "renown", factionID: 72, level: 11 },
          { kind: "mount", id: 6 },
          { kind: "currency", currencyID: 2000, amount: 50 },
          { kind: "item", id: 19019 },
          { kind: "quest", id: 90001 },
          { kind: "questLine", id: 10 },
        ]) {
          const rejected = await submit(outcome);
          assert.equal(rejected.isError, true, JSON.stringify(rejected));
          assert.equal((await app.store.requestById("picked-path"))?.status, "pending");
          assert.equal(await app.store.latestPlan(), undefined);
        }
        await app.store.putSnapshot(
          snapshot(
            { reputation: { at: NOW + 1, body: { renown: [{ factionID: 72, level: 10 }] } } },
            { savedAt: NOW + 1 },
          ),
          "device",
          NOW + 1,
        );
        assert.equal((await submit({ kind: "renown", factionID: 72, level: 10 })).isError, true);
        assert.equal((await submit(plan.outcome)).isError, false);
      } finally {
        app.close();
      }
    },
  );
}

test.skipIf(!hasPostgres)("Path prompt gives one short outcome rule", async () => {
  const app = await setup();
  try {
    assert.ok(
      app.lease.prompt.text
        .split("\n")
        .includes("- Path pick: use one of `get_request.path.nextGoals[].outcome`."),
    );
  } finally {
    app.close();
  }
});

for (const invalid of ["missing", "draft", "character", "account"] as const) {
  test.skipIf(!hasPostgres)(
    `a ${invalid} Path context explains why no outcome can be accepted`,
    async () => {
      const overrides =
        invalid === "character"
          ? { character: "Alt" }
          : invalid === "account"
            ? { account: "222222" }
            : {
                suggestion: {
                  id: "picked-path-idea",
                  kind: "path",
                  title: "Continue your Path",
                  goal: "First adventure",
                  rewards: [],
                  path: { ...reference, version: 2 },
                },
              };
      const app = await setup(overrides);
      try {
        if (invalid === "draft")
          await app.content.saveDraft({ ...document, title: "Unpublished adventure" });
        const read = await app.call("get_request");
        assert.equal(read.isError, false);
        assert.deepEqual(read.data.path.nextGoals, []);
        assert.match(read.data.path.reason, /publication|Character/);
        const rejected = await app.call("put_plan", { requestId: "picked-path", plan });
        assert.equal(rejected.isError, true);
        assert.match(rejected.data.error, /retry/);
        assert.equal(await app.store.latestPlan(), undefined);
        assert.equal((await app.store.requestById("picked-path"))?.status, "pending");
      } finally {
        app.close();
      }
    },
  );
}

test.skipIf(!hasPostgres)(
  "only quests and chance goals left cannot turn into an unrelated Plan",
  async () => {
    const app = await setup();
    try {
      await app.store.putSnapshot(
        snapshot(
          {
            achievements: { at: NOW + 1, body: { ids: packIds([964]) } },
            reputation: { at: NOW + 1, body: { renown: [{ factionID: 72, level: 10 }] } },
          },
          { savedAt: NOW + 1 },
        ),
        "device",
        NOW + 1,
      );
      const read = await app.call("get_request");
      assert.deepEqual(
        read.data.path.nextGoals.map((goal: { kind: string }) => goal.kind),
        ["quest", "questLine", "mount"],
      );
      assert.ok(
        read.data.path.nextGoals.every((goal: { outcome?: unknown }) => goal.outcome === undefined),
      );
      const rejected = await app.call("put_plan", {
        requestId: "picked-path",
        plan: { ...plan, outcome: { kind: "level", level: 81 } },
      });
      assert.equal(rejected.isError, true);
      assert.match(rejected.data.error, /none is available, use fail_request/);
      const failed = await app.call("fail_request", {
        requestId: "picked-path",
        reason: "Let's try another adventure.",
      });
      assert.equal(failed.isError, false, JSON.stringify(failed));
    } finally {
      app.close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "a Collection Plan completes its required goal and records Path completion",
  async () => {
    const app = await setup(
      {},
      {
        ...document,
        kind: "collection",
        slug: "first-mounts",
        tier: undefined,
        items: [{ ...item, kind: "mount", id: 6, name: "Brown Horse", chance: false }],
      },
    );
    try {
      const read = await app.call("get_request");
      assert.deepEqual(read.data.path.nextGoals[0].outcome, { kind: "mount", id: 6 });
      const accepted = await app.call("put_plan", {
        requestId: "picked-path",
        plan: {
          ...plan,
          outcome: { kind: "mount", id: 6 },
          title: "Get a Brown Horse",
          tasks: [{ id: "buy", title: "Buy {mount:6}" }],
        },
      });
      assert.equal(accepted.isError, false, JSON.stringify(accepted));
      await app.store.putSnapshot(
        snapshot({ mounts: { at: NOW + 1, body: { ids: packIds([6]) } } }, { savedAt: NOW + 1 }),
        "device",
        NOW + 1,
      );
      const active = (await app.store.activePaths.get(who)).path!;
      assert.equal(active.done, 1);
      assert.equal(active.total, 1);
      assert.equal(active.completedAt, NOW + 1);
    } finally {
      app.close();
    }
  },
);
