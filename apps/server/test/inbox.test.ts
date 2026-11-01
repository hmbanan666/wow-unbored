import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { INBOX } from "../src/inbox.ts";
import { hasPostgres, postgresPerFile } from "./postgres-db.ts";

// ADR 0057 rollout step 4: on Postgres POST /v1/snapshot queues the upload
// (202) and the worker ingests it; SQLite keeps the inline 200.
const pg = postgresPerFile();
const pgTest = test.skipIf(!hasPostgres);
const companion = "companion-test-token";
const planner = "planner-test-token";
const HASH = "b".repeat(64);
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
) as {
  account: string;
  character: string;
  realm: string;
  savedAt: number;
  sections: Record<string, unknown>;
};

type Built = ReturnType<typeof createApp>;

function build(postgres: boolean) {
  return createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-inbox-")),
    log: () => {},
    database: postgres ? pg("postgres") : undefined,
  });
}

/** The fixture with only these Sections (all when omitted). */
function body(options: {
  sections?: string[];
  account?: string;
  accountLegacy?: string;
  character?: string;
  savedAt?: number;
}) {
  const sections = Object.fromEntries(
    Object.entries(fixture.sections).filter(
      ([name]) => !options.sections || options.sections.includes(name),
    ),
  );
  return {
    ...fixture,
    account: options.account ?? fixture.account,
    ...(options.accountLegacy ? { accountLegacy: options.accountLegacy } : {}),
    character: options.character ?? fixture.character,
    savedAt: options.savedAt ?? fixture.savedAt,
    sections,
  };
}

async function pair(built: Built, deviceId: string, secret: string) {
  const registered = await built.app.request("/v1/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId, name: "PC", secret }),
  });
  assert.equal(registered.status, 201);
  await built.store.setDeviceStatus(deviceId, "approved");
}

function upload(built: Built, payload: unknown, secret = companion) {
  return built.app.request("/v1/snapshot", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
    body: gzipSync(JSON.stringify(payload)),
  });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function tool(built: Built, name: string, args: Record<string, unknown> = {}) {
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
      params: { name, arguments: args },
    }),
  });
  assert.equal(response.status, 200);
  const result = (await json(response)).result as { content: { text: string }[] };
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

async function rows(built: Built) {
  return built.store.db.all<{ id: number; account_id: string; state: string; attempts: number }>(
    `SELECT id, account_id, state, attempts FROM raw_uploads ORDER BY id`,
  );
}

test("SQLite stores the upload inline: 200 with the result, no inbox", async () => {
  const built = build(false);
  try {
    assert.equal(built.inbox, undefined);
    const response = await upload(built, body({}));
    assert.equal(response.status, 200);
    const result = await json(response);
    assert.ok((result.stored as string[]).includes("questLog"));
    assert.equal(result.upload, undefined);
    assert.equal((await built.app.request("/v1/uploads/1", { headers: auth() })).status, 404);
    assert.deepEqual(await tool(built, "list_failed_uploads"), { inbox: "off", uploads: [] });
  } finally {
    built.close();
  }
});

const auth = (secret = companion) => ({ authorization: `Bearer ${secret}` });

pgTest("Postgres queues the upload, answers 202, and the worker ingests it", async () => {
  const built = build(true);
  try {
    const response = await upload(built, body({}));
    assert.equal(response.status, 202);
    const queued = await json(response);
    assert.equal(queued.ok, true);
    assert.equal(queued.state, "queued");
    assert.match(String(queued.upload), /^\d+$/);
    assert.equal((await built.store.data.characters()).length, 0, "nothing ingested yet");
    const before = await json(
      await built.app.request(`/v1/uploads/${queued.upload}`, { headers: auth() }),
    );
    assert.equal(before.state, "queued");
    assert.equal(before.result, null);

    assert.equal(await built.inbox!.processNext(), true);
    assert.equal(await built.inbox!.processNext(), false, "the queue is empty");
    const after = await json(
      await built.app.request(`/v1/uploads/${queued.upload}`, { headers: auth() }),
    );
    assert.equal(after.state, "done");
    const result = after.result as { stored: string[]; stale: boolean };
    assert.ok(result.stored.includes("questLog"));
    assert.equal(result.stale, false);
    const [character] = await built.store.data.characters();
    assert.equal(character?.name, "Mira");
    assert.equal(character?.accountId, "111111");
    assert.ok(await built.store.data.section("char", character!.id, "questLog"));
    assert.equal((await built.app.request("/v1/uploads/999999", { headers: auth() })).status, 404);
    assert.equal((await built.app.request("/v1/uploads/abc", { headers: auth() })).status, 404);
  } finally {
    built.close();
  }
});

