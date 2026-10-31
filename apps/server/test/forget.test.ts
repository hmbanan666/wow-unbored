import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { sqlitePath } from "../src/config.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";
const NOW = 1_800_000_000;
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
) as { account: string; character: string; realm: string; savedAt: number };

const plan = {
  v: 1,
  kind: "plan",
  mode: "custom",
  budget: 60,
  tasks: [
    { id: "t1", title: "Going Down?", complete: { kind: "achievement", achievementID: 964 } },
  ],
};

type Built = ReturnType<typeof createApp>;

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-forget-"));
  const built = createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    log: () => {},
  });
  const db = new DatabaseSync(sqlitePath(dataDir), { readOnly: true });
  const rows = (sql: string, ...args: string[]) =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...args) as { n: number }).n);
  return {
    ...built,
    rows,
    close: () => {
      db.close();
      built.close();
    },
  };
}

async function pair(built: Built, deviceId: string, secret: string) {
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.90" },
    body: JSON.stringify({ deviceId, name: "PC", secret }),
  });
  assert.equal(registered.status, 201);
  built.store.setDeviceStatus(deviceId, "approved");
}

function call(built: Built, url: string, secret: string, body?: unknown) {
  return built.app.request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** One Account with Game data, a Request answered by a plan, advice and ideas. */
async function fill(
  built: Built,
  secret: string,
  who: { account: string; character: string; request: string },
) {
  const snapshot = { ...structuredClone(fixture), account: who.account, character: who.character };
  assert.equal((await call(built, "/v1/snapshot", secret, snapshot)).status, 200);
  const posted = await call(built, "/v1/requests", secret, {
    id: who.request,
    character: who.character,
    realm: fixture.realm,
    mode: "farm",
    budget: 60,
    wish: "mount",
  });
  assert.equal(posted.status, 201);
  const stored = built.store.putPlan({ ...plan, requestId: who.request }, NOW);
  built.store.fulfillRequest(who.request, stored.id, NOW);
  built.store.putItemAdvice({
    character: who.character,
    realm: fixture.realm,
    account: who.account,
    items: [{ itemID: 6948, action: "keep", line: "Your way home." }],
  });
  built.store.suggestions.computeAccount(who.account.split("#")[0]!, NOW);
}

test("Forget my data needs the device's own secret and an explicit confirm", async () => {
  const built = setup();
  try {
    await pair(built, "forget-a", "forget-device-secret-a");
    const url = "/v1/devices/me/forget";
    const bare = await built.app.request(url, { method: "POST" });
    assert.equal(bare.status, 401);
    const shared = await call(built, url, companion, { confirm: true });
    assert.equal(shared.status, 403);
    assert.doesNotMatch(JSON.stringify(await shared.json()), /token-test|companion-test/);
    assert.equal(
      (await call(built, url, "not-a-known-device-secret", { confirm: true })).status,
      401,
    );
    assert.equal((await call(built, url, "forget-device-secret-a", {})).status, 400);
    assert.equal(
      (await call(built, url, "forget-device-secret-a", { confirm: "yes" })).status,
      400,
    );
    assert.equal(built.store.deviceById("forget-a")?.status, "approved", "nothing happened yet");
  } finally {
    built.close();
  }
});

test("Forget my data erases this device's Accounts and revokes it, leaving others alone", async () => {
  const built = setup();
  try {
    await pair(built, "forget-a", "forget-device-secret-a");
    await pair(built, "forget-b", "forget-device-secret-b");
    await fill(built, "forget-device-secret-a", {
      account: "111111#1",
      character: "Mira",
      request: "req-a",
    });
    await fill(built, "forget-device-secret-b", {
      account: "222222#1",
      character: "Brew",
      request: "req-b",
    });
    const { rows } = built;
    for (const [account, name] of [
      ["111111", "Mira"],
      ["222222", "Brew"],
    ] as const) {
      assert.equal(rows("characters WHERE account_id = ?", account), 1, account);
      assert.equal(rows("advice WHERE character_name = ?", name), 1, name);
      assert.equal(rows("requests WHERE character_name = ?", name), 1, name);
    }
    assert.equal(rows("plans"), 2);
    assert.ok(rows("sections_latest WHERE owner_id LIKE ?", "%Mira%") > 0);
    assert.ok(rows("suggestions WHERE owner_id = ?", "111111") > 0);
    assert.ok(rows("suggestions WHERE owner_id = ?", "222222") > 0);

    const forgot = await call(built, "/v1/devices/me/forget", "forget-device-secret-a", {
      confirm: true,
    });
    assert.equal(forgot.status, 200);
    const body = (await forgot.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal(body.revoked, true);
    assert.equal(body.accounts, 1);
    assert.equal(body.requests, 1);
    assert.equal(body.plans, 1);

    assert.equal(rows("characters WHERE account_id = ?", "111111"), 0);
    assert.equal(rows("sections_latest WHERE owner_id LIKE ?", "%Mira%"), 0);
    assert.equal(rows("section_history WHERE owner_id LIKE ?", "%Mira%"), 0);
    assert.equal(rows("advice WHERE character_name = ?", "Mira"), 0);
    assert.equal(rows("requests WHERE character_name = ?", "Mira"), 0);
    assert.equal(rows("suggestions WHERE owner_id = ?", "111111"), 0);
    assert.equal(rows("plans"), 1);

    assert.equal(rows("characters WHERE account_id = ?", "222222"), 1, "B keeps its Account");
    assert.equal(rows("advice WHERE character_name = ?", "Brew"), 1);
    assert.equal(rows("requests WHERE character_name = ?", "Brew"), 1);
    assert.ok(rows("suggestions WHERE owner_id = ?", "222222") > 0);

    assert.equal(built.store.deviceById("forget-a")?.status, "revoked");
    assert.equal(built.store.deviceById("forget-b")?.status, "approved");
    assert.equal((await call(built, "/v1/requests/latest", "forget-device-secret-a")).status, 401);
    assert.equal((await call(built, "/v1/requests/latest", "forget-device-secret-b")).status, 200);

    const again = await call(built, "/v1/devices/me/forget", "forget-device-secret-a", {
      confirm: true,
    });
    assert.equal(again.status, 200, "a revoked device can still ask again");
    assert.equal(((await again.json()) as { accounts: number }).accounts, 0);
  } finally {
    built.close();
  }
});

test("delete_account_data erases Requests and plans unless told to keep them", () => {
  const built = setup();
  const { store, rows } = built;
  const request = (id: string) =>
    store.addRequest({
      id,
      deviceId: "owner-test",
      character: "Mira",
      realm: fixture.realm,
      mode: "farm",
      budget: 60,
      wish: null,
      account: "111111#1",
      nowSeconds: NOW,
    });
  try {
    request("req-keep");
    store.fulfillRequest(
      "req-keep",
      store.putPlan({ ...plan, requestId: "req-keep" }, NOW).id,
      NOW,
    );
    const kept = store.deleteAccountData("111111#1", { requests: false });
    assert.equal(kept.requests, 0);
    assert.equal(rows("requests"), 1);
    assert.equal(rows("plans"), 1);

    const erased = store.deleteAccountData("111111#1");
    assert.equal(erased.requests, 1);
    assert.equal(erased.plans, 1);
    assert.equal(rows("requests"), 0);
    assert.equal(rows("plans"), 0);
    assert.throws(() => store.deleteAccountData("  "), /Name the Account/);
  } finally {
    built.close();
  }
});
