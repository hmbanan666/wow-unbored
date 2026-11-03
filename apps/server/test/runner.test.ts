import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, vi } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { BACKENDS, postgresPerFile, type Backend } from "./postgres-db.ts";

const pg = postgresPerFile();
const runnerToken = "runner-token-for-tests-with-32-characters";
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/requests.json", import.meta.url),
    "utf8",
  ),
).cases[0].body;
function build(backend: Backend, fallback = false) {
  let now = Math.floor(Date.now() / 1000);
  const hits: unknown[] = [];
  const lines: string[] = [];
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-runner-"));
  cpSync(new URL("./fixtures/instances/", import.meta.url), path.join(dataDir, "wago"), {
    recursive: true,
  });
  const built = createApp({
    database: pg(backend),
    ingest: "inline",
    dataDir,
    companionToken: "companion",
    plannerToken: "planner",
    plannerRoute: "runner",
    runnerToken,
    runnerNow: () => now,
    webhookNow: () => now,
    webhook: { url: fallback ? "https://planner.example/hook" : "", key: "", headerName: "" },
    webhookFetch: async (_url, init) => {
      hits.push(JSON.parse(init.body));
      return { ok: true, status: 204 };
    },
    blizzard: null,
    log: (line) => lines.push(line),
  });
  const post = (url: string, body?: unknown, token = runnerToken) =>
    built.app.request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    ...built,
    hits,
    lines,
    post,
    now: () => now,
    advance: (seconds: number) => {
      now += seconds;
    },
    add: (id = "runner-first", extra = {}) =>
      post(
        "/v1/requests",
        { ...fixture, id, account: "runner-account", createdAt: now, ...extra },
        "companion",
      ),
    claim: () => post("/v1/runner/claim"),
  };
}

