import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { cleanSnapshot } from "../src/data.ts";
import { Store } from "../src/store.ts";

export const NOW = 1_790_000_000;
export const ACCOUNT = "111111#1";
export const ACCOUNT_KEY = "111111";

export function makeStore(): Store {
  return new Store(mkdtempSync(path.join(tmpdir(), "unbored-v010-")));
}

type SectionInput = { scope?: "char" | "account"; v?: number; at?: number; body: object };

const ACCOUNT_SCOPE = new Set([
  "warband",
  "achievements",
  "mounts",
  "pets",
  "toys",
  "transmog",
  "calendar",
  "addons",
  "errors",
]);

/** A cleaned snapshot of the named Sections; scope defaults to what the addon uses. */
export function snapshot(
  sections: Record<string, SectionInput>,
  options: {
    account?: string;
    character?: string;
    realm?: string;
    savedAt?: number;
    dropped?: Record<string, Record<string, unknown>>;
  } = {},
) {
  return cleanSnapshot({
    schema: 2,
    account: options.account ?? ACCOUNT,
    character: options.character ?? "Mira",
    realm: options.realm ?? "Realm",
    savedAt: options.savedAt ?? NOW,
    sections: Object.fromEntries(
      Object.entries(sections).map(([name, section]) => [
        name,
        {
          scope: section.scope ?? (ACCOUNT_SCOPE.has(name) ? "account" : "char"),
          v: section.v ?? (name === "reputation" ? 2 : name === "calendar" ? 2 : 1),
          at: section.at ?? NOW,
          body: section.body,
        },
      ]),
    ),
    ...(options.dropped ? { dropped: options.dropped } : {}),
  });
}

/** An `idv1` Packed id set of item counts. */
export function packCounts(counts: Record<number, number>): string[] {
  let previous = 0;
  const words = Object.entries(counts)
    .map(([id, count]) => [Number(id), count] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([id, count]) => {
      const word = `${(id - previous).toString(36)}:${count.toString(36)}`;
      previous = id;
      return word;
    });
  return ["idv1", words.join(",")];
}
