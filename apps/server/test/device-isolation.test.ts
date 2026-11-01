import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { sqlitePath } from "../src/config.ts";
import { Store } from "../src/store.ts";

const planner = "planner-test-token";
const secrets = ["first-device-secret", "second-device-secret"];

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-isolation-"));
  const built = createApp({
    companionToken: "companion-test-token",
    plannerToken: planner,
    dataDir,
    log: () => {},
    webhook: { url: "", key: "", headerName: "X-Unbored-Key" },
    blizzard: null,
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
    built.store.setDeviceStatus(deviceId, "approved");
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

test("Request retries are idempotent only for the Device that created them", async () => {
  const built = await setup();
  try {
    assert.equal((await built.call("/v1/requests", secrets[0], request)).status, 201);
    const retry = await built.call("/v1/requests", secrets[0], request);
    assert.equal(retry.status, 200);
    const collision = await built.call("/v1/requests", secrets[1], request);
    assert.equal(collision.status, 400);
    assert.deepEqual(await collision.json(), { error: "Request id is already in use." });
    assert.equal(built.store.requestById(request.id)?.deviceId, "audit-device-0");
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
      built.store.planById(privatePlan.id),
      undefined,
      "replacement history is erased too",
    );
    assert.equal(built.store.planById((await next.json()).id), undefined);
    assert.equal((await (await built.call("/v1/plan", secrets[1])).json()).id, directPlan.id);
  } finally {
    built.close();
  }
});

test("existing Request Plans retain their ownership across migration and restart", async () => {
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
      const store = new Store(built.dataDir);
      try {
        assert.equal(store.latestPlanForDevice("audit-device-1"), undefined);
        assert.ok(store.latestPlanForDevice("audit-device-0"));
        if (i === 1) {
          assert.equal(store.forgetDevice("audit-device-0").plans, 2);
          assert.equal(store.listPlans(10).length, 0);
        }
      } finally {
        store.close();
      }
    }
  } finally {
    built.close();
  }
});