pgTest("the same body twice is one row; another device cannot read its status", async () => {
  const built = build(true);
  try {
    const first = await json(await upload(built, body({})));
    const again = await json(await upload(built, body({})));
    assert.equal(again.upload, first.upload);
    assert.equal((await rows(built)).length, 1);
    await built.inbox!.processNext();
    const third = await upload(built, body({}));
    assert.equal(third.status, 202);
    assert.deepEqual(await json(third), { ok: true, upload: first.upload, state: "done" });

    await pair(built, "inbox-other-pc", "other-secret-value");
    const other = await built.app.request(`/v1/uploads/${first.upload}`, {
      headers: auth("other-secret-value"),
    });
    assert.equal(other.status, 404);
  } finally {
    built.close();
  }
});

pgTest("an invalid upload is still refused on the request path", async () => {
  const built = build(true);
  try {
    const bad = await upload(built, { ...body({}), sections: { "bad name": {} } });
    assert.equal(bad.status, 400);
    const notJson = await built.app.request("/v1/snapshot", {
      method: "POST",
      headers: { ...auth(), "content-encoding": "gzip" },
      body: gzipSync("{nope"),
    });
    assert.equal(notJson.status, 400);
    assert.equal((await built.app.request("/v1/snapshot", { method: "POST" })).status, 401);
    assert.equal((await rows(built)).length, 0);
  } finally {
    built.close();
  }
});

pgTest("hot Sections jump the queue, but one Account's uploads keep their order", async () => {
  const built = build(true);
  try {
    // Account A: a cold upload, then a hot one. Account B: one hot upload.
    const coldA = await json(
      await upload(built, body({ sections: ["mounts"], savedAt: fixture.savedAt })),
    );
    const hotA = await json(
      await upload(built, body({ sections: ["questLog"], savedAt: fixture.savedAt + 10 })),
    );
    const hotB = await json(
      await upload(built, body({ sections: ["bags"], account: "222222#1", character: "Brew" })),
    );
    const state = async () =>
      Object.fromEntries((await rows(built)).map((row) => [String(row.id), row.state]));

    // A's hot row waits behind A's older cold one; B's hot row goes first.
    await built.inbox!.processNext();
    assert.deepEqual(await state(), {
      [String(coldA.upload)]: "queued",
      [String(hotA.upload)]: "queued",
      [String(hotB.upload)]: "done",
    });
    await built.inbox!.processNext();
    assert.equal((await state())[String(coldA.upload)], "done");
    assert.equal((await state())[String(hotA.upload)], "queued", "not before A's older upload");
    await built.inbox!.processNext();
    assert.equal((await state())[String(hotA.upload)], "done");
  } finally {
    built.close();
  }
});

pgTest("an upload that keeps failing is retried with backoff, then failed and listed", async () => {
  const built = build(true);
  try {
    const queued = await json(await upload(built, body({})));
    await built.store.db.run(
      `UPDATE raw_uploads SET body_gz = ? WHERE id = ?`,
      Buffer.from("not gzip"),
      Number(queued.upload),
    );
    const inbox = built.inbox!;
    let now = Math.floor(Date.now() / 1000);
    inbox.clock = () => now;
    for (let attempt = 1; attempt <= INBOX.attempts; attempt += 1) {
      assert.equal(await inbox.processNext(), true, `attempt ${attempt}`);
      assert.equal(await inbox.processNext(), false, "not before the backoff");
      now += INBOX.backoffSeconds * 2 ** (attempt - 1);
    }
    const [row] = await rows(built);
    assert.equal(row?.state, "failed");
    assert.equal(row?.attempts, INBOX.attempts);
    const status = await json(
      await built.app.request(`/v1/uploads/${queued.upload}`, { headers: auth() }),
    );
    assert.equal(status.state, "failed");
    assert.ok(status.error);
    const listed = await tool(built, "list_failed_uploads");
    assert.equal(listed.inbox, "on");
    const uploads = listed.uploads as { id: string; account: string; attempts: number }[];
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0]!.id, queued.upload);
    assert.equal(uploads[0]!.account, "111111");
    assert.equal(uploads[0]!.attempts, INBOX.attempts);
    assert.deepEqual((await tool(built, "list_failed_uploads", { account: "999" })).uploads, []);
  } finally {
    built.close();
  }
});

