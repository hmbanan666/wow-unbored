import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../src/app.ts";

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
    assert.deepEqual(names, ["get_current_plan", "get_progress", "list_sessions", "put_plan"]);
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
