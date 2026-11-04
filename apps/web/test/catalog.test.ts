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
    ["/", "/paths", "/paths/:slug", "/collections", "/collections/:slug", "/install"],
  );
  assert.equal(catalogHref("path", "midnight-basic"), "/paths/midnight-basic");
  assert.equal(catalogHref("collection", "first-mounts"), "/collections/first-mounts");
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
