import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import {
  packIds,
  planSchema,
  playerProfileSchema,
  requestBodySchema,
  sectionHash,
  snapshotBodySchema,
  unpackIds,
  unpackRows,
} from "./index.ts";

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

test("packed id sets round-trip exactly like the shared fixture", () => {
  const doc = read("packed-ids.json") as {
    cases: { name: string; input?: number[]; ids: number[]; packed: string[] }[];
    valueCases: { name: string; ids: number[]; values: number[][]; packed: string[] }[];
  };
  for (const item of doc.valueCases) {
    const rows = unpackRows(item.packed);
    expect(
      rows.map((row) => row.id),
      item.name,
    ).toEqual(item.ids);
    expect(
      rows.map((row) => row.values),
      item.name,
    ).toEqual(item.values);
  }
  for (const item of doc.cases) {
    expect(packIds(item.input ?? item.ids), item.name).toEqual(item.packed);
    expect(unpackIds(item.packed), item.name).toEqual(item.ids);
    for (const chunk of item.packed.slice(1)) expect(chunk.length).toBeLessThanOrEqual(4000);
  }
});

test("the snapshot fixture matches the schema and its Section hashes", () => {
  const body = read("snapshot.json") as {
    sections: Record<string, { hash: string; body: Record<string, unknown> }>;
  };
  expect(snapshotBodySchema.safeParse(body).success).toBe(true);
  for (const [name, section] of Object.entries(body.sections)) {
    expect(sectionHash(section.body), name).toBe(section.hash);
  }
  const quests = body.sections.questsDone.body as { ids: string[]; count: number };
  expect(unpackIds(quests.ids)).toHaveLength(quests.count);
});
