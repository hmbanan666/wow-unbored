import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vite-plus/test";

import { createApp } from "../src/app.ts";

// docs/adr/0013: the Companion and the Server read the same fixtures.
const root = path.join(import.meta.dirname, "..", "..", "..", "packages", "contracts", "fixtures");
const requests = JSON.parse(readFileSync(path.join(root, "requests.json"), "utf8")) as {
  cases: { name: string; body: Record<string, unknown> }[];
};

const companion = "companion-contract-token";
const planner = "planner-contract-token";

function build(lines: string[] = []) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "unbored-contract-"));
  return createApp({
    companionToken: companion,
    plannerToken: planner,
    dataDir,
    webhook: { url: "", key: "", headerName: "" },
    log: (line) => lines.push(line),
  });
}

function post(app: ReturnType<typeof build>["app"], body: unknown) {
  return app.request("/v1/requests", {
    method: "POST",
    headers: { authorization: `Bearer ${companion}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

for (const { name, body } of requests.cases) {
  test(`contract: the ${name} body is accepted and stored`, async () => {
    const { app, store, close } = build();
    try {
      const response = await post(app, body);
      assert.equal(response.status, 201, await response.clone().text());
      const stored = store.requestById(body.id as string)!;
      assert.equal(stored.type, body.type);
      assert.equal(stored.character, body.character);
      assert.equal(stored.lang, body.lang ?? null);
      assert.equal(stored.account, String(body.account ?? "").split("#")[0]);
      if (body.type === "plan") {
        assert.equal(stored.mode, body.mode);
        assert.equal(stored.budget, body.budget ?? null);
      } else {
        assert.equal(stored.mode, "");
      }
      const again = await post(app, body);
      assert.equal(again.status, 200);
    } finally {
      close();
    }
  });
}

test("contract: a 0.5 Companion's item body with an empty mode is accepted", async () => {
  const lines: string[] = [];
  const { app, close } = build(lines);
  try {
    const item = requests.cases.find((c) => c.name === "item")!.body;
    const response = await post(app, { ...item, id: "req-old-1", mode: "", budget: 60 });
    assert.equal(response.status, 201);
    const nullMode = await post(app, { ...item, id: "req-old-2", mode: null });
    assert.equal(nullMode.status, 201);
    const badPlan = await post(app, { ...requests.cases[0]!.body, id: "req-bad", mode: "" });
    assert.equal(badPlan.status, 400);
    assert.ok(lines.includes("POST /v1/requests 201"));
    assert.ok(lines.some((line) => line.startsWith('POST /v1/requests 400 reason="mode must be')));
    assert.ok(
      lines.every((line) => !line.includes(companion)),
      "no secret in the log",
    );
  } finally {
    close();
  }
});
