import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { characterHref, professionViews } from "../shared/character-page.ts";

test("character links encode each realm and name segment and separate games", () => {
  assert.equal(
    characterHref({ game: "forever", realm: "A / B", name: "Мира Sun" }),
    "/my/forever/A%20%2F%20B/%D0%9C%D0%B8%D1%80%D0%B0%20Sun",
  );
});

test("profession counts come only from its learned packed set, and unseen is not zero", () => {
  assert.deepEqual(
    professionViews(
      {
        list: [
          { skillLine: 171, name: "Alchemy", skill: 112, max: 150 },
          { skillLine: 185, name: "Cooking", skill: 0 },
          { skillLine: 164, name: "Blacksmithing" },
        ],
      },
      {
        byProfession: {
          "171": { learned: ["ids1", "2s,2,1,1"] },
          "185": { learned: ["ids1"] },
        },
      },
    ),
    [
      { skillLine: 171, name: "Alchemy", skill: 112, max: 150, known: 4 },
      { skillLine: 185, name: "Cooking", skill: 0, max: null, known: 0 },
      { skillLine: 164, name: "Blacksmithing", skill: null, max: null, known: null },
    ],
  );
  assert.deepEqual(professionViews(undefined, undefined), []);
});
