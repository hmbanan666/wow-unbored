import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "vite-plus/test";

import { packIds, sectionHash, suggestionsBodySchema } from "@unbored/contracts";

import { createApp } from "../src/app.ts";
import type { SectionRow } from "../src/data.ts";
import { loadCatalog, suggest, type SuggestInput } from "../src/suggestions.ts";

const companion = "companion-test-token";
const planner = "planner-test-token";
const NOW = Date.UTC(2026, 9, 30, 12, 0) / 1000;

function section(name: string, body: Record<string, unknown>): SectionRow {
  return {
    ownerKind: "char",
    ownerId: "c",
    section: name,
    v: 1,
    hash: "",
    at: NOW,
    savedAt: NOW,
    updatedAt: NOW,
    src: null,
    unknown: false,
    bytes: 0,
    body,
  };
}

function input(bodies: Record<string, Record<string, unknown>>, extra: Partial<SuggestInput> = {}) {
  return {
    now: NOW,
    sections: new Map(Object.entries(bodies).map(([name, body]) => [name, section(name, body)])),
    altQuests: [],
    characters: 1,
    ...extra,
  } satisfies SuggestInput;
}

const played = (...mapIDs: number[]) => ({
  list: [{ start: NOW - 3600, stop: NOW, maps: mapIDs.map((mapID) => ({ mapID, minutes: 30 })) }],
});

const hallowsEnd = {
  events: [
    {
      title: "Hallow's End",
      kind: "HOLIDAY",
      starts: "2026-10-18 10:00",
      ends: "2026-11-01 11:00",
    },
  ],
};

test("an active holiday suggests what is left of it, mount first, and expires with it", () => {
  const list = suggest(input({ calendar: hallowsEnd, char: { faction: "Horde" } }));
  const event = list.find((item) => item.kind === "event");
  assert.ok(event, JSON.stringify(list));
  assert.equal(event.title, "Hallow's End");
  assert.equal(event.rewards[0], "{mount:219}");
  assert.ok(event.rewards.includes("{ach:291}"));
  assert.ok(
    !event.rewards.some((token) => token === "{ach:965}" || token === "{ach:963}"),
    "a faction pair is not linked",
  );
  assert.equal(event.expiresAt, Date.UTC(2026, 10, 1, 11, 0) / 1000);
  assert.deepEqual(event.reason, { kind: "ends", at: event.expiresAt });
  assert.equal(event.request.topic, "suggestion");
  assert.equal(event.request.suggestionId, event.id);
  assert.ok(!event.request.wish.includes("{"), "the wish is plain words");
});

test("a finished holiday, or one weeks away, suggests nothing", () => {
  const done = suggest(
    input({
      calendar: hallowsEnd,
      achievements: { ids: packIds([291, 965, 963, 1656, 1657]) },
      mounts: { ids: packIds([219]) },
    }),
  );
  assert.equal(done.filter((item) => item.kind === "event").length, 0);
  const later = suggest(
    input({
      calendar: {
        events: [{ title: "Hallow's End", starts: "2026-11-20 10:00", ends: "2026-11-30 10:00" }],
      },
    }),
  );
  assert.equal(later.filter((item) => item.kind === "event").length, 0);
});

test("achievements and rares come from the zones the player has been in", () => {
  const list = suggest(input({ sessions: played(125, 554) }));
  const ach = list.find((item) => item.kind === "achievement");
  assert.equal(ach?.id, "ach:1956");
  assert.equal(ach?.titleToken, "{ach:1956}");
  assert.deepEqual(ach?.reason, { kind: "near", mapID: 125 });
  const rare = list.find((item) => item.kind === "rare");
  assert.equal(rare?.id, "rare:rare-huolon");
  assert.equal(rare?.mapID, 554);

  const elsewhere = suggest(input({ sessions: played(2339) }));
  assert.equal(elsewhere.filter((item) => item.kind !== "collection").length, 0);

  const looted = suggest(
    input({
      sessions: played(125, 554),
      achievements: { ids: packIds([1956]) },
      questsDone: { ids: packIds([33311]) },
    }),
  );
  assert.equal(looted.filter((item) => item.kind !== "collection").length, 0);
});

test("mounts nobody owns are suggested, nearby ones first, at most two", () => {
  const catalog = loadCatalog();
  const list = suggest(input({ sessions: played(109) }));
  const mounts = list.filter((item) => item.kind === "collection");
  assert.equal(mounts.length, 2);
  assert.equal(mounts[0]?.id, "mount:183");
  assert.equal(mounts[0]?.mapID, 109);
  for (const item of mounts) {
    const id = Number(/\{mount:(\d+)\}/.exec(item.rewards[0]!)?.[1]);
    assert.ok(
      catalog.farm.some((row) => row.mounts?.includes(id)),
      `${id} is a catalog mount`,
    );
  }
  const owned = suggest(input({ sessions: played(109), mounts: { ids: packIds([183]) } }));
  assert.ok(!owned.some((item) => item.rewards.includes("{mount:183}")));
});

test("the Account angle adds a why and lifts a rare no alt has looted", () => {
  const alone = suggest(input({ sessions: played(554) }));
  const many = suggest(input({ sessions: played(554) }, { characters: 7, altQuests: [new Set()] }));
  const rare = many.find((item) => item.kind === "rare");
  assert.equal(rare?.why, "None of your 7 characters has it yet");
  assert.deepEqual(rare?.reason, { kind: "near", mapID: 554 });
  assert.equal(alone.find((item) => item.kind === "rare")?.why, undefined);
  const lootedOnAlt = suggest(
    input({ sessions: played(554) }, { characters: 2, altQuests: [new Set([33311])] }),
  );
  assert.equal(lootedOnAlt.find((item) => item.kind === "rare")?.why, undefined);
});

