import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { forwardPathRequest } from "../../web/server/utils/path-api.ts";
import { createApp } from "../src/app.ts";
import { ContentStore } from "../src/content.ts";
import { coreResponse } from "./game-content-fixture.ts";
import { snapshot } from "./helpers.ts";
import { hasPostgres, postgresPerFile } from "./postgres-db.ts";

const pg = postgresPerFile();
const account = "a".repeat(64);
const origin = "https://playunbored.com";
const selection = { kind: "path", slug: "first-steps", locale: "en" };
async function setup() {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".web-paths-"));
  const built = createApp({
    dataDir: dir,
    database: pg("postgres"),
    companionToken: "c",
    plannerToken: "p",
    webOrigin: origin,
    log: () => {},
  });
  const { store } = built;
  await store.db.run("DELETE FROM content.paths");
  await store.db.run("DELETE FROM web.sessions");
  await store.game.importBuild("12.0.1.66337", coreResponse);
  const content = new ContentStore(store.db, store.game);
  await content.saveDraft({
    ...selection,
    tier: "basic",
    title: "First steps",
    description: "Begin here.",
    items: [
      {
        kind: "level",
        level: 70,
        name: "Reach level 70",
        source: { type: "other", text: "Play" },
        chance: false,
        note: "Keep going.",
      },
      {
        kind: "level",
        level: 80,
        name: "Reach level 80",
        source: { type: "other", text: "Play" },
        chance: false,
        note: "Keep going.",
      },
    ],
  });
  await content.publish("path", selection.slug);
  const now = Math.floor(Date.now() / 1000);
  await store.registerDevice({
    id: "web-device",
    name: "PC",
    secretHash: "hash",
    nowSeconds: now,
    pendingCap: 10,
  });
  await store.setDeviceStatus("web-device", "approved");
  await store.putSnapshot(
    snapshot({ char: { body: { level: 70 } } }, { account }),
    "web-device",
    now,
  );
  await store.putSnapshot(
    snapshot({ char: { body: { level: 80 } } }, { account, character: "Alt" }),
    "web-device",
    now,
  );
  await store.putSnapshot(
    snapshot({}, { account: "b".repeat(64), character: "Other" }),
    "other-device",
    now,
  );
  await store.db.run(
    "INSERT INTO web.sessions (id, account_id, device_id, created_at) VALUES (?, ?, ?, ?)",
    "live-session",
    account,
    "web-device",
    now,
  );
  const api = (
    route = "progress",
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    built.app.request(`/v1/web/paths/${route}`, {
      method,
      headers: {
        authorization: "Bearer live-session",
        origin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    ...built,
    api,
    content,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test.skipIf(!hasPostgres)(
  "website progress derives the Account from a live session and reports each Character",
  async () => {
    const { api, close } = await setup();
    try {
      const response = await api();
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const page = await response.json();
      assert.deepEqual(page.characters.map((c: { character: string }) => c.character).sort(), [
        "Alt",
        "Mira",
      ]);
      const mira = page.characters.find((c: { character: string }) => c.character === "Mira");
      assert.equal(mira.paths[0].done, 1);
      assert.equal(mira.paths[0].total, 2);
      assert.deepEqual(
        mira.paths[0].goals.map((g: { done: boolean }) => g.done),
        [true, false],
      );
      assert.equal(mira.active, null);
      assert.equal(JSON.stringify(page).includes(account), false);
      assert.equal((await api("progress?account=other")).status, 400);
      assert.equal(
        (await api("progress", "GET", undefined, { authorization: "Bearer p" })).status,
        401,
      );
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "website selection asks before replacement and refuses stale confirmation or another Account",
  async () => {
    const { api, content, store, close } = await setup();
    const chosen = { character: "Mira", realm: "Realm", path: selection };
    try {
      const selected = await api("active", "PUT", chosen);
      assert.equal(selected.status, 200, await selected.clone().text());
      assert.equal((await selected.json()).path.slug, selection.slug);
      await content.saveDraft({
        kind: "collection",
        slug: "mounts",
        locale: "en",
        title: "Mounts",
        description: "Collect mounts.",
        items: [
          {
            kind: "mount",
            id: 6,
            name: "Brown Horse",
            source: { type: "vendor", text: "Stable" },
            chance: false,
            note: "Collect it.",
          },
        ],
      });
      await content.publish("collection", "mounts");
      const next = { ...chosen, path: { kind: "collection", slug: "mounts", locale: "en" } };
      const conflict = await api("active", "PUT", next);
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).current.slug, selection.slug);
      assert.equal(
        (await api("active", "PUT", { ...next, expectedActive: selection })).status,
        200,
      );
      assert.equal(
        (await api("active", "PUT", { ...chosen, expectedActive: selection })).status,
        409,
      );
      const current = await store.activePaths.get({ account, character: "Mira", realm: "Realm" });
      assert.equal(current.path?.slug, "mounts", "website writes the existing in-game selection");
      const page = await (await api()).json();
      assert.equal(
        page.characters.find((c: { character: string }) => c.character === "Alt").active,
        null,
      );
      assert.equal((await api("active", "PUT", { ...chosen, character: "Other" })).status, 404);
      assert.equal(
        (await api("active", "PUT", { ...chosen, account: "b".repeat(64) })).status,
        400,
      );
      assert.equal(
        (
          await api("active", "PUT", {
            ...chosen,
            path: { ...selection, slug: "unpublished" },
            expectedActive: next.path,
          })
        ).status,
        400,
      );
      await store.activePaths.set({ account, character: "Mira", realm: "Realm", path: null });
      const cleared = await api("active", "PUT", { ...chosen, expectedActive: next.path });
      assert.equal(cleared.status, 409);
      assert.equal((await cleared.json()).current, null);
      assert.equal((await api("active", "PUT", { ...chosen, expectedActive: null })).status, 200);
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "website writes require same-origin JSON and limit both session and address",
  async () => {
    const { api, store, close } = await setup();
    const chosen = { character: "Mira", realm: "Realm", path: selection };
    try {
      const rejectedHeaders: Record<string, string>[] = [
        { origin: "https://elsewhere.example" },
        { origin: "" },
        { "sec-fetch-site": "cross-site" },
        { "sec-fetch-site": "same-site" },
        { "content-type": "text/plain" },
      ];
      for (const headers of rejectedHeaders) {
        assert.equal((await api("active", "PUT", chosen, headers)).status, 403);
      }
      for (let i = 0; i < 10; i++) {
        assert.equal(
          (await api("active", "PUT", chosen, { "x-forwarded-for": `192.0.2.${i}` })).status,
          200,
        );
      }
      assert.equal(
        (await api("active", "PUT", chosen, { "x-forwarded-for": "192.0.2.99" })).status,
        429,
      );
      // Fresh sessions cannot evade the address limit.
      for (let i = 0; i < 11; i++) {
        const id = `session-${i}`;
        await store.db.run(
          "INSERT INTO web.sessions (id, account_id, device_id, created_at) VALUES (?, ?, ?, ?)",
          id,
          account,
          "web-device",
          Math.floor(Date.now() / 1000),
        );
        assert.equal(
          (
            await api("active", "PUT", chosen, {
              authorization: `Bearer ${id}`,
              "x-forwarded-for": "192.0.2.100",
            })
          ).status,
          i === 10 ? 429 : 200,
        );
      }
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "closed, expired and revoked sessions cannot read or select Paths",
  async () => {
    const { api, store, close } = await setup();
    const chosen = { character: "Mira", realm: "Realm", path: selection };
    try {
      for (const change of [
        "UPDATE web.sessions SET ended_at = 1",
        "UPDATE web.sessions SET ended_at = NULL, created_at = 1",
        `UPDATE web.sessions SET created_at = ${Math.floor(Date.now() / 1000)}`,
      ]) {
        await store.db.run(change);
        if (change.includes("created_at = ") && !change.includes("NULL"))
          await store.setDeviceStatus("web-device", "revoked");
        assert.equal((await api()).status, 401);
        assert.equal((await api("active", "PUT", chosen)).status, 401);
      }
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "concurrent website picks cannot silently replace each other",
  async () => {
    const { api, content, close } = await setup();
    try {
      await content.saveDraft({
        kind: "collection",
        slug: "other",
        locale: "en",
        title: "Other mounts",
        description: "Collect mounts.",
        items: [
          {
            kind: "mount",
            id: 6,
            name: "Brown Horse",
            source: { type: "vendor", text: "Stable" },
            chance: false,
            note: "Collect it.",
          },
        ],
      });
      await content.publish("collection", "other");
      const responses = await Promise.all([
        api("active", "PUT", { character: "Mira", realm: "Realm", path: selection }),
        api("active", "PUT", {
          character: "Mira",
          realm: "Realm",
          path: { kind: "collection", slug: "other", locale: "en" },
        }),
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
      const selected = await responses.find((response) => response.status === 200)!.json();
      const conflict = await responses.find((response) => response.status === 409)!.json();
      assert.equal(conflict.current.slug, selected.path.slug);
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "website proxy reads and selects through the Server with a session and Postgres",
  async () => {
    const { app, close } = await setup();
    const transport: typeof fetch = async (input, init) => app.request(String(input), init);
    const input = {
      method: "GET" as const,
      sessionId: "live-session",
      serverUrl: "http://server",
      siteOrigin: origin,
      ip: "192.0.2.1",
    };
    try {
      const read = await forwardPathRequest(input, transport);
      assert.equal(read.status, 200);
      assert.equal((await read.json()).characters.length, 2);
      const body = { character: "Mira", realm: "Realm", path: selection };
      const csrf = await forwardPathRequest({ ...input, method: "PUT", body }, transport);
      assert.equal(csrf.status, 403);
      const selected = await forwardPathRequest(
        {
          ...input,
          method: "PUT",
          origin,
          fetchSite: "same-origin",
          contentType: "application/json",
          body,
        },
        transport,
      );
      assert.equal(selected.status, 200);
      assert.equal(selected.headers.get("cache-control"), "private, no-store");
      const updated = await (await forwardPathRequest(input, transport)).json();
      assert.equal(
        updated.characters.find((row: { character: string }) => row.character === "Mira").active
          .slug,
        selection.slug,
      );
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "ending a session during an Account update denies an in-flight read without deadlocking",
  async () => {
    const { api, close } = await setup();
    const sql = pg("postgres")!;
    let read: Promise<Response> | undefined;
    try {
      // Another Device's erasure already owns this Account and will end its sessions.
      await sql.begin(async (closing) => {
        await closing`SELECT pg_advisory_xact_lock(hashtext(${`account:${account}`}))`;
        read = Promise.resolve(api());
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
          const rows = await sql`SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE a.datname = current_database() AND l.locktype = 'advisory' AND NOT l.granted`;
          waiting = rows.length > 0;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, "the website read reached the pending Account update");
        await closing`SET LOCAL statement_timeout = '500ms'`;
        await closing`UPDATE web.sessions SET ended_at = 1 WHERE id = 'live-session'`;
      });
      assert.equal((await read!).status, 401);
    } finally {
      await read?.catch(() => {});
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "Today API creates private sets from a sealed live session and rejects other Accounts and closed sessions",
  async () => {
    const { app, store, close } = await setup();
    try {
      const now = Math.floor(Date.now() / 1000);
      await store.putSnapshot(
        snapshot(
          {
            professions: {
              body: { list: [{ skillLine: 333, name: "Enchanting", skill: 145, max: 150 }] },
            },
          },
          { account },
        ),
        "web-device",
        now,
      );
      const get = (name = "Mira", session = "live-session") =>
        app.request(`/v1/web/today?game=retail&realm=Realm&character=${name}`, {
          headers: { authorization: `Bearer ${session}` },
        });
      const response = await get();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const body = await response.json();
      assert.equal(body.sets[0].goals[0].title, "Open your Enchanting window once");
      assert.equal((await get("Other")).status, 404);
      assert.equal((await get("Mira", "missing")).status, 401);
      await store.db.run("UPDATE web.sessions SET ended_at = ? WHERE id = 'live-session'", now);
      assert.equal((await get()).status, 401);
    } finally {
      close();
    }
  },
);
