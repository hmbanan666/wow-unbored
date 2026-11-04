import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "vite-plus/test";
import { packIds, suggestionsBodySchema } from "@unbored/contracts";
import { ActivePaths } from "../src/active-path.ts";
import { createApp } from "../src/app.ts";
import { ContentStore } from "../src/content.ts";
import { coreResponse } from "./game-content-fixture.ts";
import { snapshot, NOW, ACCOUNT_KEY } from "./helpers.ts";
import { hasPostgres, postgresPerFile } from "./postgres-db.ts";

const pg = postgresPerFile();
const selection = { kind: "collection", slug: "first-mounts", locale: "en" };
const collection = {
  ...selection,
  title: "First mounts",
  description: "Mounts to collect.",
  items: [
    {
      kind: "mount",
      id: 6,
      name: "Brown Horse",
      required: true,
      source: { type: "vendor", text: "Stable" },
      chance: true,
      note: "Collect it.",
    },
  ],
};
const who = { account: ACCOUNT_KEY, character: "Mira", realm: "Realm" };
async function setup() {
  const dir = mkdtempSync(path.join(import.meta.dirname, ".active-path-"));
  const built = createApp({
    dataDir: dir,
    database: pg("postgres"),
    companionToken: "c",
    plannerToken: "p",
    log: () => {},
  });
  await built.store.db.run("DELETE FROM content.paths");
  await built.store.game.importBuild("12.0.1.66337", coreResponse);
  const content = new ContentStore(built.store.db, built.store.game);
  await content.saveDraft(collection);
  await content.publish("collection", collection.slug);
  await built.store.putSnapshot(
    snapshot({ char: { body: { level: 80, lang: "en" } } }),
    "device",
    NOW,
  );
  const api = (method: string, body?: unknown, token = "p") =>
    built.app.request(`/v1/paths/active?${new URLSearchParams(who)}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    ...built,
    content,
    api,
    close() {
      built.store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test.skipIf(!hasPostgres)(
  "API selects, replaces and clears one active Path for an exact Character",
  async () => {
    const { api, content, close } = await setup();
    try {
      assert.equal((await api("PUT", { ...who, path: selection }, "c")).status, 401);
      const initial = await api("GET");
      assert.equal(initial.status, 200, await initial.clone().text());
      assert.equal((await initial.json()).path, null);
      const chosen = await api("PUT", { ...who, path: selection });
      assert.equal(chosen.status, 200);
      assert.equal((await chosen.json()).path.slug, "first-mounts");
      await content.saveDraft({ ...collection, slug: "more-mounts" });
      await content.publish("collection", "more-mounts");
      await api("PUT", { ...who, path: { ...selection, slug: "more-mounts" } });
      assert.equal((await (await api("GET")).json()).path.slug, "more-mounts");
      await api("PUT", { ...who, path: null });
      assert.equal((await (await api("GET")).json()).path, null);
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "owner MCP selects the same Path; invalid, draft and foreign selections leave it intact",
  async () => {
    const { app, api, content, store, close } = await setup();
    const mcp = async (name: string, args: unknown) => {
      const response = await app.request("/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer p",
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
      return (await response.json()).result;
    };
    try {
      const picked = await mcp("set_active_path", { ...who, path: selection });
      assert.equal(picked.isError, false, JSON.stringify(picked));
      const read = await mcp("get_active_path", who);
      assert.deepEqual(JSON.parse(read.content[0].text), await (await api("GET")).json());
      await content.saveDraft({ ...collection, slug: "draft" });
      for (const path of [
        { ...selection, slug: "draft" },
        { ...selection, kind: "guide" },
        { ...selection, locale: "ru" },
      ]) {
        assert.equal((await api("PUT", { ...who, path })).status, 400);
      }
      await store.putSnapshot(
        snapshot({}, { account: "222222#1", character: "Other" }),
        "other",
        NOW,
      );
      assert.equal((await api("PUT", { ...who, account: "222222", path: selection })).status, 400);
      assert.equal(
        (await api("PUT", { account: who.account, character: who.character, path: selection }))
          .status,
        400,
      );
      assert.equal((await (await api("GET")).json()).path.slug, selection.slug);
      const cleared = await mcp("set_active_path", { ...who, path: null });
      assert.equal(cleared.isError, false);
      assert.equal((await (await api("GET")).json()).path, null);
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "Continue Idea is current, first, localized and removed on completion or clearing",
  async () => {
    const { api, store, content, close } = await setup();
    const ideas = () => store.suggestionsForDevice("device");
    try {
      await api("PUT", { ...who, path: selection });
      const character = (await store.data.characters(ACCOUNT_KEY))[0]!;
      assert.deepEqual(
        await store.suggestions.forCharacter(character, NOW),
        await store.suggestions.forCharacter(character, NOW + 60),
        "unchanged polling does not rewrite the helper file",
      );
      const body = await ideas();
      assert.equal(suggestionsBodySchema.safeParse(body).success, true);
      const idea = body.characters["Realm-Mira"]?.[0];
      assert.equal(idea?.kind, "path");
      assert.equal(idea.title, "Continue your Path");
      assert.deepEqual(idea.progress, { done: 0, total: 1 });
      assert.deepEqual(idea.path, { ...selection, version: 1 });
      assert.equal(idea.goal, "First mounts");
      await store.putSnapshot(
        snapshot({ char: { body: { level: 80, lang: "ru" } } }),
        "device",
        NOW + 1,
      );
      assert.equal((await ideas()).characters["Realm-Mira"][0].title, "Продолжи свой Путь");
      await store.putSnapshot(snapshot({}, { character: "Alt" }), "device", NOW + 2);
      assert.ok(!(await ideas()).characters["Realm-Alt"]?.some((idea) => idea.kind === "path"));
      await content.saveDraft({ ...collection, title: "New first mounts" });
      await content.publish("collection", selection.slug);
      assert.equal((await ideas()).characters["Realm-Mira"][0].path?.version, 2);
      await store.putSnapshot(
        snapshot({ mounts: { body: { ids: packIds([6]) } } }),
        "device",
        NOW + 3,
      );
      assert.ok(!(await ideas()).characters["Realm-Mira"]?.some((idea) => idea.kind === "path"));
      assert.equal((await (await api("GET")).json()).path.done, 1);
      await api("PUT", { ...who, path: null });
      assert.ok(!(await ideas()).characters["Realm-Mira"]?.some((idea) => idea.kind === "path"));
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "concurrent selections survive reopening; Forget my data erases the selection",
  async () => {
    const { api, store, content, close } = await setup();
    try {
      await store.registerDevice({
        id: "device",
        name: "PC",
        secretHash: "test-hash",
        nowSeconds: NOW,
        pendingCap: 10,
      });
      await store.setDeviceStatus("device", "approved");
      await content.saveDraft({ ...collection, slug: "other-mounts" });
      await content.publish("collection", "other-mounts");
      const results = await Promise.all([
        api("PUT", { ...who, path: selection }),
        api("PUT", { ...who, path: { ...selection, slug: "other-mounts" } }),
      ]);
      assert.ok(results.every((response) => response.status === 200));
      const chosen = (await (await api("GET")).json()).path;
      assert.ok([selection.slug, "other-mounts"].includes(chosen.slug));
      const reopened = new ActivePaths(store.db, store.data, store.game);
      assert.equal((await reopened.get(who)).path?.slug, chosen.slug);
      const body = await store.suggestionsForDevice("device");
      assert.equal(body.characters["Realm-Mira"].filter((idea) => idea.kind === "path").length, 1);
      await store.forgetDevice("device", NOW + 1);
      assert.equal((await api("GET")).status, 400);
      await store.putSnapshot(snapshot({}), "new-device", NOW + 2);
      assert.equal((await (await api("GET")).json()).path, null);
    } finally {
      close();
    }
  },
);

test.skipIf(!hasPostgres)(
  "a picked Request retains its version after selection and publication change",
  async () => {
    const { app, api, content, store, close } = await setup();
    try {
      await api("PUT", { ...who, path: selection });
      const idea = (await store.suggestionsForDevice("device")).characters["Realm-Mira"][0];
      await content.saveDraft({ ...collection, title: "Updated mounts" });
      await content.publish("collection", collection.slug);
      await api("PUT", { ...who, path: null });
      const request = {
        ...who,
        id: "picked-path",
        type: "plan",
        mode: "roam",
        topic: "suggestion",
        suggestionId: idea.id,
        suggestion: idea,
      };
      const post = (body: unknown) =>
        app.request("/v1/requests", {
          method: "POST",
          headers: { authorization: "Bearer c", "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const response = await post(request);
      assert.equal(response.status, 201, await response.clone().text());
      assert.deepEqual((await store.requestById("picked-path"))?.suggestion?.path, {
        ...selection,
        version: 1,
      });
      assert.equal((await post(request)).status, 200, "retry remains idempotent");
      assert.equal(
        (await post({ ...request, id: "broken-path", suggestion: { ...idea, path: undefined } }))
          .status,
        400,
      );
    } finally {
      close();
    }
  },
);
