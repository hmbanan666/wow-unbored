import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { packIds } from "@unbored/contracts";

import type { SectionRow } from "../src/data.ts";
import {
  READY_MAX_ITEMS,
  READY_MAX_PER_KIND,
  readyAlts,
  readyNow,
  type ReadyItem,
} from "../src/ready.ts";
import type { Catalog } from "../src/suggestions.ts";
import { ACCOUNT, makeStore, NOW, snapshot } from "./helpers.ts";

const DAY = 86_400;

function section(name: string, body: Record<string, unknown>): [string, SectionRow] {
  return [
    name,
    {
      ownerKind: "char",
      ownerId: "Realm/Mira",
      section: name,
      v: 1,
      hash: "",
      at: NOW,
      savedAt: NOW,
      updatedAt: NOW,
      src: null,
      unknown: false,
      bytes: 0,
      body,
    },
  ];
}

const EMPTY_CATALOG: Catalog = {
  holidays: [],
  achievements: [],
  exploration: [],
  rares: [],
  farm: [],
};

function ready(
  sections: [string, SectionRow][],
  extra: Partial<Parameters<typeof readyNow>[0]> = {},
) {
  return readyNow({
    character: "Mira",
    realm: "Realm",
    account: "111111",
    sections: new Map(sections),
    now: NOW,
    catalog: EMPTY_CATALOG,
    ...extra,
  });
}

function only(items: ReadyItem[], kind: string) {
  return items.filter((item) => item.kind === kind);
}

test("renown within 25% of the next level, with its rewards; not at max", () => {
  const { items } = ready([
    section("reputation", {
      factions: [],
      renown: [
        {
          factionID: 2590,
          level: 14,
          earned: 2000,
          threshold: 2500,
          next: [{ mountID: 2001, name: "A mount" }, { spellID: 5 }],
        },
        { factionID: 2594, level: 9, earned: 2400, threshold: 2500 },
        { factionID: 2570, level: 20, earned: 2490, threshold: 2500, max: true },
        { factionID: 2600, level: 3, earned: 100, threshold: 2500 },
      ],
    }),
  ]);
  const renown = only(items, "renown");
  assert.deepEqual(
    renown.map((item) => [item.key, item.score, item.left]),
    [
      ["renown:2590", 75, 500],
      ["renown:2594", 60, 100],
    ],
  );
  assert.deepEqual(renown[0]!.tokens, ["{mount:2001}", "{spell:5}"]);
  assert.equal(renown[0]!.why, "500 to renown 15");
});

test("a standing within 15% of the step and a paragon reward waiting", () => {
  const { items } = ready([
    section("reputation", {
      factions: [
        { factionID: 1, reaction: 6, standing: 20500, min: 9000, max: 21000 },
        { factionID: 2, reaction: 6, standing: 10000, min: 9000, max: 21000 },
        { factionID: 3, reaction: 8, standing: 42999, min: 42000, max: 43000 },
        { factionID: 4, friendship: { standing: 9650, threshold: 8400, next: 9800 } },
        { factionID: 8, friendship: { standing: 9500, threshold: 8400, next: 9800 } },
        { factionID: 5, friendship: { standing: 42000, threshold: 42000 } },
        {
          factionID: 6,
          reaction: 8,
          paragon: { value: 9000, threshold: 10000, questID: 777, pending: true },
        },
        { factionID: 7, reaction: 8, paragon: { value: 9900, threshold: 10000, questID: 778 } },
      ],
    }),
  ]);
  assert.deepEqual(
    only(items, "standing").map((item) => [item.key, item.left, item.score]),
    [
      ["standing:1", 500, 50],
      ["standing:4", 150, 50],
    ],
  );
  const paragon = only(items, "paragon");
  assert.deepEqual(
    paragon.map((item) => [item.key, item.tokens, item.score]),
    [["paragon:6", ["{quest:777}"], 100]],
  );
});

test("an achievement 70% done or more scores 70 to 100", () => {
  const { items } = ready([
    section("achProgress", {
      rows: [
        { id: 10, d: 7, t: 10 },
        { id: 11, d: 9, t: 10 },
        { id: 12, d: 6, t: 10 },
        { id: 13, d: 99, t: 100 },
        { id: 14, d: 9, t: 10 },
      ],
    }),
    section("achievements", { ids: packIds([14]) }),
  ]);
  const ach = only(items, "achievement");
  assert.deepEqual(
    ach.map((item) => [item.key, item.score, item.have, item.need]),
    [
      ["ach:13", 99, 99, 100],
      ["ach:11", 90, 9, 10],
      ["ach:10", 70, 7, 10],
    ],
  );
  assert.deepEqual(ach[1]!.tokens, ["{ach:11}"]);
  assert.equal(ach[1]!.why, "9 of 10 done");
});

