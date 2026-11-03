import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";
import type { Plan } from "../src/plan.ts";
import { truncateUtf8 } from "../src/plan-delivery.ts";
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
      [undefined, false],
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
