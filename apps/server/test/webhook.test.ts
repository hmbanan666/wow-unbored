import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { MAX_ATTEMPTS, RETRY_DELAYS, type FetchLike } from "../src/webhook.ts";

const root = path.join(import.meta.dirname, "..", "..", "..", "packages", "contracts", "fixtures");
const requests = JSON.parse(readFileSync(path.join(root, "requests.json"), "utf8")) as {
  cases: { name: string; body: Record<string, unknown> }[];
};

const companion = "companion-webhook-token";
const planner = "planner-webhook-token";
const hookUrl = "https://planner.example/hooks/secret-path?token=abc";

type Hit = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function build(options: { url?: string; respond?: (hit: Hit) => number | Error } = {}) {
  const hits: Hit[] = [];
  const lines: string[] = [];
  let clock = 1_800_000_000;
  const fetchImpl: FetchLike = async (url, init) => {
    const hit = {
      url,
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    };
    hits.push(hit);
    const outcome = options.respond ? options.respond(hit) : 204;
    if (outcome instanceof Error) throw outcome;
    return { ok: outcome >= 200 && outcome < 300, status: outcome };
  };
  const built = createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-webhook-")),
    webhook: { url: options.url ?? hookUrl, key: "hook-key", headerName: "" },
    webhookFetch: fetchImpl,
    webhookNow: () => clock,
    log: (line) => lines.push(line),
  });
  return {
    ...built,
    hits,
    lines,
    advance: (seconds: number) => {
      clock += seconds;
    },
    now: () => clock,
  };
}

function post(app: ReturnType<typeof build>["app"], body: unknown) {
  return app.request("/v1/requests", {
    method: "POST",
    headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

for (const { name, body } of requests.cases) {
  test(`webhook: a new ${name} request reaches the planner once and is logged`, async () => {
    const { app, store, hits, lines, close } = build();
    try {
      assert.equal((await post(app, body)).status, 201);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].body.requestId, body.id);
      assert.equal(hits[0].body.type, body.type);
      assert.equal(hits[0].headers.authorization, "Bearer hook-key");
      assert.ok(store.webhookDelivery(body.id as string)?.deliveredAt);
      assert.ok(
        lines.some((line) =>
          line.startsWith(`webhook req=${body.id} type=${body.type} attempt=1 ok`),
        ),
      );
      assert.equal((await post(app, body)).status, 200);
      assert.equal(hits.length, 1, "a repeated post of the same request is not sent again");
    } finally {
      close();
    }
  });
}

test("webhook: logs say on or off without the URL path or key, and health shows it", async () => {
  const on = build();
  try {
    assert.ok(on.lines.includes("webhook on: planner.example with key"));
    assert.deepEqual(await (await on.app.request("/health")).json(), { ok: true, webhook: "on" });
  } finally {
    on.close();
  }
  const off = build({ url: "" });
  try {
    assert.ok(off.lines[0].startsWith("webhook off: UNBORED_PLANNER_WEBHOOK_URL is not set"));
    assert.deepEqual(await (await off.app.request("/health")).json(), { ok: true, webhook: "off" });
    const question = requests.cases.find((entry) => entry.body.type === "question")!.body;
    assert.equal((await post(off.app, question)).status, 201);
    assert.equal(off.hits.length, 0);
    assert.ok(
      off.lines.some(
        (line) =>
          line ===
          `webhook req=${question.id} type=question skipped: UNBORED_PLANNER_WEBHOOK_URL is not set`,
      ),
    );
  } finally {
    off.close();
  }
});

test("webhook: a failing planner is retried with backoff, then given up", async () => {
  const app = build({
    respond: () => new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
  });
  try {
    const question = requests.cases.find((entry) => entry.body.type === "question")!.body;
    assert.equal((await post(app.app, { ...question, createdAt: app.now() })).status, 201);
    assert.equal(app.hits.length, 1);
    for (const delay of RETRY_DELAYS) {
      await app.webhook.tick();
      const before = app.hits.length;
      app.advance(delay - 1);
      await app.webhook.tick();
      assert.equal(app.hits.length, before, `waits ${delay}s`);
      app.advance(1);
      await app.webhook.tick();
      assert.equal(app.hits.length, before + 1);
    }
    assert.equal(app.hits.length, MAX_ATTEMPTS);
    app.advance(24 * 3600);
    await app.webhook.tick();
    assert.equal(app.hits.length, MAX_ATTEMPTS);
    const delivery = app.store.webhookDelivery(question.id as string)!;
    assert.equal(delivery.deliveredAt, null);
    assert.equal(delivery.lastError, "ECONNREFUSED");
    assert.ok(
      app.lines.some(
        (line) =>
          line.includes(`attempt=${MAX_ATTEMPTS} failed ECONNREFUSED`) &&
          line.includes("giving up"),
      ),
    );
    assert.ok(
      !app.lines.some(
        (line) =>
          line.includes("secret-path") || line.includes("hook-key") || line.includes("token=abc"),
      ),
    );
  } finally {
    app.close();
  }
});

test("webhook: a request stuck before a restart is sent by the loop; answered ones are not", async () => {
  let up = false;
  const app = build({ respond: () => (up ? 200 : 503) });
  try {
    const [first, second] = requests.cases.map((entry) => entry.body);
    assert.equal((await post(app.app, { ...first, createdAt: app.now() })).status, 201);
    assert.equal((await post(app.app, { ...second, createdAt: app.now() })).status, 201);
    assert.equal(app.hits.length, 2);
    app.store.fulfillRequest(second.id as string, 1, app.now());
    up = true;
    app.advance(30);
    await app.webhook.tick();
    assert.equal(app.hits.length, 3);
    assert.equal(app.hits[2].body.requestId, first.id);
    assert.ok(app.store.webhookDelivery(first.id as string)?.deliveredAt);
    assert.equal(app.store.webhookDelivery(second.id as string)?.deliveredAt, null);
  } finally {
    app.close();
  }
});

test("webhook: requests older than a day are not sent again", async () => {
  const app = build({ respond: () => 500 });
  try {
    const body = requests.cases[0].body;
    assert.equal(
      (await post(app.app, { ...body, createdAt: app.now() - 2 * 24 * 3600 })).status,
      201,
    );
    assert.equal(app.hits.length, 1);
    app.advance(3600);
    await app.webhook.tick();
    assert.equal(app.hits.length, 1);
  } finally {
    app.close();
  }
});
