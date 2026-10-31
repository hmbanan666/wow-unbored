import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { sqlitePath } from "../src/config.ts";
import { accountKey, isAccountHash } from "../src/store.ts";

const SALT = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const HASH = "7333440414623d4053ac778ca99e938ae2cf885cd54333c1c5f053e4a896c4ee";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
) as { account: string; character: string; realm: string };

test("the Account key hash matches the Companion scheme", () => {
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
    companionToken: "companion-test-token",
    plannerToken: "planner-test-token",
    dataDir,
    log: () => {},
  });
  const db = new DatabaseSync(sqlitePath(dataDir), { readOnly: true });
  const accountIds = () =>
    (db.prepare(`SELECT id FROM accounts ORDER BY id`).all() as { id: string }[]).map(
      (row) => row.id,
    );
  try {
    const registered = await built.app.request("/v1/devices/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "account-pc", name: "PC", secret: "account-secret-value" }),
    });
    assert.equal(registered.status, 201);
    built.store.setDeviceStatus("account-pc", "approved");
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
    assert.deepEqual(accountIds(), [accountKey(fixture.account)]);
    const moved = await send({ ...fixture, account: HASH, accountLegacy: fixture.account });
    assert.equal(moved.status, 200);
    assert.deepEqual(accountIds(), [HASH]);
    const label = db.prepare(`SELECT label FROM accounts WHERE id = ?`).get(HASH) as {
      label: string;
    };
    assert.equal(label.label, HASH, "the folder name is not kept");
    const owner = db
      .prepare(`SELECT owner_id FROM sections_latest WHERE owner_kind = 'account' LIMIT 1`)
      .get() as { owner_id: string } | undefined;
    assert.equal(owner?.owner_id, HASH);
    const plain = await send({ ...fixture, account: "ABCDEF#2", character: "Alt" });
    assert.equal(plain.status, 200);
    assert.deepEqual(accountIds().sort(), ["ABCDEF", HASH].sort());
  } finally {
    db.close();
    built.close();
  }
});
