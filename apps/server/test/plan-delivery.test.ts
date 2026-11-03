import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import { cleanPlan, encodeUnb1, type Plan } from "../src/plan.ts";
import { planForAddon, truncateUtf8 } from "../src/plan-delivery.ts";
import { storage } from "./backend.ts";

test("all Companion plan reads adapt notes to the addon without changing the stored Plan", async () => {
  const { app, close } = createApp({
    ...storage(),
    companionToken: "companion-test-token",
    plannerToken: "planner-test-token",
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-plan-delivery-")),
    log: () => {},
  });
  const companion = { authorization: "Bearer companion-test-token" };
  const note = "я".repeat(300);
  try {
    const request = await app.request("/v1/requests", {
      method: "POST",
      headers: { ...companion, "content-type": "application/json" },
      body: JSON.stringify({ id: "req-notes", character: "Hero", mode: "fun" }),
    });
    assert.equal(request.status, 201);
    const put = await app.request("/v1/plan", {
      method: "PUT",
      headers: {
        authorization: "Bearer planner-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: "req-notes",
        tasks: [
          { id: "one", title: "Go", note },
          { id: "two", title: "Then", note: "a" + note },
          { id: "three", title: "Short", note: "Коротко" },
          { id: "four", title: "No note" },
          { id: "five", title: "At the limit", note: "я".repeat(200) },
        ],
      }),
    });
    assert.equal(put.status, 200);
    const original = (await put.json()) as { id: number; plan: string; stored: Plan };
    const trimmed = {
      ...original.stored,
      tasks: original.stored.tasks.map((task, index) =>
        index < 2 ? { ...task, note: (index === 1 ? "a" : "") + "я".repeat(198) + "…" } : task,
      ),
    };
    for (const [version, full] of [
      ["0.10.0", false],
      [undefined, true],
      ["", false],
      ["unknown", false],
      ["0.11", false],
      ["0.11.0+..", false],
      ["0.12.0-..", false],
      ["0.9.99", false],
      ["0.11.0-beta.1", false],
      ["0.11.0", true],
      ["v0.11.0", true],
      ["0.11.0+build.1", true],
      ["0.11.1", true],
      ["0.12.0", true],
      ["1.0.0", true],
      ["0.10.9", false],
      ["0.11.0", true],
    ] as const) {
      for (const endpoint of ["/v1/plan", "/v1/requests/latest", "/v1/requests/req-notes"]) {
        const headers: Record<string, string> = { ...companion };
        if (version !== undefined) headers["X-Unbored-Addon-Version"] = version;
        const response = await app.request(endpoint, { headers });
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          id: number | string;
          plan: string;
          planId?: number;
        };
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.from(body.plan.slice(5), "base64"),
        );
        const plan = JSON.parse(decoded) as Plan;
        const label = `${endpoint}, version ${version}`;
        assert.deepEqual(plan, full ? original.stored : trimmed, label);
        assert.equal(endpoint === "/v1/plan" ? body.id : body.planId, original.id);
        if (full) {
          assert.equal(body.plan, original.plan, "modern delivery keeps the original encoding");
          assert.equal(Buffer.byteLength(plan.tasks[0].note!), 600);
        } else {
          for (const task of plan.tasks)
            assert.ok(Buffer.byteLength(task.note ?? "") <= 400, label);
        }
      }
    }
  } finally {
    close();
  }
});