for (const backend of BACKENDS) {
  test(`empty runner claims stay out of request logs (${backend})`, async () => {
    const app = build(backend);
    try {
      app.lines.length = 0;
      for (const url of ["/v1/runner/claim", "/v1/runner/claim?wait=0"])
        assert.equal((await app.post(url)).status, 204);
      assert.deepEqual(app.lines, []);
    } finally {
      app.close();
    }
  });

  test(`runner claim errors still reach request logs (${backend})`, async () => {
    const app = build(backend);
    try {
      app.lines.length = 0;
      assert.equal((await app.post("/v1/runner/claim", undefined, "wrong")).status, 401);
      assert.equal((await app.post("/v1/runner/claim?wait=bad")).status, 400);
      assert.deepEqual(app.lines, [
        'POST /v1/runner/claim 401 reason="Unauthorized"',
        'POST /v1/runner/claim 400 reason="wait must be from 0 to 25 seconds."',
      ]);
    } finally {
      app.close();
    }
  });

  test(`runner claim server failures still reach request logs (${backend})`, async () => {
    const app = build(backend);
    const read = vi
      .spyOn(app.store.db, "get")
      .mockRejectedValueOnce(new Error("Database unavailable"));
    try {
      app.lines.length = 0;
      assert.equal((await app.claim()).status, 500);
      assert.deepEqual(app.lines, ["POST /v1/runner/claim 500"]);
    } finally {
      read.mockRestore();
      app.close();
    }
  });

  test(`other methods and routes still log empty responses (${backend})`, async () => {
    const app = build(backend);
    app.app.get("/v1/runner/claim", (c) => c.body(null, 204));
    try {
      app.lines.length = 0;
      assert.equal(
        (
          await app.app.request("/v1/runner/claim", {
            headers: { authorization: `Bearer ${runnerToken}` },
          })
        ).status,
        204,
      );
      assert.equal((await app.app.request("/mcp", { method: "OPTIONS" })).status, 204);
      assert.deepEqual(app.lines, ["GET /v1/runner/claim 204", "OPTIONS /mcp 204"]);
    } finally {
      app.close();
    }
  });

  test(`runner claims the oldest pending Request once with a prompt (${backend})`, async () => {
    const app = build(backend);
    try {
      assert.equal((await app.add()).status, 201);
      const response = await app.claim();
      assert.equal(response.status, 200);
      assert.ok(app.lines.includes("POST /v1/requests 201"));
      assert.ok(app.lines.includes("POST /v1/runner/claim 200"));
      const lease = await response.json();
      assert.equal(lease.request.requestId, "runner-first");
      assert.equal(lease.attempt, 1);
      assert.equal(lease.expiresAt, app.now() + 180);
      assert.match(lease.leaseToken, /^[A-Za-z0-9_-]{43}$/);
      assert.match(lease.prompt.version, /^[a-f0-9]{12}$/);
      assert.match(lease.prompt.text, /^# Unbored planner\n/);
      assert.equal(lease.mcpPath, "/mcp");
      assert.equal((await app.claim()).status, 204);
      assert.equal(app.hits.length, 0);
    } finally {
      app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`runner heartbeats, reclaims expired leases and caps attempts (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      const first = await (await app.claim()).json();
      app.advance(100);
      const heartbeat = await app.post(`/v1/runner/leases/${first.leaseId}/heartbeat`);
      assert.equal(heartbeat.status, 200);
      assert.equal((await heartbeat.json()).expiresAt, app.now() + 180);
      app.advance(181);
      const second = await (await app.claim()).json();
      assert.equal(second.attempt, 2);
      assert.notEqual(second.leaseToken, first.leaseToken);
      assert.equal((await app.post(`/v1/runner/leases/${first.leaseId}/heartbeat`)).status, 409);
      for (let i = 0; i < 8; i++) {
        app.advance(100);
        assert.equal((await app.post(`/v1/runner/leases/${second.leaseId}/heartbeat`)).status, 200);
      }
      app.advance(100);
      assert.equal((await app.post(`/v1/runner/leases/${second.leaseId}/heartbeat`)).status, 409);
    } finally {
      app.close();
    }
  });
  for (const fallback of [false, true]) {
    test(`runner retries unanswered attempts then ${fallback ? "hands off" : "fails"} (${backend})`, async () => {
      const app = build(backend, fallback);
      try {
        await app.add();
        for (const attempt of [1, 2, 3]) {
          const lease = await (await app.claim()).json();
          assert.equal(lease.attempt, attempt);
          assert.equal(
            (await app.post(`/v1/runner/leases/${lease.leaseId}/finish`, { ok: true })).status,
            200,
          );
          assert.equal((await app.claim()).status, 204);
          if (attempt < 3) {
            app.advance(attempt === 1 ? 14 : 59);
            assert.equal((await app.claim()).status, 204);
            app.advance(1);
          }
        }
        assert.equal(
          (await app.store.runnerStatus("runner-first"))?.state,
          fallback ? "handed_off" : "failed",
        );
        if (fallback) {
          await app.webhook.tick();
          await app.webhook.tick();
          assert.equal(app.hits.length, 1);
        } else {
          const request = await app.store.requestById("runner-first");
          assert.equal(request?.status, "failed");
          assert.equal(request?.reasonCode, "planner_failed");
        }
      } finally {
        app.close();
      }
    });
  }
}

async function mcp(app: ReturnType<typeof build>, token: string, method: string, params: unknown) {
  const response = await app.app.request("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: response.status, body: await response.json() };
}
const plan = {
  v: 1,
  kind: "plan",
  mode: "custom",
  title: "A little adventure",
  tasks: [{ id: "step-one", title: "Explore the shore", estMinutes: 5 }],
};
for (const backend of BACKENDS) {
  test(`a slow scoped read lets heartbeats keep the lease alive (${backend})`, async () => {
    const app = build(backend);
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Russian CSVs are not cached by build(): pause their download at the
    // network boundary, while exercising the real MCP read and lease wrapper.
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      markStarted();
      await proceed;
      const table = new URL(String(input)).pathname.split("/")[2];
      return new Response(
        readFileSync(new URL(`./fixtures/instances/${table}.csv`, import.meta.url)),
      );
    });
    let read: ReturnType<typeof mcp> | undefined;
    let heartbeat: Promise<Response> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await app.add();
      const lease = await (await app.claim()).json();
      read = mcp(app, lease.leaseToken, "tools/call", {
        name: "get_instance_guide",
        arguments: { achievementID: 10149, lang: "ru" },
      });
      await started;
      app.advance(100);
      heartbeat = Promise.resolve(app.post(`/v1/runner/leases/${lease.leaseId}/heartbeat`));
      const response = await Promise.race([
        heartbeat,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("slow read blocked the heartbeat")), 1000);
        }),
      ]);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).expiresAt, app.now() + 180);
      app.advance(100); // Past the original lease, inside the renewed lease.
      release();
      const result = await read;
      assert.equal(result.body.result.isError, false);
      assert.equal(JSON.parse(result.body.result.content[0].text).instance.instanceID, 669);
      assert.equal((await app.post(`/v1/runner/leases/${lease.leaseId}/heartbeat`)).status, 200);
      const answer = await mcp(app, lease.leaseToken, "tools/call", {
        name: "put_plan",
        arguments: { requestId: "runner-first", plan },
      });
      assert.equal(answer.body.result.isError, false);
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "done");
    } finally {
      clearTimeout(timer);
      release();
      await read;
      await heartbeat;
      fetch.mockRestore();
      app.close();
    }
  });
}
for (const backend of BACKENDS) {
  test(`lease MCP limits reads and answers to one Request and Account (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      app.advance(1);
      await app.add("another-request", {
        account: "another-account",
        character: "SomeoneElse",
        realm: "Elsewhere",
      });
      const lease = await (await app.claim()).json();
      const call = (name: string, args = {}) =>
        mcp(app, lease.leaseToken, "tools/call", { name, arguments: args });
      const listed = await mcp(app, lease.leaseToken, "tools/list", {});
      assert.equal(listed.status, 200);
      const names = listed.body.result.tools.map((tool: { name: string }) => tool.name);
      assert.ok(names.includes("get_request"));
      assert.ok(names.includes("get_instance_guide"));
      const guideReply = await call("get_instance_guide", { achievementID: 10149 });
      assert.equal(guideReply.body.result.isError, false);
      const guide = JSON.parse(guideReply.body.result.content[0].text);
      assert.equal(guide.instance.instanceID, 669);
      assert.deepEqual(
        guide.bosses.map((boss: { encounterID: number }) => boss.encounterID),
        [1426, 1425, 1372],
      );
      const ownerGuide = await mcp(app, "planner", "tools/call", {
        name: "get_instance_guide",
        arguments: { instanceID: 669 },
      });
      assert.equal(ownerGuide.body.result.isError, false);
      assert.equal((await call("get_instance_guide")).body.result.isError, true);
      for (const name of [
        "list_requests",
        "list_sessions",
        "list_devices",
        "approve_device",
        "revoke_device",
        "delete_account_data",
        "list_errors",
        "list_failed_uploads",
      ])
        assert.ok(!names.includes(name), name);
      const request = await call("get_request");
      assert.equal(JSON.parse(request.body.result.content[0].text).id, "runner-first");
      for (const [name, args] of [
        ["get_player_profile", { account: "another-account" }],
        ["get_player_history", { character: "SomeoneElse", realm: "Elsewhere" }],
        ["put_plan", { requestId: "another-request", plan }],
        ["put_plan", { plan }],
      ] as const)
        assert.equal((await call(name, args)).body.result.isError, true, name);
      const answered = await call("put_plan", { requestId: "runner-first", plan });
      assert.equal(answered.body.result.isError, false, JSON.stringify(answered.body));
      assert.equal((await app.store.requestById("runner-first"))?.status, "fulfilled");
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "done");
      assert.equal((await call("get_request")).status, 401);
      assert.equal((await app.store.requestById("another-request"))?.status, "pending");
    } finally {
      app.close();
    }
  });
}

for (const backend of BACKENDS) {
  test(`runner long poll wakes on insertion and concurrent claims are distinct (${backend})`, async () => {
    const app = build(backend);
    try {
      const waiting = app.post("/v1/runner/claim?wait=2");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.add();
      assert.equal((await waiting).status, 200);
      app.advance(1);
      await app.add("second");
      app.advance(1);
      await app.add("third");
      const results = await Promise.all([app.claim(), app.claim(), app.claim()]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 204]);
      const leases = await Promise.all(
        results.filter((r) => r.status === 200).map((r) => r.json()),
      );
      assert.deepEqual(leases.map((l) => l.request.requestId).sort(), ["second", "third"]);
    } finally {
      app.close();
    }
  });

  test(`runner only hands unclaimed jobs to the webhook after the fallback interval (${backend})`, async () => {
    const app = build(backend, true);
    try {
      await app.add();
      app.advance(89);
      await app.runner!.tick();
      await app.webhook.tick();
      assert.equal(app.hits.length, 0);
      app.advance(1);
      await app.runner!.tick();
      await app.webhook.tick();
      await app.webhook.tick();
      assert.equal(app.hits.length, 1);
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "handed_off");
      assert.equal((await app.claim()).status, 204);
    } finally {
      app.close();
    }
  });

  test(`runner hands a retry nobody claims to the webhook (${backend})`, async () => {
    const app = build(backend, true);
    try {
      await app.add();
      const lease = await (await app.claim()).json();
      await app.post(`/v1/runner/leases/${lease.leaseId}/finish`, { ok: false, error: "boom" });
      app.advance(15 + 89);
      await app.runner!.tick();
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "queued");
      app.advance(1);
      await app.runner!.tick();
      await app.webhook.tick();
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "handed_off");
      assert.equal(app.hits.length, 1);
      assert.ok(app.lines.some((line) => line.includes("handed to webhook (runner idle)")));
    } finally {
      app.close();
    }
  });

  test(`runner hands a dead lease nobody reclaims to the webhook (${backend})`, async () => {
    const app = build(backend, true);
    try {
      await app.add();
      await app.claim();
      app.advance(180 + 89);
      await app.runner!.tick();
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "leased");
      app.advance(1);
      await app.runner!.tick();
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "handed_off");
    } finally {
      app.close();
    }
  });

  test(`expired final leases fail without another runner and use the Request language (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add("runner-first", { lang: "ru" });
      for (let attempt = 1; attempt <= 3; attempt++) {
        const lease = await (await app.claim()).json();
        assert.equal(lease.attempt, attempt);
        app.advance(181);
        assert.equal((await mcp(app, lease.leaseToken, "tools/list", {})).status, 401);
      }
      await app.runner!.tick();
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "failed");
      const request = await app.store.requestById("runner-first");
      assert.equal(request?.reasonCode, "planner_failed");
      assert.match(request!.reason!, /план/);
      assert.ok(app.lines.some((line) => line.includes("failed lease expired")));
    } finally {
      app.close();
    }
  });

  test(`Forget erases jobs and Account migration keeps leases attached (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      const lease = await (await app.claim()).json();
      const hash = "a".repeat(64);
      await app.store.bindAccount(hash, "runner-account");
      const reply = await mcp(app, lease.leaseToken, "tools/call", {
        name: "get_request",
        arguments: {},
      });
      assert.equal(JSON.parse(reply.body.result.content[0].text).account, hash);
      await app.store.forgetDevice("legacy");
      assert.equal(await app.store.runnerStatus("runner-first"), null);
      assert.equal((await mcp(app, lease.leaseToken, "tools/list", {})).status, 401);
    } finally {
      app.close();
    }
  });

  test(`Request expiry ends live jobs (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      const lease = await (await app.claim()).json();
      app.advance(3600);
      await app.store.expireRequests(app.now());
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "failed");
      assert.equal((await mcp(app, lease.leaseToken, "tools/list", {})).status, 401);
    } finally {
      app.close();
    }
  });

  test(`scoped plan warnings allow correction before finishing the lease (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      const lease = await (await app.claim()).json();
      const call = (plan: unknown) =>
        mcp(app, lease.leaseToken, "tools/call", {
          name: "put_plan",
          arguments: { requestId: "runner-first", plan },
        });
      const warning = await call({ ...plan, title: undefined });
      const unstored = JSON.parse(warning.body.result.content[0].text);
      assert.ok(unstored.warnings.length > 0);
      assert.equal(unstored.stored, false);
      assert.equal(unstored.plan, undefined);
      assert.equal((await app.store.requestById("runner-first"))?.status, "pending");
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "leased");
      assert.equal(await app.store.latestPlanForAccount("runner-account"), undefined);
      assert.equal((await call(plan)).body.result.isError, false);
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "done");
    } finally {
      app.close();
    }
  });

  test(`runner auth, input validation and finish errors stay bounded (${backend})`, async () => {
    const app = build(backend);
    try {
      for (const token of ["planner", "companion", "wrong"])
        assert.equal((await app.post("/v1/runner/claim", undefined, token)).status, 401);
      for (const wait of ["-1", "26", "bad"])
        assert.equal((await app.post(`/v1/runner/claim?wait=${wait}`)).status, 400);
      assert.equal((await mcp(app, runnerToken, "tools/list", {})).status, 401);
      await app.add();
      const lease = await (await app.claim()).json();
      assert.equal((await app.post(`/v1/runner/leases/${lease.leaseId}/finish`, {})).status, 400);
      await app.post(`/v1/runner/leases/${lease.leaseId}/finish`, {
        ok: false,
        error: "private ".repeat(40),
      });
      assert.equal((await app.store.runnerStatus("runner-first"))?.lastError?.length, 200);
      assert.ok(!app.lines.join("\n").includes("private"));
      assert.ok(!app.lines.join("\n").includes(lease.leaseToken));
      assert.equal((await mcp(app, lease.leaseToken, "tools/list", {})).status, 401);
    } finally {
      app.close();
    }
  });
}

