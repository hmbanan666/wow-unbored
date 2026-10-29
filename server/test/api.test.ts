import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createServer } from "node:http";

import { createApp } from "../src/app.ts";
import { lookupCriteria } from "../src/criteria.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";

const sample = {
  v: 1,
  kind: "plan",
  mode: "custom",
  budget: 60,
  note: "evening session",
  tasks: [
    {
      id: "mentor:fall",
      title: "Going Down?",
      estMinutes: 5,
      note: "просто упади",
      complete: { kind: "achievement", achievementID: 964 },
    },
    {
      id: "mentor:ashes",
      title: "Ashes of Al'ar",
      mapID: 109,
      x: 0.739,
      y: 0.637,
      estMinutes: 20,
      note: "Tempest Keep, Kael'thas.",
      complete: { kind: "mount", mountID: 183 },
    },
  ],
};

function build() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-server-"));
  return createApp({ companionToken: companion, plannerToken: planner, dataDir });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("health is open and tokens are required", async () => {
  const { app, close } = build();
  try {
    const health = await app.request("/health");
    assert.equal(health.status, 200);

    const missing = await app.request("/v1/plan");
    assert.equal(missing.status, 401);

    const wrong = await app.request("/v1/plan", {
      headers: { authorization: "Bearer nope" },
    });
    assert.equal(wrong.status, 401);

    const plannerOnCompanion = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${planner}` },
    });
    assert.equal(plannerOnCompanion.status, 401);

    const companionWrite = await app.request("/v1/plan", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${companion}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sample),
    });
    assert.equal(companionWrite.status, 401);

    const empty = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(empty.status, 404);
  } finally {
    close();
  }
});

test("put plan, companion get, addon decodes UNB1", async () => {
  const { app, close } = build();
  try {
    const put = await app.request("/v1/plan", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${planner}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sample),
    });
    assert.equal(put.status, 200);
    const stored = await json(put);
    assert.equal(typeof stored.plan, "string");
    assert.ok(String(stored.plan).startsWith("UNB1:"));

    const got = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(got.status, 200);
    const body = await json(got);
    assert.equal(body.plan, stored.plan);
    assert.deepEqual(Object.keys(body), ["plan"]);

    const root = path.resolve(import.meta.dirname, "../..");
    const decoded = execFileSync(
      "lua5.1",
      [path.join(import.meta.dirname, "decode.lua"), String(body.plan), root],
      { encoding: "utf8" },
    ).trim().split("\n");
    assert.equal(decoded[0], "mentor:fall");
    assert.equal(decoded[1], "Going Down?");
    assert.equal(decoded[2], "просто упади");
    assert.equal(decoded[3], "109");
    assert.equal(decoded[4], "60");
  } finally {
    close();
  }
});

test("progress roundtrip and history", async () => {
  const { app, close } = build();
  try {
    const post = {
      account: "111111#1",
      realm: "Area 52",
      character: "Hero",
      savedAt: 1761720000,
      progress: {
        v: 1,
        kind: "progress",
        mode: "custom",
        budget: 60,
        source: "import",
        currentId: "mentor:ashes",
        done: [{ id: "mentor:fall", at: 1761719000 }],
        skipped: [],
        remaining: ["mentor:ashes"],
      },
    };
    const denied = await app.request("/v1/progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${planner}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(post),
    });
    assert.equal(denied.status, 401);

    const sent = await app.request("/v1/progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${companion}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(post),
    });
    assert.equal(sent.status, 200);

    const latest = await json(
      await app.request("/v1/progress", {
        headers: { authorization: `Bearer ${planner}` },
      }),
    );
    const row = latest.latest as { character: string; progress: { currentId: string } };
    assert.equal(row.character, "Hero");
    assert.equal(row.progress.currentId, "mentor:ashes");
    assert.equal((latest.characters as unknown[]).length, 1);

    const history = await json(
      await app.request("/v1/progress/history", {
        headers: { authorization: `Bearer ${planner}` },
      }),
    );
    assert.equal((history.progress as unknown[]).length, 1);

    const companionRead = await app.request("/v1/progress", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(companionRead.status, 401);
  } finally {
    close();
  }
});

test("mcp lists the planner tools", async () => {
  const { app, close } = build();
  try {
    const headers = {
      authorization: `Bearer ${planner}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    const init = await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "unbored-test", version: "0" },
        },
      }),
    });
    assert.equal(init.status, 200);
    const initBody = await json(init);
    const result = initBody.result as { serverInfo?: { name?: string } };
    assert.equal(result.serverInfo?.name, "unbored");

    const listed = await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    assert.equal(listed.status, 200);
    const toolsBody = await json(listed);
    const tools = (toolsBody.result as { tools: { name: string; description: string }[] }).tools;
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "approve_device",
      "fail_request",
      "get_current_plan",
      "get_progress",
      "list_devices",
      "list_requests",
      "list_sessions",
      "put_plan",
      "resolve_criteria",
      "revoke_device",
    ]);
    const put = tools.find((tool) => tool.name === "put_plan");
    assert.ok(put?.description.includes("0 to 1"));
    assert.ok(put?.description.includes("achievementID"));

    const called = await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "put_plan", arguments: { plan: sample } },
      }),
    });
    assert.equal(called.status, 200);
    const callBody = await json(called);
    const payload = JSON.parse(
      ((callBody.result as { content: { text: string }[] }).content[0] as { text: string }).text,
    ) as { plan: string };
    assert.ok(payload.plan.startsWith("UNB1:"));
    const current = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal((await json(current)).plan, payload.plan);

    const blocked = await app.request("/mcp", {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${companion}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    });
    assert.equal(blocked.status, 401);
  } finally {
    close();
  }
});

