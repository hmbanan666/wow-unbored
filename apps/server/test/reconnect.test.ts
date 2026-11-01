import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { storage } from "./backend.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-reconnect-"));
  return createApp({
    ...storage(),
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    log: () => {},
  });
}

async function register(built: ReturnType<typeof setup>, deviceId: string, secret: string) {
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
    body: JSON.stringify({ deviceId, name: "PC", secret }),
  });
  assert.equal(registered.status, 201);
}

function reconnect(
  built: ReturnType<typeof setup>,
  oldSecret: string,
  next: { deviceId: string; secret: string },
) {
  return built.app.request("/v1/devices/me/reconnect", {
    method: "POST",
    headers: {
      authorization: `Bearer ${oldSecret}`,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.40",
    },
    body: JSON.stringify({ deviceId: next.deviceId, name: "PC", secret: next.secret }),
  });
}

test("Connect again mints a new approved device and the old secret stops working", async () => {
  const built = setup();
  try {
    await register(built, "forget-pc", "old-secret-value-1");
    await built.store.setDeviceStatus("forget-pc", "approved");
    const forgotten = await built.app.request("/v1/devices/me/forget", {
      method: "POST",
      headers: {
        authorization: "Bearer old-secret-value-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(forgotten.status, 200);
    assert.equal((await built.store.deviceById("forget-pc"))?.status, "revoked");

    const retried = await built.app.request("/v1/devices/me/forget", {
      method: "POST",
      headers: {
        authorization: "Bearer old-secret-value-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(retried.status, 200, "a lost Forget response can be retried");
    assert.equal((await built.store.deviceById("forget-pc"))?.forgetRevoked, true);

    const again = await reconnect(built, "old-secret-value-1", {
      deviceId: "forget-pc-2",
      secret: "new-secret-value-2",
    });
    assert.equal(again.status, 201);
    const body = (await again.json()) as { id: string; status: string };
    assert.equal(body.id, "forget-pc-2");
    assert.equal(body.status, "approved");
    assert.equal((await built.store.deviceById("forget-pc"))?.status, "revoked");
    assert.equal((await built.store.deviceById("forget-pc"))?.forgetRevoked, false);

    const oldMe = await built.app.request("/v1/devices/me", {
      headers: { authorization: "Bearer old-secret-value-1" },
    });
    assert.equal(oldMe.status, 200);
    assert.equal(((await oldMe.json()) as { status: string }).status, "revoked");
    const oldPlan = await built.app.request("/v1/plan", {
      headers: { authorization: "Bearer old-secret-value-1" },
    });
    assert.equal(oldPlan.status, 401, "the revoked secret cannot read a plan");
    const plan = await built.app.request("/v1/plan", {
      headers: { authorization: "Bearer new-secret-value-2" },
    });
    assert.equal(plan.status, 404, "approved, and there is no plan yet");
    const mcp = await built.app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer new-secret-value-2",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(mcp.status, 401, "a device still cannot use planner tools");

    const twice = await reconnect(built, "old-secret-value-1", {
      deviceId: "forget-pc-3",
      secret: "third-secret-value",
    });
    assert.equal(twice.status, 403);
  } finally {
    built.close();
  }
});

test("an owner revoke and a device that was never approved cannot connect again", async () => {
  const built = setup();
  try {
    await register(built, "owner-pc", "owner-secret-value");
    await built.store.setDeviceStatus("owner-pc", "approved");
    await built.store.setDeviceStatus("owner-pc", "revoked");
    const owner = await reconnect(built, "owner-secret-value", {
      deviceId: "owner-pc-2",
      secret: "owner-secret-value-2",
    });
    assert.equal(owner.status, 403);
    assert.equal(await built.store.deviceById("owner-pc-2"), undefined);

    await register(built, "pending-pc", "pending-secret-val");
    const forgotten = await built.app.request("/v1/devices/me/forget", {
      method: "POST",
      headers: {
        authorization: "Bearer pending-secret-val",
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(forgotten.status, 200);
    const pending = await reconnect(built, "pending-secret-val", {
      deviceId: "pending-pc-2",
      secret: "pending-secret-val2",
    });
    assert.equal(pending.status, 403);

    await register(built, "same-id-pc", "same-id-secret-val");
    await built.store.setDeviceStatus("same-id-pc", "approved");
    await built.app.request("/v1/devices/me/forget", {
      method: "POST",
      headers: {
        authorization: "Bearer same-id-secret-val",
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    const same = await reconnect(built, "same-id-secret-val", {
      deviceId: "same-id-pc",
      secret: "same-id-secret-new",
    });
    assert.equal(same.status, 400);
  } finally {
    built.close();
  }
});
