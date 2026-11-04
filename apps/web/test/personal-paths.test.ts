import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { pathForPage, replacementFor, type PathProgress } from "../shared/personal-paths.ts";
import { completionView } from "../shared/my-page.ts";

const current: PathProgress = {
  kind: "path",
  slug: "first-steps",
  locale: "en",
  title: "First steps",
  version: 2,
  done: 1,
  total: 2,
  goals: [
    { position: 0, done: true, required: true },
    { position: 1, done: false, required: true },
  ],
};
test("personal goal markers only match the publication rendered on the public page", () => {
  assert.equal(
    pathForPage([current], { kind: "path", slug: "first-steps", version: 1 }),
    undefined,
  );
  assert.equal(
    pathForPage([current], { kind: "collection", slug: "first-steps", version: 2 }),
    undefined,
  );
  assert.equal(pathForPage([current], { kind: "path", slug: "first-steps", version: 2 })?.done, 1);
});
test("only a different active Path asks for replacement, including Collection picks", () => {
  assert.equal(replacementFor(null, current), null);
  assert.equal(replacementFor(current, current), null);
  assert.deepEqual(replacementFor(current, { ...current, kind: "collection" }), {
    kind: "path",
    slug: "first-steps",
    locale: "en",
  });
});
test("completion links reject unexpected kinds and unsafe slugs", () => {
  assert.equal(completionView({ kind: "guide", slug: "safe", title: "Guide", version: 1 }), null);
  assert.equal(completionView({ kind: "path", slug: "../my", title: "Path", version: 1 }), null);
});