test("device pairing can read a plan only after approval", async () => {
  const { app, close } = build();
  try {
    const put = await app.request("/v1/plan", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${planner}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sample),
    });
    assert.equal(put.status, 200);
    const storedPlan = String((await json(put)).plan);

    const secret = "device-secret-plain-value";
    const registered = await app.request("/v1/devices/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ deviceId: "desktop-abc12345", name: "Nick-PC", secret }),
    });
    assert.equal(registered.status, 201);
    const created = await json(registered);
    assert.equal(created.status, "pending");
    assert.equal(JSON.stringify(created).includes(secret), false);

    const early = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(early.status, 401);

    const write = await app.request("/v1/plan", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sample),
    });
    assert.equal(write.status, 401);

    const me = await json(
      await app.request("/v1/devices/me", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    assert.equal(me.status, "pending");

    const headers = {
      authorization: `Bearer ${planner}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "unbored-test", version: "0" },
        },
      }),
    });
    const approved = await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "approve_device", arguments: { deviceId: "desktop-abc12345" } },
      }),
    });
    assert.equal(approved.status, 200);

    const plan = await json(
      await app.request("/v1/plan", { headers: { authorization: `Bearer ${secret}` } }),
    );
    assert.equal(plan.plan, storedPlan);

    const posted = await app.request("/v1/progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account: "111111#1",
        realm: "Area 52",
        character: "Hero",
        savedAt: 10,
        progress: {
          v: 1,
          kind: "progress",
          mode: "custom",
          budget: 60,
          source: "companion",
          currentId: "mentor:fall",
          done: [],
          skipped: [],
          remaining: ["mentor:fall"],
        },
      }),
    });
    assert.equal(posted.status, 200);

    const revoked = await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "revoke_device", arguments: { deviceId: "desktop-abc12345" } },
      }),
    });
    assert.equal(revoked.status, 200);
    const after = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(after.status, 401);

    const legacy = await app.request("/v1/plan", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(legacy.status, 200);
  } finally {
    close();
  }
});

test("registration is capped and rate limited", async () => {
  const { app, close } = build();
  try {
    for (let i = 0; i < 20; i += 1) {
      const response = await app.request("/v1/devices/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `203.0.113.${i + 1}`,
        },
        body: JSON.stringify({
          deviceId: `device-${i}-abcdefgh`,
          name: `pc-${i}`,
          secretHash: `${i.toString(16).padStart(64, "a")}`,
        }),
      });
      assert.equal(response.status, 201, await response.text());
    }
    const capped = await app.request("/v1/devices/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.20",
      },
      body: JSON.stringify({
        deviceId: "device-extra-abcdefgh",
        name: "extra",
        secretHash: "b".repeat(64),
      }),
    });
    assert.equal(capped.status, 429);

    const again = await app.request("/v1/devices/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.1",
      },
      body: JSON.stringify({
        deviceId: "device-0-abcdefgh",
        name: "pc-0",
        secretHash: `${(0).toString(16).padStart(64, "a")}`,
      }),
    });
    assert.equal(again.status, 200);

    let limited = 0;
    for (let i = 0; i < 12; i += 1) {
      const response = await app.request("/v1/devices/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.8",
        },
        body: JSON.stringify({ deviceId: "nope", name: "x", secret: "short" }),
      });
      limited = response.status;
    }
    assert.equal(limited, 429);
  } finally {
    close();
  }
});

test("a device request is webhooked, fulfilled, and can fail", async () => {
  const hits: { authorization?: string; extra?: string; body: Record<string, unknown> }[] = [];
  const hook = createServer((req, response) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      hits.push({
        authorization: req.headers.authorization,
        extra: req.headers["x-unbored-key"] as string | undefined,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      response.writeHead(hits.length === 1 ? 500 : 204);
      response.end();
    });
  });
  await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
  const address = hook.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const { app, close } = createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-hook-")),
    webhook: {
      url: `http://127.0.0.1:${address.port}/hook`,
      key: "hook-secret",
      headerName: "X-Unbored-Key",
    },
  });
  try {
    const secret = "request-device-secret";
    const registered = await app.request("/v1/devices/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
      body: JSON.stringify({ deviceId: "req-device-1", name: "PC", secret }),
    });
    assert.equal(registered.status, 201);
    const headers = {
      authorization: `Bearer ${planner}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      }),
    });
    await app.request("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "approve_device", arguments: { deviceId: "req-device-1" } },
      }),
    });
    const posted = await app.request("/v1/requests", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "req-100",
        character: "Hero",
        realm: "Area 52",
        mode: "farm",
        budget: 60,
        wish: "mount",
      }),
    });
    assert.equal(posted.status, 201);
    assert.equal(hits.length >= 2, true);
    assert.equal(hits.at(-1)?.authorization, "Bearer hook-secret");
    assert.equal(hits.at(-1)?.extra, "hook-secret");
    assert.equal(hits.at(-1)?.body.requestId, "req-100");
    assert.equal(hits.at(-1)?.body.wish, "mount");

    const again = await app.request("/v1/requests", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "req-100",
        character: "Hero",
        realm: "Area 52",
        mode: "farm",
        budget: 60,
        wish: "mount",
      }),
    });
    assert.equal(again.status, 200);
    const afterDupe = hits.length;

    const waiting = await json(
      await app.request("/v1/requests/latest", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    assert.equal(waiting.status, "pending");
    assert.equal(waiting.plan, null);

    const fulfilled = await app.request("/v1/plan", {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...sample, requestId: "req-100" }),
    });
    assert.equal(fulfilled.status, 200);
    const ready = await json(
      await app.request("/v1/requests/latest", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    assert.equal(ready.status, "fulfilled");
    assert.equal(typeof ready.plan, "string");
    assert.equal(hits.length, afterDupe);

    const denied = await app.request("/v1/plan", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sample),
    });
    assert.equal(denied.status, 401);
  } finally {
    close();
    await new Promise<void>((resolve, reject) => hook.close((err) => (err ? reject(err) : resolve())));
  }
});

test("criteria tree ids map to criteriaID and index", () => {
  const tree = [
    "ID,Description_lang,Parent,Amount,Operator,CriteriaID,OrderIndex,Flags",
    "100,root,0,0,4,0,0,0",
    "101,first,100,1,0,5776,1,0",
    "102,second,100,1,0,5772,2,0",
  ].join("\n");
  const achievement = [
    "Description_lang,Title_lang,Reward_lang,ID,Instance_ID,Faction,Supercedes,Category,Minimum_criteria,Points,Flags,Ui_order,IconFileID,RewardItemID,Criteria_tree,Shares_criteria",
    '"d","Pumpkins","",291,0,0,0,0,0,10,0,1,0,0,100,0',
  ].join("\n");
  const hit = lookupCriteria(tree, achievement, 291, 102);
  assert.equal(hit.criteriaID, 5772);
  assert.equal(hit.criteriaIndex, 2);
  assert.throws(() => lookupCriteria(tree, achievement, 291, 100));
});

async function mcpCall(app: ReturnType<typeof createApp>["app"], name: string, args: Record<string, unknown>) {
  const headers = {
    authorization: `Bearer ${planner}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }),
  });
  const response = await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await json(response);
  const result = body.result as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, value: JSON.parse(result.content[0].text) as Record<string, unknown> };
}

