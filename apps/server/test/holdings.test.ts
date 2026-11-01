import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import {
  buildHoldings,
  HOLDINGS_MAX_BYTES,
  HOLDINGS_MAX_ITEMS,
  HOLDINGS_STALE_SECONDS,
  WARBAND_PLACE,
} from "../src/holdings.ts";

const NOW = 1_793_361_600;

test("places are Characters by last seen, then the Warband bank as w", async () => {
  const holdings = buildHoldings(
    [
      { key: WARBAND_PLACE, seenAt: NOW, items: [{ id: 2447, count: 200 }] },
      { key: "Hero-Area 52", seenAt: NOW - 100, items: [{ id: 2447, count: 2 }] },
      {
        key: "Grubbyman-Area 52",
        seenAt: NOW,
        items: [
          { id: 2447, count: 30 },
          { id: 2447, count: 10 },
        ],
      },
    ],
    NOW,
  );
  assert.deepEqual(holdings.places, ["Grubbyman-Area 52", "Hero-Area 52", "warband"]);
  assert.equal(holdings.items["2447"], "w:200,1:40,2:2", "stacks add up, largest first");
});

test("places last seen over 60 days ago are left out", async () => {
  const holdings = buildHoldings(
    [
      { key: "Old-Realm", seenAt: NOW - HOLDINGS_STALE_SECONDS - 1, items: [{ id: 1, count: 5 }] },
      { key: "New-Realm", seenAt: NOW, items: [{ id: 2, count: 5 }] },
    ],
    NOW,
  );
  assert.deepEqual(holdings.places, ["New-Realm"]);
  assert.deepEqual(holdings.items, { "2": "1:5" });
});

test("over the cap, items in the fewest places are cut first", async () => {
  const many = Array.from({ length: HOLDINGS_MAX_ITEMS + 500 }, (_, i) => ({
    id: 100_000 + i,
    count: 1,
  }));
  const holdings = buildHoldings(
    [
      { key: "A-Realm", seenAt: NOW, items: [...many, { id: 7, count: 1 }] },
      { key: "B-Realm", seenAt: NOW, items: [{ id: 7, count: 3 }] },
    ],
    NOW,
  );
  const ids = Object.keys(holdings.items);
  assert.ok(ids.length <= HOLDINGS_MAX_ITEMS);
  assert.equal(holdings.items["7"], "2:3,1:1", "the item in two places is kept");
  const bytes = Object.entries(holdings.items).reduce(
    (sum, [id, value]) => sum + id.length + value.length + 16,
    0,
  );
  assert.ok(bytes <= HOLDINGS_MAX_BYTES, `within 60 KB: ${bytes}`);
});

test("empty and bad stacks are skipped", async () => {
  const holdings = buildHoldings(
    [
      {
        key: "A-Realm",
        seenAt: NOW,
        items: [
          { id: 0, count: 5 },
          { id: 3, count: 0 },
          { id: 4, count: 2 },
        ],
      },
    ],
    NOW,
  );
  assert.deepEqual(holdings.items, { "4": "1:2" });
});
