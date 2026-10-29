import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { planSchema, playerProfileSchema, requestBodySchema } from "./index.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function read(name: string): unknown {
  return JSON.parse(readFileSync(path.join(root, name), "utf8"));
}

test("request fixtures match the shared schema", () => {
  const doc = read("requests.json") as { cases: { name: string; body: unknown }[] };
  for (const item of doc.cases) {
    const parsed = requestBodySchema.safeParse(item.body);
    expect(parsed.success, item.name).toBe(true);
  }
});

test("plan and player profile fixtures match the shared schema", () => {
  expect(planSchema.safeParse(read("plan.json")).success).toBe(true);
  expect(playerProfileSchema.safeParse(read("profile.json")).success).toBe(true);
});
