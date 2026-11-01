import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { onPostgres, storage } from "./backend.ts";

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
    ...storage(),
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    log: () => {},
  });
  const rows = async (sql: string, ...args: string[]) =>
    Number(
      (await built.store.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`, ...args))?.n,
    );
  return { ...built, rows };
}

async function pair(built: Built, deviceId: string, secret: string) {
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.90" },
    body: JSON.stringify({ deviceId, name: "PC", secret }),
  });
  assert.equal(registered.status, 201);
  await built.store.setDeviceStatus(deviceId, "approved");
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
  const stored = await built.store.putPlan({ ...plan, requestId: who.request }, NOW);
  await built.store.fulfillRequest(who.request, stored.id, NOW);
  await built.store.putItemAdvice({
    character: who.character,
    realm: fixture.realm,
    account: who.account,
    items: [{ itemID: 6948, action: "keep", line: "Your way home." }],
  });
  await built.store.suggestions.computeAccount(who.account.split("#")[0]!, NOW);
}

for (const endpoint of ["snapshot", "profile", "requests", "progress"]) {
  for (const action of ["forget", "revoke"]) {
    test(`${endpoint} cannot write after ${action} while its body is still arriving`, async () => {
      const built = setup();
      let markReading!: () => void;
      let resume!: () => void;
      const reading = new Promise<void>((resolve) => {
        markReading = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      let pending: Promise<Response> | undefined;
      try {
        const secret = "late-upload-device-secret";
        await pair(built, "late-upload-device", secret);
        await fill(built, secret, {
          account: fixture.account,
          character: fixture.character,
          request: "seed",
        });
        const identity = {
          account: fixture.account,
          character: fixture.character,
          realm: fixture.realm,
        };
        const bodies: Record<string, unknown> = {
          snapshot: fixture,
          profile: { ...identity, savedAt: fixture.savedAt, profile: { context: { level: 80 } } },
          requests: { ...identity, id: "late-request", mode: "farm" },
          progress: {
            ...identity,
            savedAt: fixture.savedAt,
            progress: { v: 1, mode: "farm", done: [], remaining: [] },
          },
        };
        const bytes = Buffer.from(JSON.stringify(bodies[endpoint]));
        const encoded = endpoint === "snapshot" ? gzipSync(bytes) : bytes;
        const stream = new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              // highWaterMark 0: this happens only when the route reads the body,
              // after its initial authentication, not during stream construction.
              markReading();
              await resumed;
              controller.enqueue(encoded);
              controller.close();
            },
          },
          { highWaterMark: 0 },
        );
        const init: RequestInit & { duplex: "half" } = {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "application/json",
            ...(endpoint === "snapshot" ? { "content-encoding": "gzip" } : {}),
          },
          body: stream,
          duplex: "half",
        };
        pending = Promise.resolve(
          built.app.request(new Request(`http://localhost/v1/${endpoint}`, init)),
        );
        await reading;
        if (action === "forget") {
          assert.equal(
            (await call(built, "/v1/devices/me/forget", secret, { confirm: true })).status,
            200,
          );
        } else {
          await built.store.setDeviceStatus("late-upload-device", "revoked");
        }
        const tables = [
          "accounts",
          "characters",
          "sections_latest",
          "section_history",
          ...(onPostgres ? [] : ["profiles", "profile_snapshots"]),
          "requests",
          "plans",
          "progress",
          "history",
          "suggestions",
        ];
        const before = await Promise.all(tables.map((table) => built.rows(table)));
        resume();
        assert.equal((await pending).status, 401, "authorization must still hold at the write");
        assert.deepEqual(
          await Promise.all(tables.map((table) => built.rows(table))),
          before,
          "no data or migration side effects",
        );
        assert.equal((await built.store.deviceById("late-upload-device"))?.status, "revoked");
      } finally {
        resume();
        await pending;
        built.close();
      }
    });
  }
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
    assert.equal(
      (await built.store.deviceById("forget-a"))?.status,
      "approved",
      "nothing happened yet",
    );
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
      assert.equal(await rows("characters WHERE account_id = ?", account), 1, account);
      assert.equal(await rows("advice WHERE character_name = ?", name), 1, name);
      assert.equal(await rows("requests WHERE character_name = ?", name), 1, name);
    }
    assert.equal(await rows("plans"), 2);
    assert.ok((await rows("sections_latest WHERE owner_id LIKE ?", "%Mira%")) > 0);
    assert.ok((await rows("suggestions WHERE owner_id = ?", "111111")) > 0);
    assert.ok((await rows("suggestions WHERE owner_id = ?", "222222")) > 0);

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

    assert.equal(await rows("characters WHERE account_id = ?", "111111"), 0);
    assert.equal(await rows("sections_latest WHERE owner_id LIKE ?", "%Mira%"), 0);
    assert.equal(await rows("section_history WHERE owner_id LIKE ?", "%Mira%"), 0);
    assert.equal(await rows("advice WHERE character_name = ?", "Mira"), 0);
    assert.equal(await rows("requests WHERE character_name = ?", "Mira"), 0);
    assert.equal(await rows("suggestions WHERE owner_id = ?", "111111"), 0);
    assert.equal(await rows("plans"), 1);

    assert.equal(await rows("characters WHERE account_id = ?", "222222"), 1, "B keeps its Account");
    assert.equal(await rows("advice WHERE character_name = ?", "Brew"), 1);
    assert.equal(await rows("requests WHERE character_name = ?", "Brew"), 1);
    assert.ok((await rows("suggestions WHERE owner_id = ?", "222222")) > 0);

    assert.equal((await built.store.deviceById("forget-a"))?.status, "revoked");
    assert.equal((await built.store.deviceById("forget-b"))?.status, "approved");
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

test("delete_account_data erases Requests and plans unless told to keep them", async () => {
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
    await request("req-keep");
    await store.fulfillRequest(
      "req-keep",
      (await store.putPlan({ ...plan, requestId: "req-keep" }, NOW)).id,
      NOW,
    );
    const kept = await store.deleteAccountData("111111#1", { requests: false });
    assert.equal(kept.requests, 0);
    assert.equal(await rows("requests"), 1);
    assert.equal(await rows("plans"), 1);

    const erased = await store.deleteAccountData("111111#1");
    assert.equal(erased.requests, 1);
    assert.equal(erased.plans, 1);
    assert.equal(await rows("requests"), 0);
    assert.equal(await rows("plans"), 0);
    await assert.rejects(store.deleteAccountData("  "), /Name the Account/);
  } finally {
    built.close();
  }
});