test("a lockout with bosses left, +10 when it resets within 2 days", () => {
  const { items } = ready([
    section("lockouts", {
      instances: [
        {
          name: "Raid A",
          instanceID: 1,
          difficultyID: 16,
          locked: true,
          bosses: 8,
          killed: 5,
          resetAt: NOW + DAY,
        },
        {
          name: "Raid B",
          instanceID: 2,
          difficultyID: 15,
          locked: true,
          bosses: 8,
          killed: 2,
          resetAt: NOW + 5 * DAY,
        },
        { name: "Done", instanceID: 3, locked: true, bosses: 4, killed: 4, resetAt: NOW + DAY },
        { name: "Old", instanceID: 4, locked: true, bosses: 4, killed: 1, resetAt: NOW - 1 },
        { name: "Unlocked", instanceID: 5, locked: false, bosses: 4, killed: 1 },
      ],
    }),
  ]);
  const lockouts = only(items, "lockout");
  assert.deepEqual(
    lockouts.map((item) => [item.title, item.score, item.why, item.resetAt]),
    [
      ["Raid A", 90, "3 of 8 bosses left", NOW + DAY],
      ["Raid B", 80, "6 of 8 bosses left", NOW + 5 * DAY],
    ],
  );
});

test("the vault: a reward waiting, a slot 2 or fewer away named from the enum, else type N", () => {
  const { items } = ready([
    section("vault", {
      rewardWaiting: true,
      activities: [
        { type: 3, index: 1, threshold: 2, progress: 2 },
        { type: 3, index: 2, threshold: 4, progress: 2 },
        { type: 1, index: 1, threshold: 1, progress: 0 },
        { type: 6, index: 1, threshold: 8, progress: 3 },
        { type: 9, index: 1, threshold: 2, progress: 1 },
      ],
    }),
  ]);
  const vault = only(items, "vault");
  assert.equal(vault[0]!.key, "vault:reward");
  assert.equal(vault[0]!.score, 100);
  const whys = vault
    .slice(1)
    .map((item) => item.why)
    .sort();
  assert.deepEqual(whys, [
    "1 more for the next slot (Activities)",
    "1 more for the next slot (type 9)",
    "2 more for the next slot (Raid)",
  ]);
});

test("your key, a currency near its cap, and weekly room", () => {
  const { items } = ready([
    section("mplus", { keyLevel: 12, keyMapID: 501 }),
    section("currencies", {
      list: [
        { id: 3008, quantity: 1900, max: 2000 },
        { id: 3010, quantity: 100, max: 2000, week: 300, weekMax: 1000 },
        { id: 3011, quantity: 10, week: 1000, weekMax: 1000 },
      ],
    }),
  ]);
  assert.deepEqual(
    only(items, "key").map((item) => [item.why, item.score, item.tokens]),
    [["Your key +12", 55, []]],
  );
  assert.deepEqual(
    only(items, "currency").map((item) => [item.key, item.score, item.left, item.tokens]),
    [
      ["cap:3008", 65, 100, ["{currency:3008}"]],
      ["week:3010", 40, 700, ["{currency:3010}"]],
    ],
  );
});

test("chains: the 5 most finished open chains, and events on now from the catalog", () => {
  const lines = Array.from({ length: 7 }, (_, n) => ({
    questLineID: 100 + n,
    name: `Chain ${n}`,
    done: n + 1,
    total: 10,
    nextQuestID: 9000 + n,
  }));
  const catalog: Catalog = {
    ...EMPTY_CATALOG,
    holidays: [
      {
        id: "fair",
        match: { titles: ["Darkmoon Faire"] },
        tasks: [{ id: "toy", toyID: 4242 }],
      },
      { id: "later", match: { titles: ["Later Fest"] }, tasks: [{ id: "t", toyID: 1 }] },
    ],
  };
  const stamp = (at: number) => new Date(at * 1000).toISOString().slice(0, 16).replace("T", " ");
  const { items } = ready(
    [
      section("questLines", { lines }),
      section("calendar", {
        events: [
          { title: "Darkmoon Faire", starts: stamp(NOW - DAY), ends: stamp(NOW + 2 * DAY) },
          { title: "Later Fest", starts: stamp(NOW + DAY), ends: stamp(NOW + 3 * DAY) },
        ],
      }),
    ],
    { catalog },
  );
  const chains = only(items, "chain");
  assert.equal(chains.length, 5);
  assert.deepEqual(chains[0]!.tokens, ["{quest:9006}"]);
  assert.equal(chains[0]!.why, "Continue: 7 of 10 done");
  assert.equal(chains[0]!.score, 60);
  const events = only(items, "event");
  assert.deepEqual(
    events.map((item) => [item.key, item.score, item.tokens]),
    [["event:fair", 90, ["{toy:4242}"]]],
  );
});

