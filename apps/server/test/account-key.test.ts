import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { accountKey, isAccountHash } from "../src/store.ts";
import { database } from "./backend.ts";

const SALT = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const HASH = "7333440414623d4053ac778ca99e938ae2cf885cd54333c1c5f053e4a896c4ee";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
) as { account: string; character: string; realm: string };

test("the Account key hash matches the Companion scheme", async () => {
  const hash = createHash("sha256");
  hash.update(Buffer.from(SALT, "hex"));
  hash.update(Buffer.from([0]));
  hash.update("12345678");
  assert.equal(hash.digest("hex"), HASH);
  assert.equal(accountKey("12345678#1"), "12345678");
  assert.equal(accountKey("12345678#2"), "12345678");
  assert.equal(accountKey(HASH), HASH);
  assert.equal(isAccountHash(HASH), true);
  assert.equal(isAccountHash("12345678"), false);
});

test("a hashed Account key renames existing rows and an older upload still stores", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-account-"));
  const built = createApp({
    database: database(),
    companionToken: "companion-test-token",
    plannerToken: "planner-test-token",
    dataDir,
    log: () => {},
  });
  const db = built.store.db;
  const accountIds = async () =>
    (await db.all<{ id: string }>(`SELECT id FROM accounts ORDER BY id`)).map((row) => row.id);
  try {
    const registered = await built.app.request("/v1/devices/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "account-pc", name: "PC", secret: "account-secret-value" }),
    });
    assert.equal(registered.status, 201);
    await built.store.setDeviceStatus("account-pc", "approved");
    const send = (body: unknown) =>
      built.app.request("/v1/snapshot", {
        method: "POST",
        headers: {
          authorization: "Bearer account-secret-value",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const first = await send(fixture);
    assert.equal(first.status, 200);
    assert.deepEqual(await accountIds(), [accountKey(fixture.account)]);
    const moved = await send({ ...fixture, account: HASH, accountLegacy: fixture.account });
    assert.equal(moved.status, 200);
    assert.deepEqual(await accountIds(), [HASH]);
    const label = (await db.get<{ label: string }>(
      `SELECT label FROM accounts WHERE id = ?`,
      HASH,
    ))!;
    assert.equal(label.label, HASH, "the folder name is not kept");
    const owner = await db.get<{ owner_id: string }>(
      `SELECT owner_id FROM sections_latest WHERE owner_kind = 'account' LIMIT 1`,
    );
    assert.equal(owner?.owner_id, HASH);
    const plain = await send({ ...fixture, account: "ABCDEF#2", character: "Alt" });
    assert.equal(plain.status, 200);
    assert.deepEqual((await accountIds()).sort(), ["ABCDEF", HASH].sort());
  } finally {
    built.close();
  }
});
