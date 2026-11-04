import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { allowedHref, cleanBlocks } from "../shared/blocks.ts";
import {
  catalogHref,
  cleanItems,
  isCatalogKind,
  isEntityPath,
  isSlug,
  pageMessage,
  PUBLIC_COPY,
  PUBLIC_ROUTES,
} from "../shared/catalog.ts";

test("paths and collections share the catalog, and objects have no page", () => {
  assert.deepEqual(
    PUBLIC_ROUTES.map((route) => route.pattern),
    [
      "/",
      "/paths",
      "/paths/:slug",
      "/collections",
      "/collections/:slug",
      "/guides",
      "/guides/:slug",
      "/install",
    ],
  );
  assert.equal(catalogHref("path", "midnight-basic"), "/paths/midnight-basic");
  assert.equal(catalogHref("collection", "first-mounts"), "/collections/first-mounts");
  assert.equal(catalogHref("guide", "first-steps"), "/guides/first-steps");
  assert.equal(catalogHref("path", "../etc"), undefined);
  assert.equal(isCatalogKind("path"), true);
  assert.equal(isCatalogKind("collection"), true);
  assert.equal(isCatalogKind("mount"), false);
  assert.equal(isCatalogKind("item"), false);
  assert.equal(isSlug("Midnight"), false);
  assert.equal(isEntityPath("/mounts/50"), true);
  assert.equal(isEntityPath("/items/123"), true);
  assert.equal(isEntityPath("/paths/midnight-basic"), false);
  assert.equal(isEntityPath("/collections/first-mounts"), false);
});

test("authored blocks keep https and catalog links, and drop object links", () => {
  const blocks = cleanBlocks({
    blocks: [
      { type: "paragraph", text: "  Start here.  " },
      { type: "list", items: ["One", " "] },
      {
        type: "link",
        label: "Install",
        href: "https://github.com/hmbanan666/wow-unbored/releases/latest",
      },
      { type: "link", label: "Mount", href: "/mounts/50" },
      { type: "link", label: "Script", href: "javascript:alert(1)" },
      { type: "link", label: "Next", href: "/paths/midnight-basic" },
      { type: "html", text: "<script>" },
    ],
  });
  assert.deepEqual(blocks, [
    { type: "paragraph", text: "Start here." },
    { type: "list", items: ["One"] },
    {
      type: "link",
      label: "Install",
      href: "https://github.com/hmbanan666/wow-unbored/releases/latest",
    },
    { type: "link", label: "Next", href: "/paths/midnight-basic" },
  ]);
  assert.equal(allowedHref("http://example.com"), false);
  assert.equal(allowedHref("//example.com"), false);
  assert.equal(
    pageMessage({ message: PUBLIC_COPY.notPublished }, null, "x"),
    PUBLIC_COPY.notPublished,
  );
});

test("list items keep verified fields and drop anything malformed", () => {
  const items = cleanItems({
    items: [
      {
        kind: "mount",
        id: 460,
        name: "Grand Expedition Yak",
        source: {
          type: "vendor",
          text: "Vendor: Uncle Bigpocket\nZone: Kun-Lai Summit",
          zone: 379,
        },
        chance: false,
        note: "Two vendors on a mount.",
        url: "https://www.wowhead.com/spell=122708",
      },
      {
        kind: "npc",
        id: 1,
        name: "Nope",
        source: { type: "vendor", text: "x" },
        chance: false,
        note: "x",
      },
      { kind: "pet", id: 2, name: "No note", source: { type: "drop", text: "x" }, chance: true },
      {
        kind: "pet",
        id: 3,
        name: "Bad link",
        source: { type: "drop", text: "Drop" },
        chance: true,
        note: "Luck.",
        url: "javascript:alert(1)",
      },
    ],
  });
  assert.deepEqual(items, [
    {
      kind: "mount",
      id: 460,
      name: "Grand Expedition Yak",
      source: { type: "vendor", lines: ["Vendor: Uncle Bigpocket", "Zone: Kun-Lai Summit"] },
      chance: false,
      note: "Two vendors on a mount.",
      url: "https://www.wowhead.com/spell=122708",
    },
    {
      kind: "pet",
      id: 3,
      name: "Bad link",
      source: { type: "drop", lines: ["Drop"] },
      chance: true,
      note: "Luck.",
    },
  ]);
  assert.deepEqual(cleanItems({ blocks: [] }), []);
});

test("public Paths retain every goal kind in authored order, including level targets without ids", () => {
  const goals = [
    { kind: "rep", id: 72, standing: 8 },
    { kind: "renown", id: 72, level: 10 },
    { kind: "level", level: 80 },
    { kind: "currency", id: 2000, amount: 50 },
    { kind: "quest", id: 90001 },
    { kind: "questLine", id: 10 },
  ];
  const items = cleanItems({
    items: goals.map((goal) => ({
      ...goal,
      name: "An authored goal",
      source: { type: "quest", text: "Finish the quest." },
      chance: false,
      note: "Start here.",
    })),
  });
  assert.deepEqual(
    items.map((item) => item.kind),
    ["rep", "renown", "level", "currency", "quest", "questLine"],
  );
  assert.equal(items[2].level, 80);
  assert.equal(items[2].id, undefined);
});

test("media fields survive cleaning and old body output is unchanged", async () => {
  const { cleanHero } = await import("@unbored/contracts/game-media");
  const old = {
    blocks: [
      { type: "paragraph", text: "Start here." },
      { type: "list", items: ["One", "Two"] },
    ],
  };
  assert.deepEqual(cleanBlocks(old), old.blocks);
  const figure = {
    type: "figure",
    image: "0123456789abcdef",
    alt: "Our screenshot",
    caption: "Here.",
  };
  assert.deepEqual(cleanBlocks({ blocks: [figure] }), [figure]);
  assert.deepEqual(cleanBlocks({ blocks: [{ ...figure, ref: { kind: "mount", id: 1 } }] }), []);
  assert.deepEqual(cleanHero({ kind: "mount", id: 460 }), { kind: "mount", id: 460 });
  assert.equal(cleanHero({ kind: "item", id: 1 }), undefined);
  assert.deepEqual(cleanBlocks({ blocks: [{ type: "paragraph", text: "[[npc:1]]" }] }), []);
});