for (const backend of BACKENDS) {
  for (const tool of ["answer_request", "fail_request"]) {
    test(`${tool} closes only its leased Request and reports runner status (${backend})`, async () => {
      const app = build(backend);
      try {
        await app.add();
        const lease = await (await app.claim()).json();
        const args =
          tool === "answer_request"
            ? { message: "A little adventure awaits." }
            : { reason: "Let's try another idea." };
        const answer = await mcp(app, lease.leaseToken, "tools/call", {
          name: tool,
          arguments: { requestId: "runner-first", ...args },
        });
        assert.equal(answer.body.result.isError, false);
        assert.equal((await app.store.runnerStatus("runner-first"))?.state, "done");
        assert.equal((await app.post(`/v1/runner/leases/${lease.leaseId}/heartbeat`)).status, 409);
        assert.equal(
          (await app.post(`/v1/runner/leases/${lease.leaseId}/finish`, { ok: true })).status,
          200,
        );
        assert.equal((await mcp(app, lease.leaseToken, "tools/list", {})).status, 401);
        const listing = await mcp(app, "planner", "tools/call", {
          name: "list_requests",
          arguments: { status: tool === "answer_request" ? "fulfilled" : "failed" },
        });
        const request = JSON.parse(listing.body.result.content[0].text).requests[0];
        assert.deepEqual(request.runner, {
          state: "done",
          attempts: 1,
          lastError: null,
          claimedAt: app.now(),
          finishedAt: app.now(),
        });
      } finally {
        app.close();
      }
    });
  }

  test(`scoped reads refuse other Accounts and Characters across the tool set (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      const lease = await (await app.claim()).json();
      const call = (name: string, args: unknown) =>
        mcp(app, lease.leaseToken, "tools/call", { name, arguments: args });
      for (const name of [
        "get_player_profile",
        "get_player_history",
        "get_account_overview",
        "get_ready_now",
        "get_suggestions",
        "get_game_data",
        "get_data_changes",
        "data_catalog",
        "list_wins",
        "get_progress",
        "get_current_plan",
        "check_ids",
      ]) {
        const result = await call(name, { account: "someone-else", kind: "quest", ids: [1] });
        assert.equal(result.body.result.isError, true, name);
      }
      for (const name of [
        "get_player_profile",
        "get_player_history",
        "get_ready_now",
        "get_suggestions",
        "get_game_data",
        "get_data_changes",
        "list_wins",
        "get_progress",
        "check_ids",
      ]) {
        const result = await call(name, { character: "SomeoneElse", kind: "quest", ids: [1] });
        assert.equal(result.body.result.isError, true, name);
      }
      const advice = {
        character: fixture.character,
        realm: fixture.realm,
        items: [{ itemID: 6948, action: "keep", line: "Keep it for the journey." }],
      };
      assert.equal(
        (await call("put_item_advice", { ...advice, account: "someone-else" })).body.result.isError,
        true,
      );
      assert.equal(
        (await call("put_item_advice", { ...advice, requestId: "someone-else" })).body.result
          .isError,
        true,
      );
      assert.equal((await call("put_item_advice", advice)).body.result.isError, false);
      assert.equal((await app.store.runnerStatus("runner-first"))?.state, "leased");
    } finally {
      app.close();
    }
  });

  test(`runner takes the oldest pending Request and keeps later jobs queued (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add("already-answered");
      app.advance(1);
      await app.add("oldest");
      app.advance(1);
      await app.add("newest");
      await app.store.failRequest("already-answered", "Try another idea.", app.now());
      const lease = await (await app.claim()).json();
      assert.equal(lease.request.requestId, "oldest");
      assert.equal((await app.store.runnerStatus("newest"))?.state, "queued");
    } finally {
      app.close();
    }
  });
}

