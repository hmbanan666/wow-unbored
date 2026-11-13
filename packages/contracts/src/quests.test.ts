import { test, expect } from "vite-plus/test";
import { questChainSchema, validateQuestChain, questProgress } from "./quests.ts";
const chain = questChainSchema.parse({
  slug: "test-chain",
  title: "Test chain",
  faction: "Both",
  zone: "Elwynn Forest",
  status: "published",
  steps: [
    { questID: 42, title: "A beginning" },
    { questID: 43, title: "The next step" },
  ],
});
test("every authored step needs observed evidence, with drafts remaining draft", () => {
  expect(validateQuestChain(chain, new Set([42]))).toEqual({ status: "draft", missing: [43] });
  expect(validateQuestChain(chain, new Set([42, 43]))).toEqual({
    status: "published",
    missing: [],
  });
  expect(validateQuestChain({ ...chain, status: "draft" }, new Set([42, 43])).status).toBe("draft");
});
test("completed quests determine the next ordered step and absence stays unknown", () => {
  expect(questProgress([42, 43], { ids: ["ids1", "16"] }, { quests: [{ questID: 43 }] })).toEqual([
    { questID: 42, done: true, inLog: false, next: false },
    { questID: 43, done: false, inLog: true, next: true },
  ]);
  expect(questProgress([42], null, null)).toEqual([
    { questID: 42, done: null, inLog: null, next: false },
  ]);
});

test("malformed and out-of-range completed ids never become proof or unfinished progress", () => {
  for (const ids of [
    ["ids1", "-1"],
    ["ids1", "zzz!"],
    ["ids1", "zzzzzzzzzzzzz"],
    ["ids1", "0"],
  ]) {
    expect(questProgress([42], { ids }, null)[0]?.done).toBeNull();
  }
});
