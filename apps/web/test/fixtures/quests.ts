import type { PublicQuest, PublicQuestChain, QuestOverlay } from "../../shared/quests";
export const questFixture: PublicQuest = {
  questID: 42,
  title: "A Beginning",
  slug: "a-beginning",
  level: 5,
  lastSeen: 1790000000,
  accept: [
    {
      npcId: 123,
      npcName: "Marshal of Northshire",
      uiMapID: 37,
      zone: "Elwynn Forest",
      x: 48.2,
      y: 42.1,
    },
  ],
  turnIn: [
    { npcId: 124, npcName: "Abbey Guard", uiMapID: 37, zone: "Elwynn Forest", x: 49.1, y: 40.3 },
  ],
};
export const chainFixture: PublicQuestChain = {
  slug: "first-steps",
  title: "First steps in Elwynn",
  faction: "Alliance",
  zone: "Elwynn Forest",
  status: "published",
  steps: [
    { questID: 42, title: "A Beginning", slug: "a-beginning" },
    { questID: 43, title: "The next visit", slug: "the-next-visit" },
  ],
};
export const questOverlayFixture: QuestOverlay = {
  character: { game: "forever", realm: "Realm", name: "Kania" },
  steps: [
    { questID: 42, done: true, inLog: false, next: false },
    { questID: 43, done: false, inLog: true, next: true },
  ],
};