test("runner endpoints are hidden on the webhook route or without a configured token", async () => {
  for (const config of [
    { plannerRoute: "webhook" as const, runnerToken },
    { plannerRoute: "runner" as const },
  ]) {
    const app = createApp({
      dataDir: mkdtempSync(path.join(tmpdir(), "unbored-runner-off-")),
      companionToken: "companion",
      plannerToken: "planner",
      webhook: { url: "", key: "", headerName: "" },
      log: () => {},
      blizzard: null,
      ...config,
    });
    try {
      for (const path of ["claim", "leases/missing/heartbeat", "leases/missing/finish"])
        assert.equal(
          (
            await app.app.request(`/v1/runner/${path}`, {
              method: "POST",
              headers: { authorization: `Bearer ${runnerToken}` },
            })
          ).status,
          404,
        );
      assert.equal((await app.app.request("/health")).status, 200);
    } finally {
      app.close();
    }
  }
});

for (const backend of BACKENDS) {
  test(`a job insertion failure rolls the new Request back (${backend})`, async () => {
    const app = build(backend);
    try {
      if (app.store.db.pg) {
        await app.store.db.run(
          `CREATE FUNCTION refuse_runner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'runner refused'; END $$`,
        );
        await app.store.db.run(
          `CREATE TRIGGER refuse_runner BEFORE INSERT ON runner_jobs FOR EACH ROW EXECUTE FUNCTION refuse_runner()`,
        );
      } else {
        await app.store.db.run(
          `CREATE TRIGGER refuse_runner BEFORE INSERT ON runner_jobs BEGIN SELECT RAISE(ABORT, 'runner refused'); END`,
        );
      }
      await assert.rejects(
        app.store.addRequest({
          id: "atomic-request",
          deviceId: "legacy",
          character: fixture.character,
          realm: fixture.realm,
          mode: "fun",
          budget: null,
          wish: null,
          account: "runner-account",
          nowSeconds: app.now(),
        }),
        /runner refused/,
      );
      assert.equal(await app.store.requestById("atomic-request"), undefined);
      assert.equal(await app.store.runnerStatus("atomic-request"), null);
    } finally {
      if (app.store.db.pg) {
        await app.store.db.run(`DROP TRIGGER IF EXISTS refuse_runner ON runner_jobs`);
        await app.store.db.run(`DROP FUNCTION IF EXISTS refuse_runner()`);
      }
      app.close();
    }
  });

  test(`expiry cannot replace an answer that wins the Request lock (${backend})`, async () => {
    const app = build(backend);
    try {
      await app.add();
      let locked!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      let release!: () => void;
      const proceed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const answer = app.store.tx(async () => {
        await app.store.db.get(
          `SELECT id FROM requests WHERE id = ? ${app.store.db.pg ? "FOR UPDATE" : ""}`,
          "runner-first",
        );
        locked();
        await proceed;
        const stored = await app.store.putPlan(plan, app.now(), {}, "runner-first");
        await app.store.fulfillRequest("runner-first", stored.id, app.now());
      });
      await ready;
      const expiry = app.store.expireRequests(app.now() + 3600);
      await new Promise((resolve) => setTimeout(resolve, 20));
      release();
      await answer;
      assert.deepEqual(await expiry, []);
      assert.equal((await app.store.requestById("runner-first"))?.status, "fulfilled");
    } finally {
      app.close();
    }
  });
}
