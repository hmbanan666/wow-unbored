import { expect, test } from "vite-plus/test";
import {
  guideTermsSchema,
  termParts,
  tableSchema,
  faqSchema,
  structuredGuideBlocksSchema,
} from "./guide.ts";

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

test("tables keep captions, column headers and rectangular rows within the guide limits", () => {
  const table = {
    type: "table",
    caption: "Costs",
    columns: ["Choice", "Cost"],
    rows: [["A", "2 gold"]],
  };
  expect(tableSchema.parse(table)).toEqual(table);
  expect(tableSchema.parse({ ...table, caption: undefined }).caption).toBeUndefined();
  expect(
    tableSchema.parse({
      ...table,
      columns: Array(6).fill("Header"),
      rows: Array(30).fill(Array(6).fill("Cell")),
    }).rows,
  ).toHaveLength(30);
  for (const patch of [
    { columns: [] },
    { columns: ["Only"] },
    { columns: Array(7).fill("Header") },
    { rows: [] },
    { rows: Array(31).fill(["A", "B"]) },
    { rows: [["A"]] },
    { rows: [["A", "B", "C"]] },
    { rows: [[" ", "B"]] },
    { columns: ["", "B"] },
    { caption: " " },
    { extra: true },
  ])
    expect(tableSchema.safeParse({ ...table, ...patch }).success).toBe(false);
});

test("FAQ entries are strict, bounded and appear at most once among structured guide blocks", () => {
  const faq = { type: "faq", entries: [{ q: "Which?", a: "The first choice." }] };
  expect(faqSchema.parse(faq)).toEqual(faq);
  expect(faqSchema.parse({ ...faq, entries: Array(8).fill(faq.entries[0]) }).entries).toHaveLength(
    8,
  );
  for (const patch of [
    { entries: [] },
    { entries: Array(9).fill(faq.entries[0]) },
    { extra: true },
    { entries: [{ q: " ", a: "Answer" }] },
    { entries: [{ q: "Question", a: " " }] },
    { entries: [{ ...faq.entries[0], extra: true }] },
  ])
    expect(faqSchema.safeParse({ ...faq, ...patch }).success).toBe(false);
  expect(structuredGuideBlocksSchema.safeParse([faq, faq]).success).toBe(false);
  expect(structuredGuideBlocksSchema.parse([faq])).toEqual([faq]);
});

test("new block text rejects HTML and malformed markup, allowing terms only in cells and answers", () => {
  for (const value of [
    "<img src=x onerror=alert(1)>",
    "{{term:camp| }}",
    "{{term:camp|[[item:1]]}}",
    "{{{term:camp|camp}}}",
    "{{term:camp|<b>camp</b>}}",
    "{item:1}",
    "[[item:1]]",
    "broken ]]",
    "{{term:camp|camp}",
  ]) {
    expect(
      tableSchema.safeParse({ type: "table", columns: ["A", "B"], rows: [[value, "B"]] }).success,
    ).toBe(false);
    expect(faqSchema.safeParse({ type: "faq", entries: [{ q: "Where?", a: value }] }).success).toBe(
      false,
    );
  }
  const mention = "Use {{term:camp|the camp}}.";
  expect(
    tableSchema.safeParse({ type: "table", columns: ["A", "B"], rows: [[mention, "B"]] }).success,
  ).toBe(true);
  expect(faqSchema.safeParse({ type: "faq", entries: [{ q: "Where?", a: mention }] }).success).toBe(
    true,
  );
  expect(
    tableSchema.safeParse({
      type: "table",
      caption: mention,
      columns: ["A", "B"],
      rows: [["A", "B"]],
    }).success,
  ).toBe(false);
  expect(
    tableSchema.safeParse({ type: "table", columns: [mention, "B"], rows: [["A", "B"]] }).success,
  ).toBe(false);
  expect(faqSchema.safeParse({ type: "faq", entries: [{ q: mention, a: "Here." }] }).success).toBe(
    false,
  );
});
