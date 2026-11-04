import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { allowedHref, cleanBlocks } from "../shared/blocks.ts";
import {
  catalogHref,
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
    ["/", "/paths/:slug", "/collections/:slug"],
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
