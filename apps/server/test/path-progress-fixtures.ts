import { packIds } from "@unbored/contracts";
import type { ContentItem } from "../src/content.ts";

/** Independent examples of every ADR 0072 goal and the snapshot evidence for it. */
export const goalFixtures: {
  goal: Pick<ContentItem, "kind" | "name" | "id" | "standing" | "level" | "amount">;
  sections: Record<string, { body: object }>;
  accountWide: boolean;
}[] = [
  {
    goal: { kind: "mount", id: 6, name: "Brown Horse" },
    sections: { mounts: { body: { ids: packIds([6]) } } },
    accountWide: true,
  },
  {
    goal: { kind: "pet", id: 39, name: "Cat" },
    sections: { pets: { body: { species: packIds([39]) } } },
    accountWide: true,
  },
  {
    goal: { kind: "toy", id: 1973, name: "Toy" },
    sections: { toys: { body: { ids: packIds([1973]) } } },
    accountWide: true,
  },
  {
    goal: { kind: "achievement", id: 964, name: "Going Down?" },
    sections: { achievements: { body: { ids: packIds([964]) } } },
    accountWide: true,
  },
  {
    goal: { kind: "item", id: 19019, name: "Thunderfury" },
    sections: { gear: { body: { slots: [{ itemID: 19019 }] } } },
    accountWide: false,
  },
  {
    goal: { kind: "rep", id: 72, name: "Stormwind", standing: 8 },
    sections: { reputation: { body: { factions: [{ factionID: 72, reaction: 8 }] } } },
    accountWide: false,
  },
  {
    goal: { kind: "renown", id: 72, name: "Stormwind", level: 10 },
    sections: { reputation: { body: { renown: [{ factionID: 72, level: 10 }] } } },
    accountWide: false,
  },
  {
    goal: { kind: "level", name: "Level 80", level: 80 },
    sections: { char: { body: { level: 80 } } },
    accountWide: false,
  },
  {
    goal: { kind: "currency", id: 2000, name: "Test currency", amount: 50 },
    sections: { currencies: { body: { list: [{ id: 2000, quantity: 50 }] } } },
    accountWide: false,
  },
  {
    goal: { kind: "quest", id: 90001, name: "A small adventure" },
    sections: { questsDone: { body: { ids: packIds([90001]) } } },
    accountWide: false,
  },
  // Completed lines disappear from questLines; membership comes from the published build.
  {
    goal: { kind: "questLine", id: 10, name: "A new beginning" },
    sections: { questsDone: { body: { ids: packIds([90001]) } } },
    accountWide: false,
  },
];