pgTest("Forget while queued erases the queued bytes; a revoke drops them unread", async () => {
  const built = build(true);
  try {
    await pair(built, "inbox-pc-1", "inbox-pc-1-secret");
    await pair(built, "inbox-pc-2", "inbox-pc-2-secret");
    await upload(built, body({}), "inbox-pc-1-secret");
    await upload(built, body({ account: "222222#1", character: "Brew" }), "inbox-pc-2-secret");
    assert.equal((await rows(built)).length, 2);

    await built.store.forgetDevice("inbox-pc-1");
    assert.deepEqual(
      (await rows(built)).map((row) => row.account_id),
      ["222222"],
    );
    await built.store.setDeviceStatus("inbox-pc-2", "revoked");
    assert.equal(await built.inbox!.processNext(), true);
    assert.equal((await rows(built)).length, 0, "the revoked device's row is dropped");
    assert.equal((await built.store.data.characters()).length, 0, "nothing was written");
  } finally {
    built.close();
  }
});

pgTest("the Account migration moves queued uploads to the new key", async () => {
  const built = build(true);
  try {
    await upload(built, body({ sections: ["mounts"] }));
    const moved = await upload(
      built,
      body({ sections: ["questLog"], account: HASH, accountLegacy: fixture.account }),
    );
    assert.equal(moved.status, 202);
    assert.deepEqual(
      (await rows(built)).map((row) => row.account_id),
      [HASH, HASH],
    );
    while (await built.inbox!.processNext());
    assert.deepEqual(
      (await built.store.data.characters()).map((row) => row.accountId),
      [HASH],
    );
  } finally {
    built.close();
  }
});

pgTest("Requests and planner reads wait for the save just before them", async () => {
  const built = build(true);
  try {
    // No worker: the barrier gives up after its limit and reads what is there.
    const queued = await json(await upload(built, body({})));
    assert.equal(await built.store.inbox!.settle("111111", 50), false);
    await built.inbox!.start();
    const started = Date.now();
    const data = await tool(built, "get_game_data", { account: fixture.account });
    assert.ok(Date.now() - started < INBOX.barrierMs);
    assert.ok((data.sections as Record<string, unknown>).questLog, "the queued save is read");
    const status = await json(
      await built.app.request(`/v1/uploads/${queued.upload}`, { headers: auth() }),
    );
    assert.equal(status.state, "done");

    const next = await upload(built, body({ sections: ["bags"], savedAt: fixture.savedAt + 60 }));
    assert.equal(next.status, 202);
    const request = await built.app.request("/v1/requests", {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({
        id: "req-barrier",
        character: fixture.character,
        realm: fixture.realm,
        account: fixture.account,
        mode: "farm",
        budget: 60,
        wish: "mount",
      }),
    });
    assert.equal(request.status, 201);
    assert.deepEqual(
      (await rows(built)).map((row) => row.state),
      ["done", "done"],
      "the Request was stored after the upload before it",
    );
  } finally {
    built.close();
  }
});

pgTest("the running worker applies one Account's uploads in order", async () => {
  const built = build(true);
  try {
    const names = ["mounts", "pets", "questLog", "bags", "gear"];
    for (const [i, name] of names.entries()) {
      const response = await upload(
        built,
        body({ sections: [name, "char"], savedAt: fixture.savedAt + i * 10 }),
      );
      assert.equal(response.status, 202);
    }
    await built.inbox!.start();
    assert.equal(await built.store.settle("111111"), true);
    const states = await built.store.db.all<{ state: string; result: { stale: boolean } }>(
      `SELECT state, result FROM raw_uploads ORDER BY id`,
    );
    assert.deepEqual(
      states.map((row) => [row.state, row.result.stale]),
      names.map(() => ["done", false]),
      "no upload was applied after a newer one",
    );
    const [character] = await built.store.data.characters();
    assert.equal(character?.savedAt, fixture.savedAt + 40);
  } finally {
    built.close();
  }
});