test("items are sorted by score, at most 5 per kind, missing names absent Sections, taste nudges", () => {
  const rows = Array.from({ length: 40 }, (_, n) => ({ id: 1000 + n, d: 8, t: 10 }));
  const out = ready([section("achProgress", { rows })], {
    taste: [
      {
        category: "achievement",
        picked: 5,
        tracked: 5,
        finished: 4,
        doneSteps: 10,
        skippedSteps: 0,
        wins: 1,
        rate: 0.857,
        bonus: 11,
      },
    ],
  });
  assert.equal(out.items.length, READY_MAX_PER_KIND, "40 near-done achievements give 5 items");
  assert.equal(out.items[0]!.score, 80 + 11);
  assert.deepEqual(out.missing, [
    "reputation",
    "lockouts",
    "vault",
    "mplus",
    "currencies",
    "questLines",
    "calendar",
  ]);
  assert.equal(out.taste[0]!.bonus, 11);
});

test("every kind gets its share before the 25-item cut, with the names the game gave", () => {
  const ten = Array.from({ length: 10 }, (_, n) => n);
  const out = ready([
    section("achProgress", {
      rows: Array.from({ length: 40 }, (_, n) => ({ id: 1000 + n, name: `Ach ${n}`, d: 9, t: 10 })),
    }),
    section("vault", { rewardWaiting: true }),
    section("currencies", {
      list: ten.map((n) => ({
        id: 3000 + n,
        name: `Coin ${n}`,
        quantity: 10,
        week: 1,
        weekMax: 5,
      })),
    }),
    section("lockouts", {
      instances: ten.map((n) => ({
        instanceID: 2000 + n,
        name: `Raid ${n}`,
        locked: true,
        bosses: 8,
        killed: 2,
        resetAt: NOW + 5 * DAY,
      })),
    }),
    section("reputation", {
      factions: ten.map((n) => ({
        factionID: 4000 + n,
        name: `Faction ${n}`,
        reaction: 5,
        standing: 8500,
        min: 3000,
        max: 9000,
      })),
      renown: ten.map((n) => ({
        factionID: 5000 + n,
        name: `Renown ${n}`,
        level: 3,
        earned: 2000,
        threshold: 2500,
      })),
    }),
  ]);
  assert.equal(out.items.length, READY_MAX_ITEMS);
  const kinds = new Map<string, number>();
  for (const item of out.items) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
  assert.equal(kinds.get("vault"), 1, "the vault is not crowded out");
  for (const kind of ["achievement", "lockout", "renown", "standing"]) {
    assert.equal(kinds.get(kind), READY_MAX_PER_KIND, kind);
  }
  assert.equal(kinds.get("currency"), 4, "the lowest score loses the last slots");
  const title = (kind: string) => out.items.find((item) => item.kind === kind)?.title;
  assert.equal(title("achievement"), "Ach 0");
  assert.equal(title("renown"), "Renown 0");
  assert.equal(title("standing"), "Faction 0");
  assert.equal(title("currency"), "Coin 0");
  assert.equal(title("lockout"), "Raid 0");
  assert.equal(title("vault"), undefined, "no name in the data, no title");
});

test("alts: another Character at least 0.2 further on and at least half done, at most 5", () => {
  const mine = new Map([
    section("achProgress", {
      rows: [
        { id: 1, d: 5, t: 10 },
        { id: 2, d: 7, t: 10 },
      ],
    }),
    section("achievements", { ids: packIds([6]) }),
  ]);
  const alt = new Map([
    section("achProgress", {
      rows: [
        { id: 1, d: 8, t: 10 },
        { id: 2, d: 8, t: 10 },
        { id: 3, d: 5, t: 10 },
        { id: 4, d: 4, t: 10 },
        { id: 6, d: 9, t: 10 },
      ],
    }),
  ]);
  assert.deepEqual(readyAlts(mine, [{ name: "Alt", sections: alt }]), [
    { achievementID: 1, character: "Alt", d: 8, t: 10 },
    { achievementID: 3, character: "Alt", d: 5, t: 10 },
  ]);
});

test("get_ready_now reads the stored Sections of a Character and its Account", () => {
  const store = makeStore();
  try {
    store.putSnapshot(
      snapshot({
        char: { body: { level: 80 } },
        achProgress: { body: { rows: [{ id: 50, d: 9, t: 10 }] } },
        vault: { body: { rewardWaiting: true, activities: [] } },
      }),
      "pc-1",
      NOW,
    );
    store.putSnapshot(
      snapshot(
        {
          char: { body: { level: 70 } },
          achProgress: { body: { rows: [{ id: 51, d: 9, t: 10 }] } },
        },
        { character: "Alt" },
      ),
      "pc-1",
      NOW,
    );
    const out = store.readyNow({ character: "Mira", realm: "Realm" }, NOW)!;
    assert.equal(out.character, "Mira");
    assert.equal(out.account, "111111");
    assert.deepEqual(
      out.items.map((item) => item.key),
      ["vault:reward", "ach:50"],
    );
    assert.deepEqual(out.alts, [{ achievementID: 51, character: "Alt", d: 9, t: 10 }]);
    assert.equal(store.readyNow({ account: "999" }, NOW), undefined);
    assert.equal(store.readyNow({ account: ACCOUNT }, NOW)?.account, "111111");
  } finally {
    store.close();
  }
});