const context = {
  mapID: 2248,
  zone: "Isle of Dorn",
  subzone: "Dornogal",
  x: 0.4812,
  y: 0.5521,
  level: 80,
  faction: "Horde",
  class: "Mage",
  classFile: "MAGE",
  spec: "Frost",
  specID: 64,
  ilvl: 612.43,
  gold: 12345,
  skyriding: true,
  canFly: true,
  inInstance: false,
  hearth: "Dornogal",
  trackedQuests: [{ questID: 81000, title: "A quest" }, { questID: "bad" }],
  plan: { title: "Evening", currentId: "a", step: 2, steps: 5, done: 1, skipped: 0, remaining: 4 },
  unknownField: "dropped",
};

test("a request keeps the player context for the webhook and list_requests", async () => {
  const hits: Record<string, unknown>[] = [];
  const hook = createServer((req, response) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      hits.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.writeHead(204);
      response.end();
    });
  });
  await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
  const address = hook.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const { app, close } = createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-ctx-")),
    webhook: { url: `http://127.0.0.1:${address.port}/hook`, key: "", headerName: "" },
  });
  try {
    const posted = await app.request("/v1/requests", {
      method: "POST",
      headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
      body: JSON.stringify({
        id: "req-ctx-1",
        character: "Hero",
        realm: "Area 52",
        mode: "roam",
        budget: 60,
        wish: "маунт, без рейдов, остаться в этой зоне, ".repeat(5).trim(),
        context,
      }),
    });
    assert.equal(posted.status, 201, await posted.clone().text());
    const saved = (await json(posted)).context as Record<string, unknown>;
    assert.equal(saved.mapID, 2248);
    assert.equal(saved.subzone, "Dornogal");
    assert.equal(saved.ilvl, 612.4);
    assert.equal(saved.hearth, "Dornogal");
    assert.equal("unknownField" in saved, false);
    assert.deepEqual(saved.trackedQuests, [{ questID: 81000, title: "A quest" }]);

    assert.equal(hits.length, 1);
    const hookContext = hits[0].context as Record<string, unknown>;
    assert.equal(hookContext.zone, "Isle of Dorn");
    assert.equal((hookContext.plan as Record<string, unknown>).step, 2);

    const listed = await mcpCall(app, "list_requests", {});
    const rows = listed.value.requests as { id: string; context: Record<string, unknown> }[];
    assert.equal(rows[0].id, "req-ctx-1");
    assert.equal(rows[0].context.x, 0.4812);

    const plain = await app.request("/v1/requests", {
      method: "POST",
      headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
      body: JSON.stringify({ id: "req-ctx-2", character: "Hero", realm: "", mode: "fun", budget: 30 }),
    });
    assert.equal(plain.status, 201);
    assert.equal((await json(plain)).context, null);

    const huge = await app.request("/v1/requests", {
      method: "POST",
      headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
      body: JSON.stringify({
        id: "req-ctx-3",
        character: "Hero",
        realm: "",
        mode: "fun",
        budget: 30,
        context: { zone: "x".repeat(9000) },
      }),
    });
    assert.equal(huge.status, 400);
  } finally {
    close();
    await new Promise<void>((resolve, reject) => hook.close((err) => (err ? reject(err) : resolve())));
  }
});