test("the list is ranked, capped at six and two per rule, with limits on every field", () => {
  const list = suggest(
    input(
      { calendar: hallowsEnd, sessions: played(125, 554, 109, 70) },
      { characters: 3, altQuests: [new Set()] },
    ),
  );
  assert.ok(list.length <= 6);
  assert.equal(list[0]?.kind, "event");
  const perKind = new Map<string, number>();
  for (const item of list) perKind.set(item.kind, (perKind.get(item.kind) ?? 0) + 1);
  for (const [kind, count] of perKind) assert.ok(count <= 2, kind);
  const parsed = suggestionsBodySchema.safeParse({
    v: 1,
    computedAt: NOW,
    characters: { x: list },
  });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

test("the shared fixture is what the rules make for Mira", () => {
  const file = new URL("../../../packages/contracts/fixtures/suggestions.json", import.meta.url);
  const list = suggest(
    input(
      { calendar: hallowsEnd, sessions: played(554, 109), char: { faction: "Horde" } },
      { characters: 2, altQuests: [new Set()] },
    ),
  );
  const body = { v: 1, computedAt: NOW, characters: { "Silvermoon-Mira": list } };
  if (process.env.UNBORED_WRITE_FIXTURES === "1") {
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  }
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), body);
});

const snapshot = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/fixtures/snapshot.json", import.meta.url),
    "utf8",
  ),
) as {
  account: string;
  character: string;
  realm: string;
  sections: Record<
    string,
    { scope: string; v: number; hash: string; body: Record<string, unknown> }
  >;
};

function withIdeas() {
  const next = structuredClone(snapshot);
  const add = (name: string, scope: string, body: Record<string, unknown>) => {
    next.sections[name] = { scope, v: 1, body, hash: sectionHash(body) };
  };
  add("calendar", "account", hallowsEnd);
  add("sessions", "char", played(554));
  return next;
}

async function mcp(app: ReturnType<typeof createApp>["app"], name: string, args: object) {
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
  return { isError: body.result.isError === true, text: body.result.content[0]!.text };
}

test("an upload schedules ideas; the Companion and the Planner read them", async () => {
  const { app, store, close } = createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-ideas-")),
    log: () => {},
  });
  const get = () =>
    app.request("/v1/suggestions", { headers: { authorization: `Bearer ${companion}` } });
  try {
    assert.equal((await app.request("/v1/suggestions")).status, 401);
    const empty = (await (await get()).json()) as Record<string, unknown>;
    assert.deepEqual(empty, { v: 1, computedAt: 0, characters: {} });
    assert.equal((await mcp(app, "get_suggestions", {})).isError, true);

    const posted = await app.request("/v1/snapshot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${companion}`,
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      body: gzipSync(Buffer.from(JSON.stringify(withIdeas()))),
    });
    assert.equal(posted.status, 200, await posted.clone().text());
    const { account } = (await posted.json()) as { account: string };
    assert.equal(store.suggestions.pending(account), true, "debounced, not run inline");
    assert.equal(store.suggestions.computeAccount(account, NOW), 1);

    const body = await (await get()).json();
    const parsed = suggestionsBodySchema.safeParse(body);
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    const list = parsed.data!.characters[`${snapshot.realm}-${snapshot.character}`];
    assert.ok(list?.some((item) => item.id === "rare:rare-huolon"));
    assert.ok(list?.some((item) => item.kind === "event"));

    const tool = await mcp(app, "get_suggestions", { account });
    assert.equal(tool.isError, false, tool.text);
    const read = JSON.parse(tool.text) as { characters: { character: string; list: unknown[] }[] };
    assert.equal(read.characters[0]?.character, snapshot.character);
    assert.equal(read.characters[0]?.list.length, list?.length);
  } finally {
    close();
  }
});

test("a Request from a picked idea keeps its id and a copy of it", async () => {
  const { app, close } = createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-ideas-")),
    log: () => {},
  });
  try {
    const [idea] = suggest(input({ sessions: played(554) }));
    assert.ok(idea);
    const send = (body: Record<string, unknown>) =>
      app.request("/v1/requests", {
        method: "POST",
        headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const response = await send({
      id: "req-idea-1",
      character: "Mira",
      realm: "Silvermoon",
      type: "plan",
      mode: "roam",
      topic: "suggestion",
      wish: idea.request.wish,
      suggestionId: idea.id,
      suggestion: { ...idea, rewards: [...idea.rewards, "not a token"], request: undefined },
    });
    assert.equal(response.status, 201, await response.clone().text());
    const stored = (await response.json()) as Record<string, unknown>;
    assert.equal(stored.topic, "suggestion");
    assert.equal(stored.budget, null, "ideas never carry a time");
    assert.equal(stored.suggestionId, idea.id);
    const copy = stored.suggestion as Record<string, unknown>;
    assert.equal(copy.goal, idea.goal);
    assert.deepEqual(copy.rewards, idea.rewards, "only link tokens are kept");

    const listed = await mcp(app, "list_requests", {});
    assert.ok(listed.text.includes(idea.id));

    const broken = await send({
      id: "req-idea-2",
      character: "Mira",
      realm: "Silvermoon",
      type: "plan",
      mode: "roam",
      topic: "suggestion",
      suggestion: "nope",
    });
    assert.equal(broken.status, 201, "a malformed copy is dropped, the Request still goes");
    const kept = (await broken.json()) as Record<string, unknown>;
    assert.equal(kept.suggestion, null);
  } finally {
    close();
  }
});
