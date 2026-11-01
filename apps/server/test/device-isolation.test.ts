import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { sqlitePath } from "../src/config.ts";
import { Store } from "../src/store.ts";
import type { GameDataFetch } from "../src/blizzard.ts";
import { database, onPostgres, storage } from "./backend.ts";

const planner = "planner-test-token";
const secrets = ["first-device-secret", "second-device-secret"];

async function setup(blizzardFetch?: GameDataFetch) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-isolation-"));
  const built = createApp({
    ...storage(),
    companionToken: "companion-test-token",
    plannerToken: planner,
    dataDir,
    log: () => {},
    webhook: { url: "", key: "", headerName: "X-Unbored-Key" },
    blizzard: blizzardFetch ? { clientId: "test", clientSecret: "test", region: "eu" } : null,
    blizzardFetch,
  });
  const call = (url: string, secret: string, body?: unknown, method = "POST") =>
    built.app.request(url, {
      method: body === undefined ? "GET" : method,
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  for (const [i, secret] of secrets.entries()) {
    const deviceId = `audit-device-${i}`;
    assert.equal((await call("/v1/devices/register", secret, { deviceId, secret })).status, 201);
    await built.store.setDeviceStatus(deviceId, "approved");
  }
  return {
    ...built,
    dataDir,
    call,
    close: () => {
      built.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

const request = { id: "audit-request", character: "Mira", realm: "Realm", mode: "farm" };
const plan = { v: 1, kind: "plan", mode: "farm", tasks: [{ id: "one", title: "One step" }] };

for (const endpoint of ["http", "put_plan", "answer_request"]) {
  test(`${endpoint} cannot publish a Plan after Forget erases its Request during validation`, async () => {
    let duringValidation: () => Promise<void>;
    let checked = false;
    const built = await setup(async (url) => {
      if (url.includes("/oauth/token"))
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "test", expires_in: 3600 }),
        };
      checked = true;
      await duringValidation();
      return { ok: true, status: 200, json: async () => ({ id: 6948 }) };
    });
    duringValidation = async () => {
      assert.equal(
        (await built.call("/v1/devices/me/forget", secrets[0], { confirm: true })).status,
        200,
      );
    };
    try {
      assert.equal((await built.call("/v1/requests", secrets[0], request)).status, 201);
      const linked = { ...plan, tasks: [{ id: "one", title: "Get {item:6948}" }] };
      if (endpoint === "http") {
        const result = await built.call(
          "/v1/plan",
          planner,
          { ...linked, requestId: request.id },
          "PUT",
        );
        assert.equal(result.status, 400);
      } else {
        const response = await built.app.request("/mcp", {
          method: "POST",
          headers: {
            authorization: `Bearer ${planner}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: endpoint,
              arguments: {
                requestId: request.id,
                plan: linked,
                ...(endpoint === "answer_request" ? { message: "Here is your plan." } : {}),
              },
            },
          }),
        });
        assert.equal((await response.json()).result.isError, true);
      }
      assert.equal(checked, true, "the test reaches the asynchronous lookup");
      assert.equal((await built.store.listPlans(10)).length, 0);
      assert.equal((await built.call("/v1/plan", secrets[1])).status, 404);
    } finally {
      built.close();
    }
  });
}

test("Request retries are idempotent only for the Device that created them", async () => {
  const built = await setup();
  try {
    assert.equal((await built.call("/v1/requests", secrets[0], request)).status, 201);
    const retry = await built.call("/v1/requests", secrets[0], request);
    assert.equal(retry.status, 200);
    const collision = await built.call("/v1/requests", secrets[1], request);
    assert.equal(collision.status, 400);
    assert.deepEqual(await collision.json(), { error: "Request id is already in use." });
    assert.equal((await built.store.requestById(request.id))?.deviceId, "audit-device-0");
    assert.equal((await built.call(`/v1/requests/${request.id}`, secrets[1])).status, 404);
  } finally {
    built.close();
  }
});

test("the latest Plan endpoint excludes other Devices' Request Plans", async () => {
  const built = await setup();
  try {
    assert.equal((await built.call("/v1/requests", secrets[0], request)).status, 201);
    const put = await built.call("/v1/plan", planner, { ...plan, requestId: request.id }, "PUT");
    assert.equal(put.status, 200);
    const privatePlan = await put.json();
    assert.equal((await built.call("/v1/plan", secrets[1])).status, 404);
    assert.deepEqual((await (await built.call("/v1/plan", secrets[0])).json()).id, privatePlan.id);

    const direct = await built.call("/v1/plan", planner, plan, "PUT");
    assert.equal(direct.status, 200);
    const directPlan = await direct.json();
    assert.equal((await (await built.call("/v1/plan", secrets[1])).json()).id, directPlan.id);

    // A newer private Plan must not hide the explicit direct Plan from another Device.
    const next = await built.call("/v1/plan", planner, { ...plan, requestId: request.id }, "PUT");
    assert.equal(next.status, 200);
    assert.equal((await (await built.call("/v1/plan", secrets[1])).json()).id, directPlan.id);

    const forgotten = await built.call("/v1/devices/me/forget", secrets[0], { confirm: true });
    assert.equal(forgotten.status, 200);
    assert.equal(
      await built.store.planById(privatePlan.id),
      undefined,
      "replacement history is erased too",
    );
    assert.equal(await built.store.planById((await next.json()).id), undefined);
    assert.equal((await (await built.call("/v1/plan", secrets[1])).json()).id, directPlan.id);
  } finally {
    built.close();
  }
});

// SQLite file migrations; Postgres starts from migrations/0001.
test.skipIf(onPostgres)(
  "existing Request Plans retain their ownership across migration and restart",
  async () => {
    const built = await setup();
    try {
      assert.equal((await built.call("/v1/requests", secrets[0], request)).status, 201);
      for (let i = 0; i < 2; i++) {
        assert.equal(
          (await built.call("/v1/plan", planner, { ...plan, requestId: request.id }, "PUT")).status,
          200,
        );
      }
      const db = new DatabaseSync(sqlitePath(built.dataDir));
      db.exec("DROP INDEX plans_request; ALTER TABLE plans DROP COLUMN request_id;");
      db.close();
      for (let i = 0; i < 2; i++) {
        const store = new Store(built.dataDir, { postgres: database() });
        try {
          assert.equal(await store.latestPlanForDevice("audit-device-1"), undefined);
          assert.ok(await store.latestPlanForDevice("audit-device-0"));
          if (i === 1) {
            assert.equal((await store.forgetDevice("audit-device-0")).plans, 2);
            assert.equal((await store.listPlans(10)).length, 0);
          }
        } finally {
          store.close();
        }
      }
    } finally {
      built.close();
    }
  },
);
