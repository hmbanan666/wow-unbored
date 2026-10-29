import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { accountKey, mergeProfile } from "../src/store.ts";

const companion = "companion-history-token";
const planner = "planner-history-token";

function build() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-history-"));
  return createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    webhook: { url: "", key: "", headerName: "" },
    log: () => {},
  });
}

type App = ReturnType<typeof build>["app"];

function send(app: App, url: string, body: unknown) {
  return app.request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function mcp(app: App, name: string, args: Record<string, unknown>) {
  const headers = {
    authorization: `Bearer ${planner}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
      },
    }),
  });
  const response = await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = (await response.json()) as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  return {
    isError: body.result.isError === true,
    value: JSON.parse(body.result.content[0]!.text) as Record<string, unknown>,
  };
}

test("an empty logout snapshot never overwrites good profile fields", () => {
  const good = {
    v: 1,
    context: { level: 80, gold: 1234567, ilvl: 610, specID: 64, zone: "Dornogal" },
    bags: [{ itemID: 6948, count: 1 }],
    collections: { mounts: 212, toys: 300 },
  };
  const empty = {
    v: 1,
    savedAt: 2000,
    context: { level: 80, gold: 0, ilvl: 0, specID: 0, zone: "" },
    bags: {},
  };
  const merged = mergeProfile(good, empty) as typeof good & { savedAt: number };
  assert.equal(merged.context.gold, 1234567);
  assert.equal(merged.context.ilvl, 610);
  assert.equal(merged.context.zone, "Dornogal");
  assert.deepEqual(merged.bags, good.bags);
  assert.equal(merged.collections.mounts, 212);
  assert.equal(merged.savedAt, 2000);
  const fresh = mergeProfile(good, { bags: [{ itemID: 1, count: 2 }] }) as typeof good;
  assert.deepEqual(fresh.bags, [{ itemID: 1, count: 2 }], "a non-empty list replaces the old one");
});

test("account keys join the licenses of one Battle.net account", () => {
  assert.equal(accountKey("12345678#1"), "12345678");
  assert.equal(accountKey("12345678#2"), "12345678");
  assert.equal(accountKey("WOWACCOUNT"), "WOWACCOUNT");
});

test("history, account scope, and personal advice over MCP", async () => {
  const { app, close } = build();
  try {
    const profile = (character: string, savedAt: number, extra: Record<string, unknown>) =>
      send(app, "/v1/profile", {
        character,
        realm: "Silvermoon",
        account: "12345678#1",
        savedAt,
        profile: { v: 1, ...extra },
      });
    assert.equal(
      (
        await profile("Mira", 1000, {
          context: { gold: 500, level: 80 },
          bags: [{ itemID: 210796, count: 12 }],
        })
      ).status,
      200,
    );
    assert.equal(
      (await profile("Mira", 1100, { context: { gold: 0, level: 80 }, bags: {} })).status,
      200,
    );
    assert.equal(
      (
        await profile("Toma", 1050, {
          professions: [{ skillLine: 171, name: "Alchemy", skill: 75, max: 100 }],
        })
      ).status,
      200,
    );

    const mira = await mcp(app, "get_player_profile", { character: "Mira", realm: "Silvermoon" });
    const stored = mira.value.profile as {
      account: string;
      profile: { context: { gold: number }; bags: unknown[] };
    };
    assert.equal(stored.profile.context.gold, 500, "the logout zero did not win");
    assert.equal(stored.profile.bags.length, 1);
    assert.equal(stored.account, "12345678");
    assert.equal((mira.value.accounts as unknown[]).length, 1);

    const account = await mcp(app, "get_player_profile", { account: "12345678#1" });
    assert.equal(account.isError, false);
    assert.deepEqual(
      (account.value.characters as { character: string }[]).map((row) => row.character).sort(),
      ["Mira", "Toma"],
    );

    const asked = await send(app, "/v1/requests", {
      id: "req-h-1",
      character: "Mira",
      realm: "Silvermoon",
      type: "question",
      question: "What can I do here?",
      lang: "en",
    });
    assert.equal(asked.status, 201);
    const answered = await mcp(app, "answer_request", {
      requestId: "req-h-1",
      message: "Look for the rare to the north.",
    });
    assert.equal(answered.isError, false);
    await send(app, "/v1/requests", {
      id: "req-h-2",
      character: "Toma",
      realm: "Silvermoon",
      type: "item",
      item: { itemID: 210796 },
    });
    await mcp(app, "fail_request", { requestId: "req-h-2", reason: "No idea, sorry." });

    const history = await mcp(app, "get_player_history", {
      character: "Mira",
      realm: "Silvermoon",
    });
    const kinds = (history.value.entries as { kind: string }[]).map((entry) => entry.kind);
    assert.ok(
      kinds.includes("request") && kinds.includes("answer") && kinds.includes("profile"),
      kinds.join(),
    );
    const scoped = await mcp(app, "get_player_history", {
      account: "12345678",
      kinds: ["failed", "request"],
    });
    const rows = scoped.value.entries as { kind: string; character: string; account: string }[];
    assert.ok(rows.some((row) => row.character === "Toma" && row.kind === "failed"));
    assert.ok(rows.every((row) => row.account === "12345678"));
    const snapshots = await mcp(app, "get_player_history", {
      character: "Mira",
      includeSnapshots: true,
      kinds: ["profile"],
    });
    assert.equal((snapshots.value.snapshots as unknown[]).length, 2);

    const advice = await mcp(app, "put_item_advice", {
      character: "Mira",
      realm: "Silvermoon",
      items: [
        {
          itemID: 210796,
          action: "send",
          line: "Send to Toma (Alchemy): mail",
          lineRu: "Отправь Томе (алхимия): почтой",
          to: "Toma",
        },
      ],
    });
    assert.equal(advice.isError, false, JSON.stringify(advice.value));
    const rude = await mcp(app, "put_item_advice", {
      character: "Mira",
      realm: "Silvermoon",
      items: [{ itemID: 1, action: "info", line: "Delete it" }],
    });
    assert.equal(rude.isError, true);

    const download = await app.request("/v1/advice", {
      headers: { authorization: `Bearer ${companion}` },
    });
    assert.equal(download.status, 200);
    const body = (await download.json()) as {
      characters: { character: string; items: { itemID: number; to: string }[] }[];
    };
    assert.equal(body.characters.length, 1);
    assert.equal(body.characters[0]!.items[0]!.to, "Toma");

    const tools = await app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${planner}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    });
    const names = (
      (await tools.json()) as { result: { tools: { name: string }[] } }
    ).result.tools.map((t) => t.name);
    assert.ok(names.includes("get_player_history") && names.includes("put_item_advice"));
  } finally {
    close();
  }
});
