import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { sha256Hex } from "../src/auth.ts";
import { createApp } from "../src/app.ts";
import { cleanSnapshot } from "../src/data.ts";
import { storage } from "./backend.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";
const secret = "device-secret-value";
const legacyFixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
);
/** What a current Companion sends: the salted Account hash (ADR 0044). */
const hashedAccount = "7333440414623d4053ac778ca99e938ae2cf885cd54333c1c5f053e4a896c4ee";
const fixture = { ...legacyFixture, account: hashedAccount };

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-page-"));
  return createApp({
    ...storage(),
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    webOrigin: "https://unbored.test",
    log: () => {},
  });
}

async function pair(built: ReturnType<typeof setup>, deviceId = "pc-page-01") {
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
    body: JSON.stringify({ deviceId, name: "PC", secret }),
  });
  assert.equal(registered.status, 201);
  await built.store.setDeviceStatus(deviceId, "approved");
  return deviceId;
}

function auth(secretValue: string) {
  return { authorization: `Bearer ${secretValue}`, "content-type": "application/json" };
}

async function waitForUpload(
  built: ReturnType<typeof setup>,
  posted: Response,
  secretValue: string,
): Promise<void> {
  assert.ok(posted.status === 200 || posted.status === 202);
  if (posted.status !== 202) return;
  const upload = (await posted.json()) as { upload: string };
  for (let i = 0; i < 40; i += 1) {
    const status = await built.app.request(`/v1/uploads/${upload.upload}`, {
      headers: auth(secretValue),
    });
    const body = (await status.json()) as { state: string };
    if (body.state === "done") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("upload was not applied");
}

test("a sign-in link works once, expires, and Forget erases the session", async () => {
  const built = setup();
  await pair(built);
  const posted = await built.app.request("/v1/snapshot", {
    method: "POST",
    headers: auth(secret),
    body: JSON.stringify(fixture),
  });
  await waitForUpload(built, posted, secret);

  const pending = await built.app.request("/v1/devices/me/page-link", {
    method: "POST",
    headers: auth(secret),
  });
  assert.equal(pending.status, 200);
  const issued = (await pending.json()) as { url: string; expiresAt: number };
  const token = issued.url.split("/enter/")[1]!;
  assert.match(issued.url, /^https:\/\/unbored\.test\/enter\//);
  assert.ok(issued.expiresAt > Math.floor(Date.now() / 1000));

  const shared = await built.app.request("/v1/devices/me/page-link", {
    method: "POST",
    headers: auth(companion),
  });
  assert.equal(shared.status, 403);

  const redeem = await built.app.request("/v1/page-links/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 200);
  const session = (await redeem.json()) as { sessionId: string; accountId: string };
  assert.ok(session.sessionId);
  assert.equal(session.accountId, hashedAccount);

  const again = await built.app.request("/v1/page-links/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(again.status, 410);
  assert.equal(((await again.json()) as { error: string }).error, "used");

  const second = (await (
    await built.app.request("/v1/devices/me/page-link", {
      method: "POST",
      headers: auth(secret),
    })
  ).json()) as { url: string };
  const expiredToken = second.url.split("/enter/")[1]!;
  const links = built.store.db.pg ? "web.sign_in_links" : "web_sign_in_links";
  await built.store.db.run(
    `UPDATE ${links} SET expires_at = ? WHERE token_hash = ?`,
    1,
    sha256Hex(expiredToken),
  );
  const expired = await built.app.request("/v1/page-links/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: expiredToken }),
  });
  assert.equal(expired.status, 410);
  assert.equal(((await expired.json()) as { error: string }).error, "expired");

  const sessions = built.store.db.pg ? "web.sessions" : "web_sessions";
  const open = await built.store.db.get<{ ended_at: number | null }>(
    `SELECT ended_at FROM ${sessions} WHERE id = ?`,
    session.sessionId,
  );
  assert.equal(open?.ended_at ?? null, null);

  const forgotten = await built.app.request("/v1/devices/me/forget", {
    method: "POST",
    headers: auth(secret),
    body: JSON.stringify({ confirm: true }),
  });
  assert.equal(forgotten.status, 200);
  const closed = await built.store.db.get<{ ended_at: number | null }>(
    `SELECT ended_at FROM ${sessions} WHERE id = ?`,
    session.sessionId,
  );
  assert.equal(closed, undefined);
});

test("My page stays closed until this PC is connected and has characters", async () => {
  const built = setup();
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41" },
    body: JSON.stringify({ deviceId: "pc-page-02", name: "PC", secret: "other-device-secret" }),
  });
  assert.equal(registered.status, 201);
  const waiting = await built.app.request("/v1/devices/me/page-link", {
    method: "POST",
    headers: auth("other-device-secret"),
  });
  assert.equal(waiting.status, 403);

  await built.store.setDeviceStatus("pc-page-02", "approved");
  const empty = await built.app.request("/v1/devices/me/page-link", {
    method: "POST",
    headers: auth("other-device-secret"),
  });
  assert.equal(empty.status, 409);
});

test("an unhashed Account key never opens My page", async () => {
  const built = setup();
  const deviceId = "pc-page-03";
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
    body: JSON.stringify({ deviceId, name: "PC", secret: "legacy-device-secret" }),
  });
  assert.equal(registered.status, 201);
  await built.store.setDeviceStatus(deviceId, "approved");
  const posted = await built.app.request("/v1/snapshot", {
    method: "POST",
    headers: auth("legacy-device-secret"),
    body: JSON.stringify(legacyFixture),
  });
  assert.ok(posted.status === 200 || posted.status === 202);
  await waitForUpload(built, posted, "legacy-device-secret");
  const link = await built.app.request("/v1/devices/me/page-link", {
    method: "POST",
    headers: auth("legacy-device-secret"),
  });
  assert.equal(link.status, 409);
});

