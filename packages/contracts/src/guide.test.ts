import { expect, test } from "vite-plus/test";
import { guideTermsSchema, termParts } from "./guide.ts";

test("authored terms preserve the reader's label and resolve only a named definition", () => {
  const terms = guideTermsSchema.parse([
    {
      key: "life-tap",
      name: "Life Tap",
      text: "Trades health for mana.",
      source: "https://example.com/warlock",
    },
  ]);
  expect(termParts("Use {{term:life-tap|Life Tap}} carefully.", terms)).toEqual([
    { text: "Use " },
    { text: "Life Tap", term: terms[0] },
    { text: " carefully." },
  ]);
  expect(() => termParts("{{term:missing|Missing}}", terms)).toThrow();
  expect(() => termParts("{{term:life-tap|Tap}", terms)).toThrow();
  expect(() => guideTermsSchema.parse([{ ...terms[0], source: "javascript:alert(1)" }])).toThrow();
  expect(() => guideTermsSchema.parse([terms[0], terms[0]])).toThrow();
});

test("item and spell identity stays game-scoped and never accepts an external icon URL", () => {
  const base = {
    key: "camp",
    name: "Camp",
    text: "Rest here.",
    source: "https://example.com/camp",
  };
  expect(guideTermsSchema.parse([{ ...base, kind: "spell", id: 123 }])[0]?.id).toBe(123);
  expect(() => guideTermsSchema.parse([{ ...base, id: 123 }])).toThrow();
  expect(() =>
    guideTermsSchema.parse([{ ...base, icon: "https://example.com/image.jpg" }]),
  ).toThrow();
  expect(() => guideTermsSchema.parse([{ ...base, html: "<script>unsafe</script>" }])).toThrow();
  expect(termParts("Use {{term:missing|the camp}}.", [], false)).toEqual([
    { text: "Use " },
    { text: "the camp" },
    { text: "." },
  ]);
});

test("term labels reject whitespace, nested media syntax and extra delimiters", () => {
  const terms = guideTermsSchema.parse([
    { key: "camp", name: "Camp", text: "Rest here.", source: "https://example.com/camp" },
  ]);
  for (const text of ["{{term:camp| }}", "{{term:camp|[[item:123]]}}", "{{{term:camp|camp}}}"])
    expect(() => termParts(text, terms)).toThrow();
});
