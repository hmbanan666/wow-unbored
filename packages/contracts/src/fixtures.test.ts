import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import {
  cleanEntities,
  cleanMarkup,
  type Entities,
  packIds,
  parseMarkup,
  plainText,
  planSchema,
  playerProfileSchema,
  requestBodySchema,
  sectionHash,
  snapshotBodySchema,
  suggestionsBodySchema,
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

test("the suggestions fixture matches the shared schema", () => {
  const parsed = suggestionsBodySchema.safeParse(read("suggestions.json"));
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  for (const list of Object.values(parsed.data!.characters)) {
    for (const item of list) expect(item.request.suggestionId).toBe(item.id);
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

test("markup fixtures parse, clean and flatten the same everywhere", () => {
  const doc = read("markup.json") as {
    entities: Entities;
    cases: {
      name: string;
      text: string;
      clean: string;
      plain: string;
      issues: number;
      tokens: Record<string, unknown>[];
    }[];
    plan: unknown;
  };
  for (const item of doc.cases) {
    const tokens = parseMarkup(item.text)
      .filter((part) => typeof part !== "string")
      .map(({ raw: _raw, ...rest }) => rest);
    expect(tokens, item.name).toEqual(item.tokens);
    expect(plainText(item.text, doc.entities), item.name).toBe(item.plain);
    const cleaned = cleanMarkup(item.text, { entities: doc.entities });
    expect(cleaned.text, item.name).toBe(item.clean);
    expect(cleaned.issues, item.name).toHaveLength(item.issues);
  }
  expect(planSchema.safeParse(doc.plan).success).toBe(true);
});

test("entities keep only well-formed npc entries", () => {
  const { entities, issues } = cleanEntities({
    npc: {
      "1": { name: "Kev", mapID: 84, x: 40.04, y: 50 },
      "2": { name: "" },
      abc: { name: "Bad" },
      "3": { name: "Far", x: 120, y: 3 },
    },
  });
  expect(entities).toEqual({
    npc: { "1": { name: "Kev", mapID: 84, x: 40, y: 50 }, "3": { name: "Far" } },
  });
  expect(issues).toHaveLength(3);
  expect(cleanEntities("nope").issues).toHaveLength(1);
});

test("the catalog is what scripts/export-catalog.lua makes from addon/Data", () => {
  const repo = path.join(root, "..", "..", "..");
  const made = execFileSync("lua5.1", [path.join(repo, "scripts", "export-catalog.lua")], {
    encoding: "utf8",
  });
  const file = readFileSync(path.join(root, "..", "catalog", "catalog.json"), "utf8");
  expect(file, "run lua5.1 scripts/export-catalog.lua --write").toBe(made);
});
