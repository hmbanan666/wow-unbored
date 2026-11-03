import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, vi } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { sha256Hex } from "../src/auth.ts";
import { storage } from "./backend.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";

test("ordinary device authentication does not open a transaction or lock rows", async () => {
  const built = setup();
  try {
    await register(built, "ordinary-pc", "ordinary-secret-value");
    await built.store.setDeviceStatus("ordinary-pc", "approved");
    const transaction = vi.spyOn(built.store.db, "tx");
    const query = vi.spyOn(built.store.db, "get");
    const device = await built.store.authenticateDevice(sha256Hex("ordinary-secret-value"));
    assert.equal(device?.id, "ordinary-pc");
    assert.equal(device.status, "approved");
    assert.equal(transaction.mock.calls.length, 0);
    assert.ok(query.mock.calls.every(([sql]) => !/FOR (UPDATE|SHARE)/i.test(sql)));
  } finally {
    vi.restoreAllMocks();
    built.close();
  }
});

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

test("a 0.11 Companion saves after the reply and confirms on its next poll", async () => {
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
    assert.equal((await built.store.deviceById("forget-pc"))?.forgetRevoked, true);
    const retry = await reconnect(built, "old-secret-value-1", {
      deviceId: "forget-pc-2",
      secret: "new-secret-value-2",
    });
    assert.equal(retry.status, 201, "a lost reply can be retried before the first poll");
    assert.deepEqual(await retry.json(), body);
    const newMe = await built.app.request("/v1/devices/me", {
      headers: { authorization: "Bearer new-secret-value-2" },
    });
    assert.equal(newMe.status, 200);
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

async function forgotten(built: ReturnType<typeof setup>) {
  await register(built, "forgotten-pc", "forgotten-secret-value");
  await built.store.setDeviceStatus("forgotten-pc", "approved");
  await built.store.forgetDevice("forgotten-pc");
}

const next = { deviceId: "replacement-pc", secret: "replacement-secret-value" };
const another = { deviceId: "another-pc", secret: "another-secret-value" };
const me = (built: ReturnType<typeof setup>, secret: string) =>
  built.app.request("/v1/devices/me", { headers: { authorization: `Bearer ${secret}` } });

test("a lost reply can be replaced; collisions do not discard the pending Device", async () => {
  const built = setup();
  try {
    await forgotten(built);
    assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
    assert.equal(
      (await reconnect(built, "forgotten-secret-value", { ...next, secret: another.secret }))
        .status,
      409,
    );
    await register(built, another.deviceId, another.secret);
    assert.equal((await reconnect(built, "forgotten-secret-value", another)).status, 409);
    assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
    const replacement = { deviceId: "replacement-2", secret: "replacement-secret-2" };
    assert.equal((await reconnect(built, "forgotten-secret-value", replacement)).status, 201);
    assert.equal((await me(built, next.secret)).status, 401);
    assert.equal((await me(built, replacement.secret)).status, 200);
    assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 403);
  } finally {
    built.close();
  }
});

test("a different replacement id may reuse its own unconfirmed secret", async () => {
  const built = setup();
  try {
    await forgotten(built);
    assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
    const replacement = { ...another, secret: next.secret };
    assert.equal((await reconnect(built, "forgotten-secret-value", replacement)).status, 201);
    const active = await me(built, next.secret);
    assert.equal(active.status, 200);
    assert.equal(((await active.json()) as { id: string }).id, another.deviceId);
  } finally {
    built.close();
  }
});

for (const route of ["/v1/progress", "/v1/requests", "/v1/snapshot"]) {
  test(`the first authenticated ${route} confirms Connect again`, async () => {
    const built = setup();
    try {
      await forgotten(built);
      assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
      const body =
        route === "/v1/progress"
          ? { account: "test", character: "Mira", realm: "Realm", progress: { done: [] } }
          : {
              id: "reconnected-request",
              character: "Mira",
              realm: "Realm",
              mode: "farm",
              wish: "Find a mount",
            };
      const upload =
        route === "/v1/snapshot"
          ? JSON.parse(
              readFileSync(
                new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
                "utf8",
              ),
            )
          : body;
      const response = await built.app.request(route, {
        method: "POST",
        headers: { authorization: `Bearer ${next.secret}`, "content-type": "application/json" },
        body: JSON.stringify(upload),
      });
      assert.equal(response.ok, true, await response.text());
      assert.equal((await reconnect(built, "forgotten-secret-value", another)).status, 403);
    } finally {
      built.close();
    }
  });
}

for (const side of ["forgotten-pc", next.deviceId]) {
  for (const action of ["owner revoke", "Forget"]) {
    test(`${action} on ${side} revokes the unconfirmed partner`, async () => {
      const built = setup();
      try {
        await forgotten(built);
        assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
        if (action === "owner revoke") await built.store.setDeviceStatus(side, "revoked");
        else {
          const response = await built.app.request("/v1/devices/me/forget", {
            method: "POST",
            headers: {
              authorization: `Bearer ${side === next.deviceId ? next.secret : "forgotten-secret-value"}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ confirm: true }),
          });
          assert.equal(response.status, 200);
        }
        for (const secret of ["forgotten-secret-value", next.secret]) {
          assert.equal(
            ((await (await me(built, secret)).json()) as { status: string }).status,
            "revoked",
          );
        }
        const allowed = action === "Forget";
        assert.equal(
          (
            await reconnect(
              built,
              side === next.deviceId ? next.secret : "forgotten-secret-value",
              another,
            )
          ).status,
          allowed ? 201 : 403,
        );
        const partnerSecret = side === next.deviceId ? "forgotten-secret-value" : next.secret;
        assert.equal(
          (
            await reconnect(built, partnerSecret, {
              deviceId: "partner-new-pc",
              secret: "partner-new-secret-value",
            })
          ).status,
          403,
        );
      } finally {
        built.close();
      }
    });
  }
}

test("cleanup expires only unconfirmed replacements after 24 hours and logs ids only", async () => {
  const logs: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  let clock = now;
  const built = createApp({
    ...storage(),
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-expire-reconnect-")),
    log: (line) => logs.push(line),
  });
  try {
    await forgotten(built);
    assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
    const pending = await reconnect(built, "forgotten-secret-value", next);
    clock = ((await pending.json()) as { createdAt: number }).createdAt + 24 * 60 * 60;
    await built.store.expireReconnects(clock);
    assert.equal((await reconnect(built, "forgotten-secret-value", next)).status, 201);
    clock += 2;
    await built.store.expireReconnects(clock);
    assert.equal((await me(built, next.secret)).status, 401);
    assert.equal((await reconnect(built, "forgotten-secret-value", another)).status, 201);
    assert.equal((await me(built, another.secret)).status, 200);
    clock += 24 * 60 * 60;
    await built.store.expireReconnects(clock);
    assert.equal((await me(built, another.secret)).status, 200);
    assert.deepEqual(
      logs.filter((line) => line.startsWith("device reconnect")),
      [
        "device reconnect old=forgotte new=replacem pending",
        "device reconnect old=forgotte new=replacem expired",
        "device reconnect old=forgotte new=another- pending",
        "device reconnect old=forgotte new=another- confirmed",
      ],
    );
  } finally {
    built.close();
  }
});

test("app cleanup runs at startup and every ten minutes without a webhook, then stops on close", async () => {
  const built = setup();
  vi.useFakeTimers();
  const expire = vi.spyOn(built.store, "expireReconnects").mockResolvedValue();
  const interval = vi.spyOn(globalThis, "setInterval");
  try {
    assert.equal(built.webhook.enabled, false);
    built.startReconnectCleanup();
    built.startReconnectCleanup();
    assert.equal(expire.mock.calls.length, 1);
    assert.equal(interval.mock.results.length, 1);
    assert.equal(interval.mock.results[0]!.value.hasRef(), false);
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
    assert.equal(expire.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(expire.mock.calls.length, 2);
    built.close();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    assert.equal(expire.mock.calls.length, 2);
  } finally {
    built.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

test("app close drains active reconnect cleanup before closing storage", async () => {
  const built = setup();
  vi.useFakeTimers();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const expire = vi.spyOn(built.store, "expireReconnects").mockReturnValue(pending);
  const closeStore = vi.spyOn(built.store, "close");
  try {
    built.startReconnectCleanup();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    assert.equal(expire.mock.calls.length, 1, "slow cleanup cannot overlap itself");
    const closing = built.close();
    assert.equal(closeStore.mock.calls.length, 0);
    release();
    await closing;
    assert.equal(closeStore.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    assert.equal(expire.mock.calls.length, 1);
  } finally {
    release();
    await built.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

test("concurrent retries and confirmation leave one usable replacement", async () => {
  const built = setup();
  try {
    await forgotten(built);
    const replies = await Promise.all([
      reconnect(built, "forgotten-secret-value", next),
      reconnect(built, "forgotten-secret-value", next),
    ]);
    assert.deepEqual(
      replies.map((r) => r.status),
      [201, 201],
    );
    const [confirmed, replaced] = await Promise.all([
      me(built, next.secret),
      reconnect(built, "forgotten-secret-value", another),
    ]);
    assert.ok(
      (confirmed.status === 200 && replaced.status === 403) ||
        (confirmed.status === 401 && replaced.status === 201),
    );
    const survivor = replaced.status === 201 ? another : next;
    assert.equal((await me(built, survivor.secret)).status, 200);
    assert.equal(
      (
        await reconnect(built, "forgotten-secret-value", {
          deviceId: "third-new-pc",
          secret: "third-new-secret-value",
        })
      ).status,
      403,
    );
  } finally {
    built.close();
  }
});