test("missing headers use the Device's latest currency data, with full notes when evidence is absent", async () => {
  const { app, store, close } = createApp({
    ...storage(),
    companionToken: "companion-test-token",
    plannerToken: "planner-test-token",
    dataDir: mkdtempSync(path.join(tmpdir(), "unbored-note-evidence-")),
    log: () => {},
  });
  const secret = "notes-device-secret";
  const other = "other-device-secret";
  const note = "я".repeat(300);
  const call = (url: string, bearer: string, body: unknown, method = "POST") =>
    app.request(url, {
      method,
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const upload = async (
    savedAt: number,
    body: unknown,
    options: { bearer?: string; character?: string; v?: number } = {},
  ) => {
    const response = await call("/v1/snapshot", options.bearer ?? secret, {
      schema: 2,
      account: "notes-account",
      character: options.character ?? "Hero",
      realm: "Realm",
      savedAt,
      sections: {
        currencies: { scope: "char", v: options.v ?? 1, at: savedAt, body },
      },
    });
    assert.equal(response.status, 200);
  };
  const expectNotes = async (full: boolean, version?: string) => {
    for (const endpoint of ["/v1/plan", "/v1/requests/latest", "/v1/requests/req-evidence"]) {
      const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
      if (version !== undefined) headers["X-Unbored-Addon-Version"] = version;
      const response = await app.request(endpoint, { headers });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { plan: string };
      const plan = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(body.plan.slice(5), "base64")),
      ) as Plan;
      assert.equal(plan.tasks[0].note, full ? note : "я".repeat(198) + "…", endpoint);
    }
  };
  try {
    for (const [deviceId, bearer] of [
      ["notes-device", secret],
      ["other-device", other],
    ]) {
      assert.equal(
        (await call("/v1/devices/register", bearer, { deviceId, secret: bearer })).status,
        201,
      );
      await store.setDeviceStatus(deviceId, "approved");
    }
    assert.equal(
      (
        await call("/v1/requests", secret, {
          id: "req-evidence",
          character: "Hero",
          realm: "Realm",
          mode: "fun",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call(
          "/v1/plan",
          "planner-test-token",
          {
            requestId: "req-evidence",
            tasks: [{ id: "one", title: "Go", note }],
          },
          "PUT",
        )
      ).status,
      200,
    );

    await expectNotes(true); // No data must preserve today's full notes.
    const old = { list: [{ id: 3008, quantity: 1 }] };
    const modern = { list: [{ id: 3008, quantity: 1, name: "Камни" }] };
    await upload(100, old, { bearer: other, character: "Other" });
    await expectNotes(true); // Another Device's data is not evidence.
    await upload(100, old);
    await expectNotes(false);
    await expectNotes(true, "0.11.0"); // Header wins over old data.
    await upload(200, modern);
    await expectNotes(true);
    await expectNotes(false, "0.10.0"); // Header wins over modern data.
    await expectNotes(false, "unknown"); // Present malformed headers keep the safe cap.
    await upload(150, old);
    await expectNotes(true); // A delayed stale upload cannot undo the upgrade.
    await upload(300, old);
    await expectNotes(false); // A later downgrade is respected.
    await upload(400, modern, { character: "Alt" });
    await expectNotes(true); // Use the latest Character on this Device.
    await upload(500, { list: [] }, { character: "Alt" });
    await expectNotes(true); // Empty data is not evidence of an older addon.
    await upload(600, { list: [{ unexpected: true }] }, { character: "Alt" });
    await expectNotes(true);
    await upload(700, old, { character: "Alt", v: 2 });
    await expectNotes(true); // Unknown future Section shapes are not older addons.
    await upload(800, old, { character: "Alt" });
    await expectNotes(false);
    assert.equal(
      (
        await call("/v1/snapshot", secret, {
          schema: 2,
          account: "notes-account",
          character: "New",
          realm: "Realm",
          savedAt: 900,
          sections: { char: { scope: "char", v: 1, at: 900, body: { level: 80 } } },
        })
      ).status,
      200,
    );
    await expectNotes(true); // A newer Character with no marker must not inherit old evidence.
    await upload(1000, old, { bearer: other, character: "Shared" });
    assert.equal(
      (
        await call("/v1/snapshot", secret, {
          schema: 2,
          account: "notes-account",
          character: "Shared",
          realm: "Realm",
          savedAt: 1100,
          sections: { char: { scope: "char", v: 1, at: 1100, body: { level: 80 } } },
        })
      ).status,
      200,
    );
    await expectNotes(true); // A Device switch does not inherit another PC's currency evidence.
  } finally {
    close();
  }
});

test("explicit versions and short notes do not read Game data", async () => {
  const noRead = async (): Promise<never> => {
    throw new Error("This delivery must not query currency evidence");
  };
  const plan = cleanPlan({ tasks: [{ id: "one", title: "Go", note: "я".repeat(300) }] }, 1);
  const stored = { id: 1, createdAt: 1, plan, unb1: encodeUnb1(plan) };
  assert.equal(await planForAddon(stored, "0.11.0", noRead), stored.unb1);
  assert.notEqual(await planForAddon(stored, "0.10.0", noRead), stored.unb1);
  assert.notEqual(await planForAddon(stored, "unknown", noRead), stored.unb1);
  const short = cleanPlan({ tasks: [{ id: "one", title: "Go", note: "Коротко" }] }, 1);
  const shortStored = { ...stored, plan: short, unb1: encodeUnb1(short) };
  assert.equal(await planForAddon(shortStored, undefined, noRead), shortStored.unb1);
});

test("UTF-8 truncation respects one-, two-, three- and four-byte boundaries", () => {
  for (const [text, maxBytes, expected] of [
    ["", 0, ""],
    ["a", 0, ""],
    ["a", 1, "a"],
    ["ab", 1, "a"],
    ["я", 1, ""],
    ["я", 2, "я"],
    ["яя", 2, "я"],
    ["€", 2, ""],
    ["€", 3, "€"],
    ["😀", 3, "…"],
    ["😀", 4, "😀"],
    ["abcdefgh", 7, "abcd…"],
    ["яяяяя", 7, "яя…"],
    ["€€€€", 9, "€€…"],
    ["😀😀😀😀", 11, "😀😀…"],
    ["aя€😀", 10, "aя€😀"],
    ["aя€😀", 9, "aя€…"],
    ["aя€😀", 8, "aя…"],
    ["aя€😀", 5, "a…"],
    ["aя€😀", 3, "…"],
  ] as const) {
    const result = truncateUtf8(text, maxBytes);
    assert.equal(result, expected, `${text}, ${maxBytes} bytes`);
    assert.ok(Buffer.byteLength(result) <= maxBytes);
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(result)), result);
  }
});