test("a link from a PC that was revoked afterwards does not open a session", async () => {
  const built = setup();
  await pair(built, "pc-page-04");
  const posted = await built.app.request("/v1/snapshot", {
    method: "POST",
    headers: auth(secret),
    body: JSON.stringify(fixture),
  });
  await waitForUpload(built, posted, secret);
  const issued = (await (
    await built.app.request("/v1/devices/me/page-link", { method: "POST", headers: auth(secret) })
  ).json()) as { url: string };
  await built.store.setDeviceStatus("pc-page-04", "revoked");
  const redeem = await built.app.request("/v1/page-links/redeem", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.43" },
    body: JSON.stringify({ token: issued.url.split("/enter/")[1] }),
  });
  assert.equal(redeem.status, 404);
});

test("sign-in links use the configured site origin, not request headers", async () => {
  const built = setup();
  await pair(built, "pc-page-05");
  const posted = await built.app.request("/v1/snapshot", {
    method: "POST",
    headers: auth(secret),
    body: JSON.stringify(fixture),
  });
  await waitForUpload(built, posted, secret);
  const issued = (await (
    await built.app.request("/v1/devices/me/page-link", {
      method: "POST",
      headers: { ...auth(secret), host: "evil.example", "x-forwarded-host": "evil.example" },
    })
  ).json()) as { url: string };
  assert.match(issued.url, /^https:\/\/unbored\.test\/enter\//);
});

for (const action of ["delete_account_data", "keep_requests", "forget"] as const) {
  test(`${action} erases website data only for the erased Account`, async () => {
    const built = setup();
    const { store, app } = built;
    const otherAccount = "b".repeat(64);
    const now = Math.floor(Date.now() / 1000);
    const links = store.db.pg ? "web.sign_in_links" : "web_sign_in_links";
    const sessions = store.db.pg ? "web.sessions" : "web_sessions";
    const issue = async (deviceSecret: string) => {
      const response = await app.request("/v1/devices/me/page-link", {
        method: "POST",
        headers: auth(deviceSecret),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { url: string };
      return body.url.split("/enter/")[1]!;
    };
    const redeem = (token: string) =>
      app.request("/v1/page-links/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    const rows = (table: string, account: string) =>
      store.db.all(
        `SELECT * FROM ${table} WHERE account_id = ? ORDER BY created_at, device_id`,
        account,
      );
    const live = (id: string) =>
      app.request("/v1/web/paths/progress", {
        headers: { authorization: `Bearer ${id}` },
      });
    try {
      if (store.db.pg) {
        await store.db.run(`DELETE FROM ${sessions}`);
        await store.db.run(`DELETE FROM ${links}`);
      }
      let removed: { webSessions: number; signInLinks: number } | undefined;
      const ids: string[] = [];
      const pending: string[] = [];
      // Two PCs on the erased Account, and an unrelated Account that must survive.
      for (const [index, account] of [hashedAccount, hashedAccount, otherAccount].entries()) {
        const deviceId = `erase-page-${index}`;
        const deviceSecret = `erase-page-secret-${index}`;
        await store.registerDevice({
          id: deviceId,
          name: "PC",
          secretHash: sha256Hex(deviceSecret),
          nowSeconds: now,
          pendingCap: 10,
        });
        await store.setDeviceStatus(deviceId, "approved");
        await store.putSnapshot(
          cleanSnapshot({ ...fixture, account, character: `Character${index}` }),
          deviceId,
          now,
        );
        const response = await redeem(await issue(deviceSecret));
        assert.equal(response.status, 200);
        ids.push(((await response.json()) as { sessionId: string }).sessionId);
        pending.push(await issue(deviceSecret));
      }
      // Erasure must remove ended sessions and expired links as well as live ones.
      await store.db.run(`UPDATE ${sessions} SET ended_at = ? WHERE id = ?`, now, ids[1]!);
      await store.db.run(
        `UPDATE ${links} SET expires_at = 1 WHERE token_hash = ?`,
        sha256Hex(pending[1]!),
      );
      const otherSessions = await rows(sessions, otherAccount);
      const otherLinks = await rows(links, otherAccount);
      assert.equal((await rows(sessions, hashedAccount)).length, 2);
      assert.equal((await rows(links, hashedAccount)).length, 4);
      if (store.db.pg) assert.equal((await live(ids[0]!)).status, 200);

      if (action === "forget") {
        const response = await app.request("/v1/devices/me/forget", {
          method: "POST",
          headers: auth("erase-page-secret-0"),
          body: JSON.stringify({ confirm: true }),
        });
        assert.equal(response.status, 200);
      } else {
        const response = await app.request("/mcp", {
          method: "POST",
          headers: { ...auth(planner), accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "delete_account_data",
              arguments: {
                account: hashedAccount,
                confirm: true,
                ...(action === "keep_requests" ? { requests: false } : {}),
              },
            },
          }),
        });
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          result: { isError?: boolean; content: { text: string }[] };
        };
        assert.ok(!body.result.isError);
        removed = JSON.parse(body.result.content[0]!.text);
      }
      assert.deepEqual(await rows(sessions, hashedAccount), []);
      assert.deepEqual(await rows(links, hashedAccount), []);
      if (removed) {
        assert.equal(removed.webSessions, 2);
        assert.equal(removed.signInLinks, 4);
      }
      assert.deepEqual(await rows(sessions, otherAccount), otherSessions);
      assert.deepEqual(await rows(links, otherAccount), otherLinks);
      if (store.db.pg) {
        assert.equal((await live(ids[0]!)).status, 401);
        assert.equal((await live(ids[2]!)).status, 200);
      }
      assert.equal((await redeem(pending[0]!)).status, 404);
      assert.equal((await redeem(pending[2]!)).status, 200);
    } finally {
      store.close();
    }
  });
}
