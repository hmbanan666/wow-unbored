import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { KNOWN_SECTIONS } from "../src/data.ts";
import { ACCOUNT, ACCOUNT_KEY, makeStore, NOW, snapshot } from "./helpers.ts";

const row = (fields: Record<string, unknown> = {}) => ({
  at: NOW - 100,
  lastAt: NOW - 50,
  count: 3,
  version: "0.10.0",
  where: "section:bags",
  text: 'Interface/AddOns/Unbored/Core/Data/Inventory.lua:53: attempt to index "…"',
  stack: "Interface/AddOns/Unbored/Core/Data/Inventory.lua:53: in function <...>",
  ...fields,
});

test("errors is a known account Section, v1", () => {
  assert.deepEqual(KNOWN_SECTIONS.errors, { scope: "account", v: 1 });
  assert.deepEqual(KNOWN_SECTIONS.achProgress, { scope: "char", v: 1 });
  assert.deepEqual(KNOWN_SECTIONS.reputation, { scope: "char", v: 2 });
});

test("an errors upload becomes one addon_errors row per hash; count is the most seen", () => {
  const store = makeStore();
  try {
    store.registerDevice({
      id: "pc-1",
      name: "Desk PC",
      secretHash: "h1",
      nowSeconds: NOW,
      pendingCap: 10,
    });
    store.putSnapshot(snapshot({ errors: { body: { rows: [row()] } } }), "pc-1", NOW);
    let listed = store.listErrors({ limit: 50 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.count, 3);
    assert.equal(listed[0]!.device, "Desk PC");
    assert.equal(listed[0]!.character, "Mira");
    assert.equal(listed[0]!.where, "section:bags");
    assert.ok(listed[0]!.stack.includes("Inventory.lua:53"));
    assert.equal(listed[0]!.account, ACCOUNT_KEY);

    // The same error seen more often, and a second one; an older count never lowers it.
    store.putSnapshot(
      snapshot({
        errors: {
          body: {
            rows: [
              row({ count: 7, lastAt: NOW + 10 }),
              row({ where: "event:BAG_UPDATE", text: "boom", lastAt: NOW + 20, count: 1 }),
            ],
          },
        },
      }),
      "pc-1",
      NOW + 30,
    );
    store.putSnapshot(
      snapshot({ errors: { body: { rows: [row({ count: 2, lastAt: NOW + 5 })] } } }),
      "pc-1",
      NOW + 40,
    );
    listed = store.listErrors({ limit: 50 });
    assert.equal(listed.length, 2);
    assert.equal(listed[0]!.where, "event:BAG_UPDATE", "newest first");
    const bags = listed.find((item) => item.where === "section:bags")!;
    assert.equal(bags.count, 7);
    assert.equal(bags.lastAt, NOW + 10);
    assert.equal(bags.firstAt, NOW - 100);

    // since: rows seen or updated since; new only when first seen since.
    const since = store.listErrors({ since: NOW + 25, limit: 50 });
    const fresh = since.find((item) => item.where === "event:BAG_UPDATE")!;
    assert.equal(fresh.new, true);
    assert.equal(since.length, 1, "the bags row was not seen again since");
    const all = store.listErrors({ since: NOW - 1, limit: 50 });
    assert.equal(all.find((item) => item.where === "section:bags")?.new, true);
    assert.equal(store.listErrors({ limit: 50 })[0]!.new, false, "no since, nothing is new");
    assert.equal(store.listErrors({ version: "0.9.0", limit: 50 }).length, 0);
    assert.equal(store.listErrors({ account: "999999#1", limit: 50 }).length, 0);

    // A different version is a different row.
    store.putSnapshot(
      snapshot({ errors: { body: { rows: [row({ version: "0.10.1" })] } } }),
      "pc-1",
      NOW + 50,
    );
    assert.equal(store.listErrors({ limit: 50 }).length, 3);
  } finally {
    store.close();
  }
});

test("bad rows are skipped and Forget my data erases the error reports", async () => {
  const store = makeStore();
  try {
    store.putSnapshot(
      snapshot({
        errors: { body: { rows: [row(), { where: "init" }, "nope", row({ text: "" })] } },
      }),
      "pc-1",
      NOW,
    );
    assert.equal(store.listErrors({ limit: 50 }).length, 1);
    const erased = await store.deleteAccountData(ACCOUNT);
    assert.equal(erased.errors, 1);
    assert.equal(store.listErrors({ limit: 50 }).length, 0);
  } finally {
    store.close();
  }
});

test("data_catalog and the overview list missing Sections with a reason", () => {
  const store = makeStore();
  try {
    store.putSnapshot(
      snapshot(
        {
          char: { body: { level: 80 } },
          gear: { body: { slots: [] } },
          bags: { body: { items: ["idv1", "1:1"] } },
          mounts: { body: { ids: ["ids1", "1"] } },
        },
        { dropped: { char: { pets: { at: NOW, bytes: 10 }, achProgress: { at: NOW, bytes: 9 } } } },
      ),
      "pc-1",
      NOW,
    );
    // Sharing off: a Character with only the Sections written with sharing off.
    store.putSnapshot(
      snapshot(
        { char: { body: { level: 10 } }, sessions: { body: { list: [] } } },
        { character: "Alt" },
      ),
      "pc-1",
      NOW,
    );
    const catalog = store.data.catalog() as {
      accounts: {
        expected: string[];
        missing: { section: string; reason: string }[];
        characters: {
          character: string;
          expected: string[];
          missing: { section: string; reason: string; hint?: string }[];
        }[];
      }[];
    };
    const account = catalog.accounts[0]!;
    assert.ok(!account.expected.includes("errors"), "errors is not expected");
    assert.ok(account.expected.includes("mounts") && account.expected.includes("warband"));
    const accountMissing = Object.fromEntries(account.missing.map((m) => [m.section, m.reason]));
    assert.equal(accountMissing.mounts, undefined, "mounts arrived");
    assert.equal(accountMissing.warband, "window");
    assert.equal(accountMissing.toys, "never");

    const mira = account.characters.find((c) => c.character === "Mira")!;
    assert.ok(!mira.expected.includes("profile") && mira.expected.includes("achProgress"));
    const reasons = Object.fromEntries(mira.missing.map((m) => [m.section, m]));
    assert.ok(!mira.expected.includes("reagentBank"), "retail has no reagent bank");
    assert.equal(reasons.reagentBank, undefined, "a missing reagentBank is not reported");
    assert.equal(reasons.bags, undefined);
    assert.equal(reasons.bank?.reason, "window");
    assert.equal(reasons.bank?.hint, "open the bank");
    assert.equal(reasons.recipes?.hint, "open a profession");
    assert.equal(reasons.achProgress?.reason, "dropped");
    assert.equal(reasons.questsDone?.reason, "never");

    const alt = account.characters.find((c) => c.character === "Alt")!;
    const altReasons = Object.fromEntries(alt.missing.map((m) => [m.section, m.reason]));
    assert.equal(altReasons.bags, "sharing");
    assert.equal(altReasons.bank, "sharing");
    assert.equal(altReasons.gear, "never", "essential Sections are not blamed on sharing");

    const overview = store.data.overview(store.data.character("Mira")!) as {
      missing: { section: string; scope: string; reason: string }[];
    };
    assert.ok(overview.missing.some((m) => m.section === "bank" && m.reason === "window"));
    assert.ok(overview.missing.some((m) => m.section === "toys" && m.scope === "account"));
  } finally {
    store.close();
  }
});