test("plans accept a waypoint route and reject bad points", async () => {
  const { app, close } = build();
  try {
    const route = {
      ...sample,
      tasks: [
        {
          id: "route:1",
          title: "Three treasures",
          estMinutes: 15,
          note: "Follow the arrow.",
          waypoints: [
            { mapID: 2248, x: 0.41, y: 0.52, label: "Cliff chest" },
            { mapID: 2248, x: 0.45, y: 0.6 },
            { mapID: 2248, x: 0.5, y: 0.61, label: "Cave" },
          ],
        },
      ],
    };
    const put = await app.request("/v1/plan", {
      method: "PUT",
      headers: { authorization: `Bearer ${planner}`, "content-type": "application/json" },
      body: JSON.stringify(route),
    });
    assert.equal(put.status, 200);
    const stored = await json(put);
    const task = (stored.stored as { tasks: { waypoints: unknown[] }[] }).tasks[0];
    assert.equal(task.waypoints.length, 3);
    const decoded = JSON.parse(Buffer.from(String(stored.plan).slice(5), "base64").toString("utf8"));
    assert.equal(decoded.tasks[0].waypoints[0].label, "Cliff chest");
    assert.equal("label" in decoded.tasks[0].waypoints[1], false);

    const viaMcp = await mcpCall(app, "put_plan", { plan: route });
    assert.equal(viaMcp.isError, false);

    for (const waypoints of [
      [{ mapID: 2248, x: 41, y: 52 }],
      [{ x: 0.1, y: 0.1 }],
      Array.from({ length: 11 }, () => ({ mapID: 1, x: 0.1, y: 0.1 })),
      [{ mapID: 1, x: 0.1, y: 0.1, label: "x".repeat(81) }],
    ]) {
      const bad = await app.request("/v1/plan", {
        method: "PUT",
        headers: { authorization: `Bearer ${planner}`, "content-type": "application/json" },
        body: JSON.stringify({ ...sample, tasks: [{ id: "a", title: "A", waypoints }] }),
      });
      assert.equal(bad.status, 400);
    }
  } finally {
    close();
  }
});

test("an older database gains the context column", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-migrate-"));
  const old = new DatabaseSync(path.join(dataDir, "unbored.sqlite"));
  old.exec(`CREATE TABLE requests (
    id TEXT PRIMARY KEY, device_id TEXT NOT NULL, character_name TEXT NOT NULL, realm TEXT NOT NULL,
    mode TEXT NOT NULL, budget INTEGER NOT NULL, wish TEXT, status TEXT NOT NULL, reason TEXT,
    plan_id INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  old.exec(`INSERT INTO requests VALUES ('req-old', 'legacy', 'Hero', '', 'farm', 60, NULL, 'pending', NULL, NULL, 1, 1)`);
  old.close();
  const { store, close } = createApp({ companionToken: companion, plannerToken: planner, dataDir });
  try {
    assert.equal(store.requestById("req-old")?.context, null);
    const saved = store.addRequest({
      id: "req-new",
      deviceId: "legacy",
      character: "Hero",
      realm: "",
      mode: "roam",
      budget: 30,
      wish: null,
      context: { mapID: 84 },
      nowSeconds: 2,
    });
    assert.equal(saved.request.context?.mapID, 84);
  } finally {
    close();
  }
});
